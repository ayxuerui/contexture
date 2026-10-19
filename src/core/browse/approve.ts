import path from 'node:path';
import type { IncomingMessage } from 'node:http';
import type { ChangeApprovalConfig } from '../../config/schema.js';
import { pageUrlsFor } from '../../commands/publish-urls.js';
import { decisionBody, isDecider, type DecisionKind, type ReviewStateName } from '../approval/decision.js';
import { readFileDiffs, renderFileDiffs } from '../approval/file-diff.js';
import type { IdentityVerifier } from '../approval/identity.js';
import { readLandingRecord } from '../approval/landing-record.js';
import { baseRef, forgeRead, reviewStateOf, sessionPulls, sessionWorktrees } from '../approval/sessions.js';
import { ForgeUnreachableError } from '../errors.js';
import type { ForgeClient, PullRequest } from '../forge/github.js';
import { ForgeRequestError } from '../forge/github.js';
import type { GitRunner } from '../git/exec.js';
import { storePrefix } from '../graph/tree.js';
import type { Store } from '../store.js';
import { packagedTemplate } from '../templates.js';
import type { LinkResolver } from './link-resolver.js';
import { escapeHtml, renderNoteBody, type RenderedBody } from './render.js';
import { renderReview } from './review.js';

/**
 * change-approval spec: the approval index, one session's approval page, and
 * the one route on this server that admits `POST`. Every path under the prefix
 * is answered here, and only after the identity assertion verifies — nothing
 * about the store or the forge is read before that.
 */
export const APPROVE_ROUTE_PREFIX = '/approve/';
const DECISION_ROUTE = /^\/approve\/([^/]+)\/decision$/;
const PAGE_ROUTE = /^\/approve\/([^/]+)\/?$/;
const SHA = /^[0-9a-f]{40}$/;
const MAX_FORM_BYTES = 64 * 1024;
const MAX_COMMENT_CHARS = 20_000;

export interface ApprovalServer {
  approval: ChangeApprovalConfig;
  /** The origin of `serve.base_url`, which a decision's `Origin` header must equal (design.md D9). */
  origin: string;
  forge: ForgeClient;
  verifier: IdentityVerifier;
  git: GitRunner;
  now(): Date;
}

/** What a route needs from the browsing surface once the requester is known: the shell, and note links. */
export interface PageKit {
  page(title: string, body: RenderedBody): Promise<string>;
  linkFor(notePath: string): string | null;
  resolveLink: LinkResolver;
}

export interface Reply {
  status: number;
  contentType: string;
  body: string;
  headers?: Record<string, string>;
}

const text = (status: number, message: string): Reply => ({ status, contentType: 'text/plain; charset=utf-8', body: `${message}\n` });

function copy(name: string): string {
  return packagedTemplate('approve', name);
}

export function isApprovePath(pathname: string): boolean {
  return pathname === '/approve' || pathname.startsWith(APPROVE_ROUTE_PREFIX);
}

export function isDecisionRoute(pathname: string): boolean {
  return DECISION_ROUTE.test(pathname);
}

function approveRoute(name: string): string {
  return `${APPROVE_ROUTE_PREFIX}${encodeURIComponent(name)}/`;
}

const STATE_LABEL: Readonly<Record<ReviewStateName, string>> = {
  awaiting: 'awaiting a decision',
  approved: 'approved, landing shortly',
  'changes-requested': 'changes requested',
  'needs-reapproval': 'needs a new decision',
  blocked: 'blocked',
};

async function readForm(req: IncomingMessage): Promise<URLSearchParams | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > MAX_FORM_BYTES) return null;
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

interface Located {
  name: string;
  worktreePath: string;
  branch: string;
  pull: PullRequest | null;
}

async function locate(store: Store, server: ApprovalServer, name: string): Promise<Located | null> {
  const worktree = (await sessionWorktrees(server.git, store.root, store.config)).find((w) => w.name === name);
  if (worktree === undefined) return null;
  const open = await forgeRead(() => server.forge.openPulls());
  return { name, worktreePath: worktree.path, branch: worktree.branch, pull: open.find((p) => p.headRef === worktree.branch) ?? null };
}

