import type { StoreConfig } from '../../config/schema.js';
import { runRemoteGit, type ForgeCredentials } from '../forge/credentials.js';
import type { ForgeClient, PullRequest } from '../forge/github.js';
import type { GitRunner } from '../git/exec.js';
import { removeWorktree } from '../git/worktree.js';

/**
 * bring-the-session-lifecycle-into-the-cli (design.md Migration Plan, step 2):
 * the session's remote side — push, publish (push plus the pull request, found
 * by head before one is opened) and remove — moved here from the MCP surface's
 * `sessions.ts`, so `ctxr session submit`, `discard` and the MCP tools run one
 * implementation. Failures are thrown as `SessionRemoteError`, naming the step,
 * and each caller words them for its own surface.
 */

export interface RemoteDeps {
  git: GitRunner;
  config: StoreConfig;
  credentials: ForgeCredentials;
  forge: ForgeClient;
  env: Readonly<Record<string, string | undefined>>;
}

/** The worktree and branch a remote step acts on. */
export interface SessionTarget {
  path: string;
  branch: string;
}

export type PullState = { kind: 'open'; pull: PullRequest } | { kind: 'merged' } | { kind: 'closed-unmerged' } | { kind: 'none' };

export type RemoteStep = 'push' | 'pull_request';

/** A push or forge call that did not succeed; everything before it stays in place, so the same call can be retried. */
export class SessionRemoteError extends Error {
  constructor(
    readonly step: RemoteStep,
    readonly detail: string,
  ) {
    super(`${step === 'push' ? 'push' : 'pull request'} failed: ${detail}`);
    this.name = 'SessionRemoteError';
  }
}

export function firstLines(text: string, count = 6): string {
  return text.trim().split('\n').slice(0, count).join('\n');
}

/** What the forge says about the pull requests for `branch`: the open one, else merged, else closed, else none. */
export async function pullStateFor(forge: ForgeClient, branch: string): Promise<PullState> {
  const pulls = await forge.pullsForHead(branch);
  const open = pulls.find((p) => p.state === 'open');
  if (open !== undefined) return { kind: 'open', pull: open };
  if (pulls.some((p) => p.merged)) return { kind: 'merged' };
  if (pulls.length > 0) return { kind: 'closed-unmerged' };
  return { kind: 'none' };
}

/** The remote branch's tip, or null when the remote has no such branch. Throws when the remote cannot be read at all. */
export async function remoteTip(deps: RemoteDeps, cwd: string, branch: string): Promise<string | null> {
  const listed = await runRemoteGit(deps.git, deps.credentials, deps.env, ['ls-remote', 'origin', `refs/heads/${branch}`], { cwd, allowFailure: true });
  if (listed.exitCode !== 0) throw new SessionRemoteError('push', firstLines(listed.stderr, 2));
  const sha = listed.stdout.split(/\s/)[0] ?? '';
  return sha === '' ? null : sha;
}

export type PushOutcome = 'up-to-date' | 'pushed' | 'pushed-with-lease';

async function isAncestor(git: GitRunner, cwd: string, ancestor: string, descendant: string): Promise<boolean> {
  return (await git.run(['merge-base', '--is-ancestor', ancestor, descendant], { cwd, allowFailure: true })).exitCode === 0;
}

/**
 * Pushes the session's HEAD to its branch when the remote lacks it. Read
 * first, so a retry after a push whose response was lost pushes nothing. A
 * fast-forward is a plain push. A rewritten history (after `ctxr session
 * rebase`) is pushed with a lease on the remote-tracking ref this clone last
 * saw — never on the tip just read, which would overwrite a push made by
 * someone else since (bring-the-session-lifecycle-into-the-cli D3).
 */
export async function pushSession(deps: RemoteDeps, session: SessionTarget): Promise<PushOutcome> {
  const tip = (await deps.git.run(['rev-parse', 'HEAD'], { cwd: session.path })).stdout.trim();
  const remote = await remoteTip(deps, session.path, session.branch);
  if (remote === tip) return 'up-to-date';

  const args = ['push', '--quiet', 'origin', `HEAD:refs/heads/${session.branch}`];
  let outcome: PushOutcome = 'pushed';
  if (remote !== null && !(await isAncestor(deps.git, session.path, remote, tip))) {
    const seen = await deps.git.run(['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${session.branch}`], { cwd: session.path, allowFailure: true });
    const expected = seen.exitCode === 0 ? seen.stdout.trim() : '';
    if (expected !== remote) {
      throw new SessionRemoteError('push', `the remote branch "${session.branch}" is at ${remote.slice(0, 7)}, which this session has not seen; fetch it and rebase before pushing`);
    }
    args.splice(2, 0, `--force-with-lease=refs/heads/${session.branch}:${expected}`);
    outcome = 'pushed-with-lease';
  }
  const pushed = await runRemoteGit(deps.git, deps.credentials, deps.env, args, { cwd: session.path, allowFailure: true });
  if (pushed.exitCode !== 0) throw new SessionRemoteError('push', firstLines(pushed.stderr, 2));
  // Recorded as seen, so a later leased push leases on what this clone itself pushed.
  await deps.git.run(['update-ref', `refs/remotes/origin/${session.branch}`, tip], { cwd: session.path, allowFailure: true });
  return outcome;
}

export interface PublishResult {
  pull: PullRequest;
  push: PushOutcome;
  /** `created` when this call opened it, `updated` when it rewrote an open one's title or body, else `found`. */
  pullRequest: 'created' | 'updated' | 'found';
}

/**
 * Publishes whatever the session holds that the forge does not: its branch,
 * pushed when the remote lacks the local tip, and a pull request, found by
 * head before one is opened. Idempotent, so a retry after any partial failure
 * converges on exactly one pull request (serve-the-store-over-mcp D9, D13).
 * With `update`, an open pull request whose title or body differs is rewritten
 * to the given ones — how a resubmitted session answers requested changes on
 * the same pull request (bring-the-session-lifecycle-into-the-cli D3).
 */
export async function publishSession(deps: RemoteDeps, session: SessionTarget, pull: { title: string; body: string }, opts: { update?: boolean } = {}): Promise<PublishResult> {
  const push = await pushSession(deps, session);
  let state: PullState;
  try {
    state = await pullStateFor(deps.forge, session.branch);
    if (state.kind === 'open') {
      const open = state.pull;
      if (opts.update !== true || (open.title === pull.title && open.body === pull.body)) return { pull: open, push, pullRequest: 'found' };
      return { pull: await deps.forge.updatePull(open.number, { title: pull.title, body: pull.body }), push, pullRequest: 'updated' };
    }
    return { pull: await deps.forge.createPull({ head: session.branch, base: deps.config.git.default_branch, title: pull.title, body: pull.body }), push, pullRequest: 'created' };
  } catch (err) {
    throw new SessionRemoteError('pull_request', err instanceof Error ? firstLines(err.message, 2) : String(err));
  }
}

/** Removes a session: its worktree and its local branch. The remote branch and any pull request are left as they are. */
export async function removeSession(git: GitRunner, canonicalRoot: string, session: SessionTarget): Promise<void> {
  await removeWorktree(git, canonicalRoot, session.path);
  await git.run(['branch', '-D', session.branch], { cwd: canonicalRoot, allowFailure: true });
}
