import path from 'node:path';
import type { StoreConfig } from '../../config/schema.js';
import { runRemoteGit, type ForgeCredentials } from '../forge/credentials.js';
import type { ForgeClient, PullRequest } from '../forge/github.js';
import type { GitResult, GitRunner } from '../git/exec.js';
import { addWorktree, removeWorktree } from '../git/worktree.js';
import { generateSessionBranchName, listSessionWorktreeDirs, sessionLabelFromDirName, sessionLabelSlug, worktreePathFor } from '../session.js';

/**
 * serve-the-store-over-mcp design.md D9, D13: the write side the MCP surface
 * shares between `capture` and the member drafts. Everything it writes is an
 * ordinary session — a worktree under the configured worktrees path, on a
 * branch under the session prefix, with a pull request — so the approval page
 * lists it and `ctxr land` lands it with no MCP-specific path anywhere.
 */

export interface WriteDeps {
  git: GitRunner;
  /** The store root `serve` was started on: where sessions are started, as `ctxr session start` starts them. */
  canonicalRoot: string;
  config: StoreConfig;
  credentials: ForgeCredentials;
  forge: ForgeClient;
  env: Readonly<Record<string, string | undefined>>;
  now(): Date;
  /** `change_approval.recording_login`: the committer when the host has no git identity, as `ctxr land` does. */
  recordingLogin: string;
  /** `serve.base_url`, for the approval page address a tool returns. */
  baseUrl: string;
  /** The store root's path inside its repository, when the caller has already resolved it; asked of git otherwise. */
  repoPrefix?: string;
}

export interface Session {
  /** The worktree directory's name: the key the approval page addresses it by. */
  name: string;
  path: string;
  branch: string;
  label: string | null;
}

export type PullState = { kind: 'open'; pull: PullRequest } | { kind: 'merged' } | { kind: 'closed-unmerged' } | { kind: 'none' };

export class WriteRefusal extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'WriteRefusal';
  }
}

/** One write at a time across `capture`, `Edit` and `Write` (design.md D9, D13). */
export class Mutex {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.tail.then(fn, fn);
    this.tail = next.catch(() => undefined);
    return next;
  }
}

function firstLines(text: string, count = 6): string {
  return text.trim().split('\n').slice(0, count).join('\n');
}

export function approvalUrl(deps: WriteDeps, session: Session): string {
  return `${deps.baseUrl.replace(/\/+$/, '')}/approve/${encodeURIComponent(session.name)}`;
}

/** The session worktrees on disk whose label starts with `labelPrefix`, with their branches. */
export async function sessionsLabelled(deps: WriteDeps, labelPrefix: string): Promise<Session[]> {
  const root = path.join(deps.canonicalRoot, deps.config.session.worktrees_path);
  const sessions: Session[] = [];
  for (const name of await listSessionWorktreeDirs(deps.canonicalRoot, deps.config)) {
    const label = sessionLabelFromDirName(deps.config, name);
    if (label === null || !label.startsWith(labelPrefix)) continue;
    const dir = path.join(root, name);
    const branch = (await deps.git.run(['symbolic-ref', '--short', 'HEAD'], { cwd: dir, allowFailure: true })).stdout.trim();
    if (branch === '') continue;
    sessions.push({ name, path: dir, branch, label });
  }
  return sessions.sort((a, b) => (a.name < b.name ? -1 : 1));
}

/** What the forge says about the pull requests for `branch`: the open one, else merged, else closed, else none. */
export async function pullStateFor(deps: WriteDeps, branch: string): Promise<PullState> {
  const pulls = await deps.forge.pullsForHead(branch);
  const open = pulls.find((p) => p.state === 'open');
  if (open !== undefined) return { kind: 'open', pull: open };
  if (pulls.some((p) => p.merged)) return { kind: 'merged' };
  if (pulls.length > 0) return { kind: 'closed-unmerged' };
  return { kind: 'none' };
}

/** A session whose pull request was closed without merging is removed: worktree and local branch (D9, D13). */
export async function removeSession(deps: WriteDeps, session: Session): Promise<void> {
  await removeWorktree(deps.git, deps.canonicalRoot, session.path);
  await deps.git.run(['branch', '-D', session.branch], { cwd: deps.canonicalRoot, allowFailure: true });
}