async function indexPage(store: Store, server: ApprovalServer, kit: PageKit): Promise<Reply> {
  const html = [`<h1>${escapeHtml(copy('index-heading'))}</h1>`];
  try {
    const pulls = await sessionPulls(server.git, store.root, store.config, server.forge, server.approval.recording_login);
    if (pulls.length === 0) {
      html.push(`<p class="ctxr-empty">${escapeHtml(copy('index-empty'))}</p>`);
    } else {
      html.push(`<p>${escapeHtml(copy('index-intro'))}</p>`);
      html.push('<table class="ctxr-approve-index"><thead><tr><th>Change</th><th>Pull request</th><th>Commit</th><th>State</th></tr></thead><tbody>');
      for (const p of pulls) {
        html.push(
          `<tr><td><a href="${approveRoute(p.name)}">${escapeHtml(p.name)}</a></td><td>#${p.pull.number}</td>` +
            `<td><code>${escapeHtml(p.pull.headSha.slice(0, 7))}</code></td><td>${escapeHtml(STATE_LABEL[p.review.state])}</td></tr>`,
        );
      }
      html.push('</tbody></table>');
    }
  } catch (err) {
    if (!(err instanceof ForgeUnreachableError)) throw err;
    html.push(`<p class="ctxr-approve-notice">${escapeHtml(copy('forge-unreachable'))}</p>`);
  }
  return { status: 200, contentType: 'text/html; charset=utf-8', body: await kit.page('approve', { html: html.join('\n'), hasDiagram: false }) };
}

interface PageNotice {
  status?: number;
  /** A plain sentence shown above the page. */
  message?: string;
  /** The head the decider saw, when it is no longer the head. */
  movedFrom?: string;
}

