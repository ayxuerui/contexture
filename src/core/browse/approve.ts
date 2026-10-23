import path from 'node:path';
import type { IncomingMessage } from 'node:http';
import type { ChangeApprovalConfig } from '../../config/schema.js';
import { pageUrlsFor } from '../../commands/publish-urls.js';
import { decisionBody, isDecider, recordPartOf, type DecisionKind, type PartRef, type SessionDecision } from '../approval/decision.js';
import { readFileDiffs, renderFileDiffs } from '../approval/file-diff.js';
import type { IdentityVerifier } from '../approval/identity.js';
import { readLandingRecord } from '../approval/landing-record.js';
import { baseRef, forgeRead, reviewStateOf, sessionPulls, sessionWorktrees } from '../approval/sessions.js';
import {
  decidersOnForge,
  groupSessions,
  listOpen,
  sessionState,
  storeLabel,
  storeReach,
  type ForgeFor,
  type SessionGroup,
  type SessionState,
  type SessionStateName,
  type SessionStore,
  type StoreListing,
  type StoreReach,
} from '../approval/session-group.js';
import { parseSessionMarker, sessionRouteName } from '../approval/session-marker.js';
import { storeForges } from '../approval/store-forges.js';
import { runRemoteGit, ghCredentials } from '../forge/credentials.js';
import { mainWorktreePath } from '../git/worktree.js';
import { randomUUID } from 'node:crypto';
import { ForgeUnreachableError } from '../errors.js';
import type { ForgeCredentials } from '../forge/credentials.js';
import type { ForgeClient, PullRequest } from '../forge/github.js';
import { ForgeRequestError } from '../forge/github.js';
import type { GitRunner } from '../git/exec.js';
import { storePrefix } from '../graph/tree.js';
import type { Store } from '../store.js';
import { packagedTemplate } from '../templates.js';
import type { LinkResolver } from './link-resolver.js';
import { escapeHtml, renderNoteBody, type RenderedBody } from './render.js';
import { configStamp, createMemo } from './memo.js';
import { renderReviewAt } from './review.js';
import { resolveRange } from '../graph/diff.js';
import type { FileDiff } from '../approval/file-diff.js';
import type { PageUrlEntry } from '../../commands/publish-urls.js';

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
  /** The credential behind `forge` — the MCP surface derives its signing key from it and pushes with its git token. */
  credentials: ForgeCredentials;
  verifier: IdentityVerifier;
  git: GitRunner;
  now(): Date;
  /**
   * approve-sessions-across-stores D8: the forge client and credential for a mounted store's clone, with the same
   * recording identity. Omitted, mounts are read with `gh`'s own credential in their clone.
   */
  forgeFor?: ForgeFor;
  /** The process environment, for an authenticated fetch of a mounted part's head. */
  env?: Readonly<Record<string, string | undefined>>;
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
  /** Set on an accepted approval: the server starts a landing run (serve-lands-approved-changes). */
  landingRequested?: boolean;
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