/** A new session from the freshly fetched default branch, exactly as `ctxr session start` names and places one. */
export async function startSession(deps: WriteDeps, label: string): Promise<Session> {
  const slug = sessionLabelSlug(label);
  const defaultBranch = deps.config.git.default_branch;
  await runRemoteGit(deps.git, deps.credentials, deps.env, ['fetch', '--quiet', 'origin', `+refs/heads/${defaultBranch}:refs/remotes/origin/${defaultBranch}`], {
    cwd: deps.canonicalRoot,
    allowFailure: true,
  });
  const hasRemote = (await deps.git.run(['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${defaultBranch}`], { cwd: deps.canonicalRoot, allowFailure: true })).exitCode === 0;
  // Names carry a timestamp to the second, and a closed pull request's branch stays on the remote: step past any taken name.
  let branch = generateSessionBranchName(deps.config, deps.now(), slug);
  for (let step = 1; step <= 60 && (await branchTaken(deps, branch)); step += 1) {
    branch = generateSessionBranchName(deps.config, new Date(deps.now().getTime() + step * 1000), slug);
  }
  const dir = worktreePathFor({ root: deps.canonicalRoot, config: deps.config }, branch);
  const added = await addWorktree(deps.git, deps.canonicalRoot, dir, branch, hasRemote ? `origin/${defaultBranch}` : defaultBranch, { allowFailure: true });
  if (added.exitCode !== 0) throw new WriteRefusal('mcp.session_not_started', `A session could not be started: ${firstLines(added.stderr)}`);
  return { name: path.basename(dir), path: dir, branch, label: slug };
}

async function branchTaken(deps: WriteDeps, branch: string): Promise<boolean> {
  const local = await deps.git.run(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], { cwd: deps.canonicalRoot, allowFailure: true });
  if (local.exitCode === 0) return true;
  const remote = await runRemoteGit(deps.git, deps.credentials, deps.env, ['ls-remote', '--exit-code', 'origin', `refs/heads/${branch}`], { cwd: deps.canonicalRoot, allowFailure: true });
  return remote.exitCode === 0;
}

/** The store-relative path's location inside the repository, for `git show <branch>:<path>`. */
export async function repoPathOf(deps: WriteDeps, storeRelative: string): Promise<string> {
  const prefix = deps.repoPrefix ?? (await deps.git.run(['rev-parse', '--show-prefix'], { cwd: deps.canonicalRoot, allowFailure: true })).stdout.trim();
  return `${prefix}${storeRelative}`;
}

/** The committer: the host's git identity when it has one, else the recording login's noreply address, as `ctxr land` falls back. */
async function committerEnv(deps: WriteDeps, cwd: string): Promise<Record<string, string>> {
  const email = (await deps.git.run(['config', '--get', 'user.email'], { cwd, allowFailure: true })).stdout.trim();
  if (email !== '' || deps.env.GIT_COMMITTER_EMAIL || deps.env.EMAIL) return {};
  const address = `${deps.recordingLogin.replace(/\[bot\]$/, '')}@users.noreply.github.com`;
  return { GIT_COMMITTER_NAME: deps.recordingLogin, GIT_COMMITTER_EMAIL: address };
}

/**
 * Stages `paths` and commits them authored by the member, with the store's
 * hooks running as for any commit. On a refusal the worktree is restored to
 * its tip — a draft never keeps a change its pull request does not carry —
 * and the hook's output is the refusal (design.md D13).
 */
export async function commitAs(deps: WriteDeps, session: Session, email: string, paths: readonly string[], subject: string, trailer: string): Promise<string> {
  const run = (args: readonly string[], env?: Record<string, string | undefined>): Promise<GitResult> =>
    deps.git.run(args, { cwd: session.path, allowFailure: true, ...(env ? { env } : {}) });
  const added = await run(['add', '--', ...paths]);
  if (added.exitCode !== 0) {
    await restore(deps, session);
    throw new WriteRefusal('mcp.commit_refused', `The change could not be staged: ${firstLines(added.stderr)}`);
  }
  const name = email.split('@')[0] ?? email;
  const env = { ...deps.env, ...(await committerEnv(deps, session.path)), GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: email };
  const committed = await run(['commit', '--quiet', '-m', subject, '-m', `${trailer}: ${email}`], env);
  if (committed.exitCode !== 0) {
    await restore(deps, session);
    throw new WriteRefusal('mcp.commit_refused', `The store refused the change: ${firstLines(`${committed.stdout}\n${committed.stderr}`, 12)}`);
  }
  return (await run(['rev-parse', 'HEAD'])).stdout.trim();
}

export async function restore(deps: WriteDeps, session: Session): Promise<void> {
  await deps.git.run(['reset', '--quiet', '--hard', 'HEAD'], { cwd: session.path, allowFailure: true });
  await deps.git.run(['clean', '-fdq'], { cwd: session.path, allowFailure: true });
}

/**
 * Publishes whatever the session holds that the forge does not: its branch,
 * pushed when the remote lacks the local tip, and a pull request, found by
 * head before one is opened. Idempotent, so a retry after any partial
 * failure converges on exactly one pull request (design.md D9, D13).
 */
export async function publish(deps: WriteDeps, session: Session, pull: { title: string; body: string }): Promise<PullRequest> {
  const tip = (await deps.git.run(['rev-parse', 'HEAD'], { cwd: session.path })).stdout.trim();
  const remote = await runRemoteGit(deps.git, deps.credentials, deps.env, ['ls-remote', 'origin', `refs/heads/${session.branch}`], { cwd: session.path, allowFailure: true });
  if (remote.exitCode !== 0 || remote.stdout.split(/\s/)[0] !== tip) {
    const pushed = await runRemoteGit(deps.git, deps.credentials, deps.env, ['push', '--quiet', 'origin', `HEAD:refs/heads/${session.branch}`], { cwd: session.path, allowFailure: true });
    if (pushed.exitCode !== 0) {
      throw new WriteRefusal('mcp.push_failed', `The change is saved in its session but could not be pushed yet (${firstLines(pushed.stderr, 2)}). Retry the same call to publish it.`, { session: session.name });
    }
  }
  const state = await pullStateFor(deps, session.branch);
  if (state.kind === 'open') return state.pull;
  try {
    return await deps.forge.createPull({ head: session.branch, base: deps.config.git.default_branch, title: pull.title, body: pull.body });
  } catch (err) {
    throw new WriteRefusal(
      'mcp.pull_request_failed',
      `The change is pushed but its pull request could not be opened yet (${err instanceof Error ? firstLines(err.message, 2) : String(err)}). Retry the same call to open it.`,
      { session: session.name },
    );
  }
}