async function renderChangePage(store: Store, server: ApprovalServer, kit: PageKit, name: string, notice: PageNotice = {}): Promise<Reply> {
  const title = `approve — ${name}`;
  const shell = async (status: number, parts: string[], hasDiagram = false): Promise<Reply> => ({
    status,
    contentType: 'text/html; charset=utf-8',
    body: await kit.page(title, { html: parts.join('\n'), hasDiagram }),
  });
  const html = [`<h1>${escapeHtml(name)}</h1>`];
  if (notice.message !== undefined) html.push(`<p class="ctxr-approve-notice">${escapeHtml(notice.message)}</p>`);

  let located: Located | null;
  try {
    located = await locate(store, server, name);
  } catch (err) {
    if (!(err instanceof ForgeUnreachableError)) throw err;
    return shell(notice.status ?? 200, [...html, `<p class="ctxr-approve-notice">${escapeHtml(copy('forge-unreachable'))}</p>`]);
  }
  if (located === null) {
    const record = await readLandingRecord(store.root, name);
    if (record === null) return text(404, 'not found');
    const landed = escapeHtml(copy('landed'))
      .replace('__PR__', () => String(record.pull_request))
      .replace('__COMMIT__', () => `<code>${escapeHtml(record.merged_commit ?? 'unknown')}</code>`);
    return shell(200, [...html, `<p>${landed}</p>`]);
  }
  if (located.pull === null) return shell(notice.status ?? 200, [...html, `<p class="ctxr-empty">${escapeHtml(copy('no-pull'))}</p>`]);

  const pull = located.pull;
  const head = pull.headSha;
  if (notice.movedFrom !== undefined) {
    const moved = escapeHtml(copy('moved-head'))
      .replace('__RECORDED__', () => `<code>${escapeHtml(notice.movedFrom!)}</code>`)
      .replace('__CURRENT__', () => `<code>${escapeHtml(head)}</code>`);
    html.push(`<p class="ctxr-review-moved">${moved}</p>`);
  }
  const present = await server.git.run(['cat-file', '-e', `${head}^{commit}`], { cwd: located.worktreePath, allowFailure: true });
  if (present.exitCode !== 0) {
    return shell(notice.status ?? 200, [...html, `<p class="ctxr-approve-notice">${escapeHtml(copy('head-missing')).replace('__HEAD__', () => `<code>${escapeHtml(head)}</code>`)}</p>`]);
  }

  const base = await baseRef(server.git, located.worktreePath, store.config.git.default_branch);
  const prefix = await storePrefix(server.git, store.root);
  const worktreeStoreRoot = path.join(located.worktreePath, prefix);
  const state = await forgeRead(() => reviewStateOf(server.git, located.worktreePath, base, server.forge, server.approval.recording_login, pull));
  let hasDiagram = false;

  html.push(`<p>Pull request <a href="${escapeHtml(pull.url)}">#${pull.number}</a>, commit <code>${escapeHtml(head)}</code>. ${escapeHtml(copy('state-line').replace('__STATE__', STATE_LABEL[state.state]))}</p>`);

  // The author's account: labelled as such, and kept apart from everything computed below.
  const authorBody = renderNoteBody(pull.body, kit.resolveLink);
  hasDiagram ||= authorBody.hasDiagram;
  const log = await server.git.run(['log', '--reverse', '--no-color', '--format=%H%x1f%B%x1e', `${base}..${head}`], { cwd: located.worktreePath });
  const commits = log.stdout
    .split('\x1e')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [sha, message] = entry.split('\x1f') as [string, string];
      return `<li><code>${escapeHtml(sha.slice(0, 7))}</code><pre class="ctxr-commit-message">${escapeHtml(message.trim())}</pre></li>`;
    });
  html.push(
    `<section class="ctxr-author-account"><h2>${escapeHtml(copy('author-heading'))}</h2>`,
    `<p class="ctxr-summary">${escapeHtml(copy('author-note'))}</p>`,
    `<h3>${escapeHtml(pull.title)}</h3>`,
    authorBody.html,
    `<h3>${escapeHtml(copy('commits-heading'))}</h3><ol class="ctxr-commits">${commits.join('\n')}</ol>`,
    '</section>',
  );

  const facts = await renderReview(store, name, null, kit.linkFor, kit.resolveLink, head);
  hasDiagram ||= facts.hasDiagram;
  html.push(`<section class="ctxr-derived"><h2>${escapeHtml(copy('facts-heading'))}</h2>`, facts.html, '</section>');

  const pages = await pageUrlsFor({ root: worktreeStoreRoot, config: store.config }, [`${base}...${head}`]);
  if (pages.length > 0) {
    const link = (address: { route: string; url: string | null } | null): string =>
      address === null ? '—' : `<a href="${escapeHtml(address.url ?? address.route)}">${escapeHtml(address.url ?? address.route)}</a>`;
    const rows = pages.map(
      (p) =>
        `<tr><td>${escapeHtml(p.status)}</td><td>${escapeHtml(p.lifespan)}</td><td><code>${escapeHtml(p.path)}</code></td>` +
        `<td>${p.status === 'removed' ? '—' : link(p.preview)}</td><td>${link(p.published)}</td></tr>`,
    );
    html.push(
      `<section class="ctxr-pages"><h2>${escapeHtml(copy('pages-heading'))}</h2><p class="ctxr-summary">${escapeHtml(copy('pages-note'))}</p>`,
      `<table><thead><tr><th>Status</th><th>Lifespan</th><th>Page</th><th>Preview</th><th>Published</th></tr></thead><tbody>${rows.join('')}</tbody></table></section>`,
    );
  }

  const files = await readFileDiffs(server.git, worktreeStoreRoot, base, head, store.config.derived.paths);
  html.push(
    `<section class="ctxr-changed-files"><h2>${escapeHtml(copy('diff-heading'))}</h2>`,
    renderFileDiffs(files, { binary: copy('diff-binary'), noFiles: copy('diff-empty') }),
    '</section>',
  );

  const action = `${approveRoute(name)}decision`;
  const note = escapeHtml(copy('decision-note')).replace('__HEAD__', () => `<code>${escapeHtml(head.slice(0, 7))}</code>`);
  html.push(
    `<section class="ctxr-decision"><h2>${escapeHtml(copy('decision-heading'))}</h2><p>${note}</p>`,
    `<form method="post" action="${action}"><input type="hidden" name="decision" value="approve"><input type="hidden" name="head" value="${head}"><button type="submit">${escapeHtml(copy('approve-button'))}</button></form>`,
    `<form method="post" action="${action}"><input type="hidden" name="decision" value="request-changes"><input type="hidden" name="head" value="${head}">` +
      `<label for="ctxr-comment">${escapeHtml(copy('comment-label'))}</label><textarea id="ctxr-comment" name="comment" rows="5" required></textarea>` +
      `<button type="submit">${escapeHtml(copy('request-changes-button'))}</button></form>`,
    '</section>',
  );
  return shell(notice.status ?? 200, html, hasDiagram);
}