const STATE_LABEL: Readonly<Record<SessionStateName, string>> = {
  awaiting: 'awaiting a decision',
  approved: 'approved, landing shortly',
  'changes-requested': 'changes requested',
  'needs-reapproval': 'needs a new decision',
  blocked: 'blocked',
  retrying: 'partly landed, the rest lands on the next run',
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

/**
 * Page views reuse the open pull requests for a few seconds — the index and
 * then a change are one visit, and listing them is a forge call. A decision
 * never uses this: it drops the cache first, so the head it checks against,
 * and any page it renders after, are read fresh.
 */
const OPEN_PULLS_TTL_MS = 15_000;
const openPullsCache = new WeakMap<ApprovalServer, { at: number; pulls: Promise<PullRequest[]> }>();

function openPulls(server: ApprovalServer): Promise<PullRequest[]> {
  const now = Date.now();
  const cached = openPullsCache.get(server);
  if (cached !== undefined && now - cached.at < OPEN_PULLS_TTL_MS) return cached.pulls;
  const pulls = server.forge.openPulls();
  openPullsCache.set(server, { at: now, pulls });
  pulls.catch(() => {
    if (openPullsCache.get(server)?.pulls === pulls) openPullsCache.delete(server);
  });
  return pulls;
}

/**
 * What a change page shows that one pair of commits fixes: the commit
 * messages, the changed pages and the line diff. Keyed by worktree (preview
 * addresses carry its name), store prefix, merge base and head.
 */
interface ChangeParts {
  commits: { sha: string; message: string }[];
  pages: PageUrlEntry[];
  files: FileDiff[];
}
const changeParts = createMemo<ChangeParts>(64);

async function locate(store: Store, server: ApprovalServer, name: string): Promise<Located | null> {
  const worktree = (await sessionWorktrees(server.git, store.root, store.config)).find((w) => w.name === name);
  if (worktree === undefined) return null;
  const open = await forgeRead(() => openPulls(server));
  return { name, worktreePath: worktree.path, branch: worktree.branch, pull: open.find((p) => p.headRef === worktree.branch) ?? null };
}

async function indexPage(store: Store, server: ApprovalServer, kit: PageKit): Promise<Reply> {
  const html = [`<h1>${escapeHtml(copy('index-heading'))}</h1>`];
  try {
    // approve-sessions-across-stores: the store and its mounts, read once; a pull request without a session marker keeps today's row.
    const view = await readSessionView(store, server, false);
    const homeListing = view?.listings.find((l) => l.store === view.reach.home);
    if (homeListing?.error) throw new ForgeUnreachableError(homeListing.error);
    const homePulls = homeListing === undefined ? () => openPulls(server) : async () => homeListing.pulls!;
    const pulls = (await sessionPulls(server.git, store.root, store.config, server.forge, server.approval.recording_login, homePulls)).filter(
      (p) => parseSessionMarker(p.pull.body) === null,
    );
    const rows = pulls.map(
      (p) =>
        `<tr><td><a href="${approveRoute(p.name)}">${escapeHtml(p.name)}</a></td><td>#${p.pull.number}</td>` +
        `<td><code>${escapeHtml(p.pull.headSha.slice(0, 7))}</code></td><td>${escapeHtml(STATE_LABEL[p.review.state])}</td></tr>`,
    );
    const elsewhere: string[] = [];
    if (view !== null) {
      for (const listing of view.listings) {
        if (listing.error === null || listing.store === view.reach.home) continue;
        html.push(`<p class="ctxr-approve-notice">${escapeHtml(copy('store-unreachable').replace('__STORE__', storeLabel(listing.store)))}</p>`);
      }
      for (const group of view.groups) {
        const state = await forgeRead(() => sessionState({ git: server.git, reach: view.reach, identity: group.identity, homedHere: group.homedHere, open: group.parts, recordingLogin: server.approval.recording_login }));
        const single = group.parts.length === 1 && group.parts[0]!.store === view.reach.home;
        const partCell = group.parts.map((p) => escapeHtml(single ? `#${p.pull.number}` : `${partStore(view, p.store)} #${p.pull.number}`)).join('<br>');
        const headCell = group.parts.map((p) => `<code>${escapeHtml(p.pull.headSha.slice(0, 7))}</code>`).join('<br>');
        if (group.homedHere) {
          const name = sessionRouteName(group.identity);
          const undecidable = unreadableParts(view, state).length > 0;
          rows.push(
            `<tr><td><a href="${approveRoute(name)}">${escapeHtml(name)}</a></td><td>${partCell}</td><td>${headCell}</td>` +
              `<td>${escapeHtml(STATE_LABEL[state.state])}${undecidable ? ` (${escapeHtml(copy('session-no-decision'))})` : ''}</td></tr>`,
          );
        } else {
          elsewhere.push(
            `<tr><td>${escapeHtml(sessionRouteName(group.identity))}</td><td>${escapeHtml(group.identity.home)}</td><td>${partCell}</td><td>${headCell}</td><td>${escapeHtml(STATE_LABEL[state.state])}</td></tr>`,
          );
        }
      }
    }
    if (rows.length === 0) {
      html.push(`<p class="ctxr-empty">${escapeHtml(copy('index-empty'))}</p>`);
    } else {
      html.push(`<p>${escapeHtml(copy('index-intro'))}</p>`);
      html.push('<table class="ctxr-approve-index"><thead><tr><th>Change</th><th>Pull request</th><th>Commit</th><th>State</th></tr></thead><tbody>');
      html.push(...rows);
      html.push('</tbody></table>');
    }
    if (elsewhere.length > 0) {
      html.push(`<section class="ctxr-approve-elsewhere"><h2>${escapeHtml(copy('elsewhere-heading'))}</h2><p>${escapeHtml(copy('elsewhere-intro'))}</p>`);
      html.push('<table class="ctxr-approve-index"><thead><tr><th>Session</th><th>Home</th><th>Pull request</th><th>Commit</th><th>State</th></tr></thead><tbody>');
      html.push(...elsewhere, '</tbody></table></section>');
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

interface PartView {
  /** The checkout the part's commits are read in: a session worktree, or a clone holding the fetched head. */
  cwd: string;
  /** A directory of the repository the store prefix is computed from. */
  prefixRoot: string;
  config: Store['config'];
  /** The key the computed parts are remembered under, with the pair of commits. */
  memoName: string;
  pull: PullRequest;
  linkFor: (notePath: string) => string | null;
}

/**
 * One pull request's change as the approval page shows it: the author's account, the knowledge changes, the
 * changed pages and the line diff — the same for a single pull request and for each part of a session.
 */
async function changeSections(server: ApprovalServer, kit: PageKit, view: PartView): Promise<{ html: string[]; hasDiagram: boolean }> {
  const { pull } = view;
  const head = pull.headSha;
  const base = await baseRef(server.git, view.cwd, view.config.git.default_branch);
  const prefix = await storePrefix(server.git, view.prefixRoot);
  const worktreeStoreRoot = path.join(view.cwd, prefix);
  const mergeBase = (await resolveRange(server.git, view.cwd, base, head)).base;
  const range = `${mergeBase}..${head}`;
  const [facts, parts] = await Promise.all([
    renderReviewAt(server.git, worktreeStoreRoot, view.config, prefix, null, view.linkFor, kit.resolveLink, head),
    changeParts.get(`${configStamp(view.config)}\0${view.memoName}\0${prefix}\0${mergeBase}\0${head}`, async () => {
      const [log, pages, files] = await Promise.all([
        server.git.run(['log', '--reverse', '--no-color', '--format=%H%x1f%B%x1e', range], { cwd: view.cwd }),
        pageUrlsFor({ root: worktreeStoreRoot, config: view.config }, [range]),
        readFileDiffs(server.git, worktreeStoreRoot, mergeBase, head, view.config.derived.paths),
      ]);
      const commits = log.stdout
        .split('\x1e')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => {
          const [sha, message] = entry.split('\x1f') as [string, string];
          return { sha, message: message.trim() };
        });
      return { commits, pages, files };
    }),
  ]);
  const html: string[] = [];
  let hasDiagram = false;

  // The author's account: labelled as such, and kept apart from everything computed below.
  const authorBody = renderNoteBody(pull.body, kit.resolveLink);
  hasDiagram ||= authorBody.hasDiagram;
  const commits = parts.commits.map(
    (c) => `<li><code>${escapeHtml(c.sha.slice(0, 7))}</code><pre class="ctxr-commit-message">${escapeHtml(c.message)}</pre></li>`,
  );
  html.push(
    `<section class="ctxr-author-account"><h2>${escapeHtml(copy('author-heading'))}</h2>`,
    `<p class="ctxr-summary">${escapeHtml(copy('author-note'))}</p>`,
    `<h3>${escapeHtml(pull.title)}</h3>`,
    authorBody.html,
    `<h3>${escapeHtml(copy('commits-heading'))}</h3><ol class="ctxr-commits">${commits.join('\n')}</ol>`,
    '</section>',
  );

  hasDiagram ||= facts.hasDiagram;
  html.push(`<section class="ctxr-derived"><h2>${escapeHtml(copy('facts-heading'))}</h2>`, facts.html, '</section>');

  const pages = parts.pages;
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

  html.push(
    `<section class="ctxr-changed-files"><h2>${escapeHtml(copy('diff-heading'))}</h2>`,
    renderFileDiffs(parts.files, { binary: copy('diff-binary'), noFiles: copy('diff-empty') }),
    '</section>',
  );
  return { html, hasDiagram };
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

  // approve-sessions-across-stores: a session with a marker, homed here, has a page of its own.
  const view = await readSessionView(store, server, false).catch((err: unknown) => {
    if (err instanceof ForgeUnreachableError) return null;
    throw err;
  });
  const group = view === null ? undefined : findSession(view, name);
  if (view !== null && group !== undefined) return renderSessionPage(server, kit, view, group, html, title, notice);

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

  // The decision state is read fresh every time; everything the commits fix is computed once per pair.
  const base = await baseRef(server.git, located.worktreePath, store.config.git.default_branch);
  const [state, sections] = await Promise.all([
    forgeRead(() => reviewStateOf(server.git, located.worktreePath, base, server.forge, server.approval.recording_login, pull)),
    changeSections(server, kit, { cwd: located.worktreePath, prefixRoot: store.root, config: store.config, memoName: name, pull, linkFor: kit.linkFor }),
  ]);
  let hasDiagram = sections.hasDiagram;

  html.push(`<p>Pull request <a href="${escapeHtml(pull.url)}">#${pull.number}</a>, commit <code>${escapeHtml(head)}</code>. ${escapeHtml(copy('state-line').replace('__STATE__', STATE_LABEL[state.state]))}</p>`);
  html.push(...sections.html);

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

async function decide(store: Store, server: ApprovalServer, makeKit: () => Promise<PageKit>, req: IncomingMessage, name: string, email: string): Promise<Reply> {
  if (req.headers.origin !== server.origin) return text(403, 'cross-site decision refused');
  // A decision checks the head against the forge as it is now, never a cached list.
  openPullsCache.delete(server);
  const form = await readForm(req);
  if (form === null) return text(413, 'decision too large');
  if (form.getAll('part').length > 0) return decideSession(store, server, makeKit, form, name, email);
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
    return renderChangePage(store, server, await makeKit(), name, { status: 502, message: copy('record-failed') });
  }
  if (located === null) return text(404, 'not found');
  if (located.pull === null || located.pull.state !== 'open') return renderChangePage(store, server, await makeKit(), name, { status: 409, message: copy('not-open') });
  if (located.pull.headSha !== head) return renderChangePage(store, server, await makeKit(), name, { status: 409, movedFrom: head });
  if (decision === 'request-changes' && comment === '') return renderChangePage(store, server, await makeKit(), name, { status: 400, message: copy('comment-required') });

  const kind: DecisionKind = decision;
  try {
    await server.forge.createReview(located.pull.number, {
      event: kind === 'approve' ? 'APPROVE' : 'REQUEST_CHANGES',
      commitId: head,
      body: decisionBody({ decision: kind, head, by: email, at: server.now().toISOString(), carriedFrom: null, comment: kind === 'approve' ? null : comment }),
    });
  } catch (err) {
    if (!(err instanceof ForgeRequestError)) throw err;
    return renderChangePage(store, server, await makeKit(), name, { status: 502, message: copy('record-failed') });
  }
  // Post/redirect/get: the page the decider lands on reads the recorded state back from the forge.
  return {
    status: 303,
    contentType: 'text/plain; charset=utf-8',
    body: 'recorded\n',
    headers: { Location: approveRoute(name) },
    landingRequested: kind === 'approve',
  };
}

/** approve-sessions-across-stores: the store, its mounts, their open pull requests, and the sessions they make up. */
interface SessionView {
  reach: StoreReach;
  listings: StoreListing[];
  groups: SessionGroup[];
}

const forgeForCache = new WeakMap<ApprovalServer, ForgeFor>();

function forgeForOf(server: ApprovalServer): ForgeFor {
  if (server.forgeFor !== undefined) return server.forgeFor;
  let forgeFor = forgeForCache.get(server);
  if (forgeFor === undefined) {
    const env = server.env ?? process.env;
    forgeFor = storeForges({ env, git: server.git, now: () => server.now() }, server.forge);
    forgeForCache.set(server, forgeFor);
  }
  return forgeFor;
}

/**
 * Null when the store has no `origin` to name it by — no session can be homed in it then. `fresh` skips the
 * page-view cache of the store's own open pull requests, as a decision must.
 */
async function readSessionView(store: Store, server: ApprovalServer, fresh: boolean): Promise<SessionView | null> {
  const canonical = await mainWorktreePath(server.git, store.root);
  const reach = await storeReach(
    server.git,
    { root: store.root, canonical, config: store.config, forge: server.forge, credentials: server.credentials },
    forgeForOf(server),
  );
  if (reach === null) return null;
  const listings = await listOpen(reach, fresh ? undefined : () => openPulls(server));
  return { reach, listings, groups: groupSessions(reach, listings) };
}

/** The session homed here whose page is `name`: the home session's branch as a worktree directory name. */
function findSession(view: SessionView, name: string): SessionGroup | undefined {
  return view.groups.find((g) => g.homedHere && sessionRouteName(g.identity) === name);
}

function partStore(view: SessionView, store: SessionStore): string {
  return store === view.reach.home ? view.reach.home.slug : (store.mountName ?? store.slug);
}

/** The session's parts, named or open, on a store whose pull requests could not be read: no decision is offered then. */
function unreadableParts(view: SessionView, state: SessionState): string[] {
  const unreadable = view.listings.filter((l) => l.error !== null).map((l) => l.store.slug);
  return state.parts.filter((p) => unreadable.includes(p.storeSlug)).map((p) => `${p.storeSlug}#${p.number}`);
}

/**
 * change-approval spec ("The approval page shows every part of a session"): the
 * checkout a part's change is read in. The home store's session worktree when
 * it is here; otherwise the store's own clone, after fetching the part's head
 * into a ref namespace of this server's own (`refs/ctxr-approve/<number>`),
 * which leaves the clone's branches and working tree untouched.
 */
async function partCheckout(server: ApprovalServer, view: SessionView, store: SessionStore, pull: PullRequest): Promise<string | null> {
  if (store === view.reach.home) {
    const worktree = (await sessionWorktrees(server.git, store.root, store.config)).find((w) => w.branch === pull.headRef);
    if (worktree !== undefined) {
      const there = await server.git.run(['cat-file', '-e', `${pull.headSha}^{commit}`], { cwd: worktree.path, allowFailure: true });
      if (there.exitCode === 0) return worktree.path;
    }
  }
  const present = async (): Promise<boolean> =>
    (await server.git.run(['cat-file', '-e', `${pull.headSha}^{commit}`], { cwd: store.root, allowFailure: true })).exitCode === 0;
  if (await present()) return store.root;
  const refspec = `+refs/heads/${pull.headRef}:refs/ctxr-approve/${pull.number}`;
  const env = server.env ?? process.env;
  await runRemoteGit(server.git, store.credentials ?? ghCredentials(env), env, ['fetch', '--quiet', '--no-tags', 'origin', refspec], { cwd: store.root, allowFailure: true });
  return (await present()) ? store.root : null;
}

async function renderSessionPage(
  server: ApprovalServer,
  kit: PageKit,
  view: SessionView,
  group: SessionGroup,
  html: string[],
  title: string,
  notice: PageNotice,
): Promise<Reply> {
  let state: SessionState | null = null;
  try {
    state = await forgeRead(() =>
      sessionState({ git: server.git, reach: view.reach, identity: group.identity, homedHere: true, open: group.parts, recordingLogin: server.approval.recording_login }),
    );
  } catch (err) {
    if (!(err instanceof ForgeUnreachableError)) throw err;
  }
  let hasDiagram = false;
  html.push(`<p>${escapeHtml(copy('session-intro').replace('__COUNT__', String(group.parts.length)))}</p>`);
  if (state !== null) html.push(`<p>${escapeHtml(copy('state-line').replace('__STATE__', STATE_LABEL[state.state]))}</p>`);
  else html.push(`<p class="ctxr-approve-notice">${escapeHtml(copy('forge-unreachable'))}</p>`);
  for (const listing of view.listings) {
    if (listing.error !== null) html.push(`<p class="ctxr-approve-notice">${escapeHtml(copy('store-unreachable').replace('__STORE__', storeLabel(listing.store)))}</p>`);
  }

  let decidable = state !== null && unreadableParts(view, state).length === 0;
  const fields: string[] = [];
  // Landing order: the parts in mounted stores first, then this store's.
  for (const part of group.parts) {
    const { store, pull } = part;
    const pullLink = `<a href="${escapeHtml(pull.url)}">#${pull.number}</a>`;
    const heading = escapeHtml(copy('part-heading'))
      .replace('__STORE__', () => escapeHtml(partStore(view, store)))
      .replace('__PULL__', () => pullLink);
    html.push(`<section class="ctxr-approve-part"><h2>${heading}</h2>`, `<p>Commit <code>${escapeHtml(pull.headSha)}</code>.</p>`);
    const cwd = await partCheckout(server, view, store, pull);
    if (cwd === null) {
      decidable = false;
      html.push(`<p class="ctxr-approve-notice">${escapeHtml(copy('head-missing')).replace('__HEAD__', () => `<code>${escapeHtml(pull.headSha)}</code>`)}</p>`, '</section>');
      continue;
    }
    const location = store.mountName === null ? null : `shared/${store.mountName}`;
    const sections = await changeSections(server, kit, {
      cwd,
      prefixRoot: store.root,
      config: store.config,
      memoName: `${store.slug}#${pull.number}`,
      pull,
      linkFor: location === null ? kit.linkFor : (notePath) => kit.linkFor(`${location}/${notePath}`),
    });
    hasDiagram ||= sections.hasDiagram;
    html.push(...sections.html, '</section>');
    fields.push(`<input type="hidden" name="part" value="${escapeHtml(`${store.slug}#${pull.number}@${pull.headSha}`)}">`);
  }

  if (!decidable) {
    html.push(`<section class="ctxr-decision"><h2>${escapeHtml(copy('decision-heading'))}</h2><p class="ctxr-approve-notice">${escapeHtml(copy('session-no-decision'))}</p></section>`);
  } else {
    const action = `${approveRoute(sessionRouteName(group.identity))}decision`;
    const hidden = fields.join('');
    html.push(
      `<section class="ctxr-decision"><h2>${escapeHtml(copy('decision-heading'))}</h2><p>${escapeHtml(copy('session-decision-note'))}</p>`,
      `<form method="post" action="${action}"><input type="hidden" name="decision" value="approve">${hidden}<button type="submit">${escapeHtml(copy('approve-button'))}</button></form>`,
      `<form method="post" action="${action}"><input type="hidden" name="decision" value="request-changes">${hidden}` +
        `<label for="ctxr-comment">${escapeHtml(copy('comment-label'))}</label><textarea id="ctxr-comment" name="comment" rows="5" required></textarea>` +
        `<button type="submit">${escapeHtml(copy('request-changes-button'))}</button></form>`,
      '</section>',
    );
  }
  return { status: notice.status ?? 200, contentType: 'text/html; charset=utf-8', body: await kit.page(title, { html: html.join('\n'), hasDiagram }) };
}

const PART_FIELD = /^([^/#@\s]+\/[^/#@\s]+)#(\d+)@([0-9a-f]{40})$/;

/**
 * change-approval spec ("A session is decided only on its home store's page,
 * for every part it names"): the parts posted must be exactly the session's
 * open parts at the heads the page showed, every store they are on must be
 * readable, and the decider must be a decider of every one of those stores.
 * Anything else records nothing. An accepted decision gets one id; its record
 * review goes on the record part first, then a copy on every other part. A
 * copy that fails leaves the decision standing, and the reply says which.
 */
async function decideSession(store: Store, server: ApprovalServer, makeKit: () => Promise<PageKit>, form: URLSearchParams, name: string, email: string): Promise<Reply> {
  const decision = form.get('decision');
  const comment = (form.get('comment') ?? '').trim();
  const posted: PartRef[] = [];
  for (const value of form.getAll('part')) {
    const m = PART_FIELD.exec(value);
    if (m === null) return text(400, 'malformed decision');
    posted.push({ store: m[1]!, number: Number.parseInt(m[2]!, 10), head: m[3]! });
  }
  if (decision !== 'approve' && decision !== 'request-changes') return text(400, 'malformed decision');
  if (comment.length > MAX_COMMENT_CHARS) return text(413, 'comment too long');

  const view = await readSessionView(store, server, true);
  if (view === null) return text(404, 'not found');
  const page = async (notice: PageNotice): Promise<Reply> => renderChangePage(store, server, await makeKit(), name, notice);
  const elsewhere = view.groups.find((g) => !g.homedHere && sessionRouteName(g.identity) === name);
  if (elsewhere !== undefined) return text(409, copy('homed-elsewhere').replace('__HOME__', elsewhere.identity.home));
  const group = findSession(view, name);
  if (group === undefined) return text(404, 'not found');

  const postedStores = new Set(posted.map((p) => p.store));
  const unreadable = view.listings.find((l) => l.error !== null && (postedStores.has(l.store.slug) || l.store === view.reach.home));
  if (unreadable !== undefined) return page({ status: 502, message: copy('store-unreachable').replace('__STORE__', storeLabel(unreadable.store)) });

  const current = group.parts.map((p) => `${p.store.slug}#${p.pull.number}@${p.pull.headSha}`).sort();
  const sent = posted.map((p) => `${p.store}#${p.number}@${p.head}`).sort();
  if (current.length !== sent.length || current.some((c, i) => c !== sent[i])) return page({ status: 409, message: copy('parts-changed') });
  if (decision === 'request-changes' && comment === '') return page({ status: 400, message: copy('comment-required') });

  // D5: every store the session changes must count this person among its deciders, read from the forge now.
  for (const part of group.parts) {
    if (part.store === view.reach.home) continue;
    let deciders: string[];
    try {
      deciders = await decidersOnForge(server.git, part.store);
    } catch (err) {
      if (!(err instanceof ForgeRequestError)) throw err;
      return page({ status: 502, message: copy('record-failed') });
    }
    if (!isDecider(email, deciders)) return page({ status: 403, message: copy('not-decider').replace('__STORE__', storeLabel(part.store)) });
  }

  const kind: DecisionKind = decision;
  const at = server.now().toISOString();
  const parts: PartRef[] = group.parts.map((p) => ({ store: p.store.slug, number: p.pull.number, head: p.pull.headSha }));
  const session: SessionDecision = { id: randomUUID(), session: group.identity, parts };
  const record = recordPartOf(session);
  const post = async (ref: PartRef): Promise<void> => {
    const part = group.parts.find((p) => p.store.slug === ref.store && p.pull.number === ref.number)!;
    await part.store.forge.createReview(ref.number, {
      event: kind === 'approve' ? 'APPROVE' : 'REQUEST_CHANGES',
      commitId: ref.head,
      body: decisionBody({ decision: kind, head: ref.head, by: email, at, carriedFrom: null, comment: kind === 'approve' ? null : comment, session }),
    });
  };
  try {
    await post(record);
  } catch (err) {
    if (!(err instanceof ForgeRequestError)) throw err;
    return page({ status: 502, message: copy('record-failed') });
  }
  const missing: string[] = [];
  for (const ref of parts) {
    if (ref === record) continue;
    try {
      await post(ref);
    } catch (err) {
      if (!(err instanceof ForgeRequestError)) throw err;
      missing.push(`${ref.store}#${ref.number}`);
    }
  }
  if (missing.length > 0) {
    const reply = await page({ status: 200, message: copy('copies-missing').replace('__PARTS__', missing.join(', ')) });
    return { ...reply, landingRequested: kind === 'approve' };
  }
  return {
    status: 303,
    contentType: 'text/plain; charset=utf-8',
    body: 'recorded\n',
    headers: { Location: approveRoute(name) },
    landingRequested: kind === 'approve',
  };
}

/**
 * Answers every request under the approval prefix. `server` is null when the
 * store declares no change approval, and then every such path is `404` —
 * unless `unavailable` says the block is declared but its surface could not be
 * built after startup (serve-follows-config-changes D4), and then every such
 * path is `503`, naming why. `makeKit` builds the browsing surface's shell only
 * after the requester is known.
 */
export async function handleApprove(
  store: Store,
  server: ApprovalServer | null,
  req: IncomingMessage,
  method: string,
  pathname: string,
  makeKit: () => Promise<PageKit>,
  unavailable: string | null = null,
): Promise<Reply> {
  if (server === null && unavailable !== null) return text(503, `the approval page is unavailable: ${unavailable}`);
  if (server === null) return text(404, 'not found');

  const verified = await server.verifier.verify(req.headers[server.approval.identity.header.toLowerCase()]);
  if (!verified.ok) return text(401, 'a verified identity assertion is required');
  if (!isDecider(verified.email, server.approval.deciders)) return text(403, 'this identity may not decide on changes here');

  const decisionMatch = DECISION_ROUTE.exec(pathname);
  if (method === 'POST') {
    if (decisionMatch === null) return text(405, 'method not allowed');
    // The shell reads the whole store, and an accepted decision only redirects, so it is built on the error paths alone.
    return decide(store, server, makeKit, req, decisionMatch[1]!, verified.email);
  }
  if (pathname === '/approve' || pathname === APPROVE_ROUTE_PREFIX) return indexPage(store, server, await makeKit());
  const pageMatch = PAGE_ROUTE.exec(pathname);
  if (pageMatch === null) return text(404, 'not found');
  return renderChangePage(store, server, await makeKit(), pageMatch[1]!);
}
