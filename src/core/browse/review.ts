import path from 'node:path';
import type { GitRunner } from '../git/exec.js';
import { renderDiffParts } from '../graph/diff-document.js';
import { computeGraphDelta, resolveRange, type GraphDelta } from '../graph/diff.js';
import { storePrefix } from '../graph/tree.js';
import type { Store } from '../store.js';
import { packagedTemplate } from '../templates.js';
import type { LinkResolver } from './link-resolver.js';
import { configStamp, createMemo } from './memo.js';
import { escapeHtml, renderNoteBody, type RenderedBody } from './render.js';

/**
 * The delta for one (store prefix, base, head) — commits are immutable, and the
 * server's configuration is fixed for its lifetime, so the result never goes
 * stale. Reading every note on both sides is the slowest thing a review or
 * approval page does.
 */
const deltas = createMemo<GraphDelta>(64);

/**
 * context-browsing spec (review-the-knowledge-diff D5, D6): one session
 * worktree's knowledge changes, derived from the delta `ctxr graph diff`
 * computes for that worktree's `HEAD` against the default branch — `origin/`
 * plus it when that ref exists, else the local branch, and never a fetch.
 * Nothing an agent wrote about the change is read: no commit message, no pull
 * request body, no file the change adds for the purpose.
 *
 * `until` names the head to compare (the approval page passes the pull
 * request's head); the worktree's `HEAD` otherwise.
 *
 * Both sides come from git's object store, so the worktree's uncommitted work
 * is neither shown nor touched. A path links to the note route only when this
 * server's note route answers for it, so a worktree-only note stays text and
 * the view widens nothing the note route serves.
 */
export async function renderReview(
  git: GitRunner,
  store: Store,
  worktree: string,
  recordedHead: string | null,
  linkFor: (notePath: string) => string | null,
  resolveLink: LinkResolver,
  until?: string,
): Promise<RenderedBody> {
  const prefix = await storePrefix(git, store.root);
  const worktreeStoreRoot = path.join(store.root, store.config.session.worktrees_path, worktree, prefix);
  return renderReviewAt(git, worktreeStoreRoot, store.config, prefix, recordedHead, linkFor, resolveLink, until);
}

/**
 * The same view for a store root inside any checkout of the repository — a mounted store's clone, where a part of
 * a session homed elsewhere has no worktree (approve-sessions-across-stores). `until` names the head to compare.
 */
export async function renderReviewAt(
  git: GitRunner,
  worktreeStoreRoot: string,
  config: Store['config'],
  prefix: string,
  recordedHead: string | null,
  linkFor: (notePath: string) => string | null,
  resolveLink: LinkResolver,
  until?: string,
): Promise<RenderedBody> {
  const store = { config };
  const defaultBranch = store.config.git.default_branch;
  const remote = await git.run(['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${defaultBranch}`], {
    cwd: worktreeStoreRoot,
    allowFailure: true,
  });
  const since = remote.exitCode === 0 ? `origin/${defaultBranch}` : defaultBranch;
  const range = await resolveRange(git, worktreeStoreRoot, since, until);
  const delta = await deltas.get(`${configStamp(store.config)}\0${prefix}\0${range.base}\0${range.head}`, () => computeGraphDelta(git, worktreeStoreRoot, range, store.config));

  const html: string[] = [];
  if (recordedHead !== null && recordedHead !== delta.head) {
    const notice = escapeHtml(packagedTemplate('graph/review', 'moved-head'))
      .replace('__RECORDED__', () => `<code>${escapeHtml(recordedHead)}</code>`)
      .replace('__CURRENT__', () => `<code>${escapeHtml(delta.head)}</code>`);
    html.push(`<p class="ctxr-review-moved">${notice}</p>`);
  }
  // render-diagrams-in-notes: the delta's diagram draws like a note's, so the page carries the renderer when any part has one.
  let hasDiagram = false;
  for (const part of renderDiffParts(delta, { linkFor, diagram: true })) {
    const rendered = renderNoteBody(part.text, resolveLink);
    hasDiagram ||= rendered.hasDiagram;
    html.push(part.kind === 'markdown' ? rendered.html : `<details><summary>${escapeHtml(part.summary)}</summary>\n${rendered.html}</details>\n`);
  }
  return { html: html.join('\n'), hasDiagram };
}