async function decide(store: Store, server: ApprovalServer, kit: PageKit, req: IncomingMessage, name: string, email: string): Promise<Reply> {
  if (req.headers.origin !== server.origin) return text(403, 'cross-site decision refused');
  const form = await readForm(req);
  if (form === null) return text(413, 'decision too large');
  const decision = form.get('decision');
  const head = form.get('head') ?? '';
  const comment = (form.get('comment') ?? '').trim();
  if ((decision !== 'approve' && decision !== 'request-changes') || !SHA.test(head)) return text(400, 'malformed decision');
  if (comment.length > MAX_COMMENT_CHARS) return text(413, 'comment too long');

  let located: Located | null;
  try {
    located = await locate(store, server, name);
  } catch (err) {
    if (!(err instanceof ForgeUnreachableError)) throw err;
    return renderChangePage(store, server, kit, name, { status: 502, message: copy('record-failed') });
  }
  if (located === null) return text(404, 'not found');
  if (located.pull === null || located.pull.state !== 'open') return renderChangePage(store, server, kit, name, { status: 409, message: copy('not-open') });
  if (located.pull.headSha !== head) return renderChangePage(store, server, kit, name, { status: 409, movedFrom: head });
  if (decision === 'request-changes' && comment === '') return renderChangePage(store, server, kit, name, { status: 400, message: copy('comment-required') });

  const kind: DecisionKind = decision;
  try {
    await server.forge.createReview(located.pull.number, {
      event: kind === 'approve' ? 'APPROVE' : 'REQUEST_CHANGES',
      commitId: head,
      body: decisionBody({ decision: kind, head, by: email, at: server.now().toISOString(), carriedFrom: null, comment: kind === 'approve' ? null : comment }),
    });
  } catch (err) {
    if (!(err instanceof ForgeRequestError)) throw err;
    return renderChangePage(store, server, kit, name, { status: 502, message: copy('record-failed') });
  }
  // Post/redirect/get: the page the decider lands on reads the recorded state back from the forge.
  return { status: 303, contentType: 'text/plain; charset=utf-8', body: 'recorded\n', headers: { Location: approveRoute(name) } };
}

/**
 * Answers every request under the approval prefix. `server` is null when the
 * store declares no change approval, and then every such path is `404`.
 * `makeKit` builds the browsing surface's shell only after the requester is known.
 */
export async function handleApprove(
  store: Store,
  server: ApprovalServer | null,
  req: IncomingMessage,
  method: string,
  pathname: string,
  makeKit: () => Promise<PageKit>,
): Promise<Reply> {
  if (server === null) return text(404, 'not found');

  const verified = await server.verifier.verify(req.headers[server.approval.identity.header.toLowerCase()]);
  if (!verified.ok) return text(401, 'a verified identity assertion is required');
  if (!isDecider(verified.email, server.approval.deciders)) return text(403, 'this identity may not decide on changes here');

  const decisionMatch = DECISION_ROUTE.exec(pathname);
  if (method === 'POST') {
    if (decisionMatch === null) return text(405, 'method not allowed');
    return decide(store, server, await makeKit(), req, decisionMatch[1]!, verified.email);
  }
  if (pathname === '/approve' || pathname === APPROVE_ROUTE_PREFIX) return indexPage(store, server, await makeKit());
  const pageMatch = PAGE_ROUTE.exec(pathname);
  if (pageMatch === null) return text(404, 'not found');
  return renderChangePage(store, server, await makeKit(), pageMatch[1]!);
}
