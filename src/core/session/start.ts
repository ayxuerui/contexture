import path from 'node:path';
import type { StoreConfig } from '../../config/schema.js';
import { SessionLabelUnusableError, SessionNameExistsError, SessionWorktreeRefusedError } from '../errors.js';
import type { GitRunner } from '../git/exec.js';
import { addWorktree } from '../git/worktree.js';
import { findSessionWorktreeByLabel, generateSessionBranchName, sessionLabelSlug, worktreePathFor } from '../session.js';

/**
 * write-lifecycle spec (*session start*): a new session worktree off a freshly
 * fetched default branch, shared by `ctxr session start` and the MCP surface's
 * `session_start` and `capture` (serve-the-session-lifecycle-to-chat-apps D3),
 * so the two surfaces name, place and refuse a session identically. Each
 * surface brings its own fetch: the CLI's plain `git fetch`, the server's
 * through its forge credential.
 */
export interface StartDeps {
  git: GitRunner;
  config: StoreConfig;
  /** Fetches the default branch into `origin/<default>`; false when there is no remote or it cannot be reached. */
  fetch(cwd: string): Promise<boolean>;
  now(): Date;
  /**
   * Whether a generated branch name is already taken, when the caller can say
   * (the server, whose captures can start twice in one second): a taken name
   * is stepped past one second at a time. Omitted, the first name is used and
   * git refuses a collision.
   */
  branchTaken?(branch: string): Promise<boolean>;
}

export interface StartedSession {
  /** The worktree's directory name: what the other session commands take. */
  name: string;
  worktree: string;
  branch: string;
  startPoint: string;
  fetched: boolean;
  /** The normalized label this session was named with, or null when none was given. */
  label: string | null;
}

/**
 * approve-sessions-across-stores: a session joined to one in the store that
 * mounts this one takes its branch and worktree name from that session, never
 * from a label or the clock. Only `ctxr session start --joins` passes it; the
 * MCP surface keeps no mounts.
 */
export interface JoinedName {
  branch: string;
  worktreeName: string;
}

export async function startSession(deps: StartDeps, storeRoot: string, label?: string, joined?: JoinedName): Promise<StartedSession> {
  // Ahead of the fetch, so a label that can never work costs no network round trip and leaves nothing behind.
  let labelSlug: string | null = null;
  if (label !== undefined) {
    labelSlug = sessionLabelSlug(label);
    if (labelSlug === '') throw new SessionLabelUnusableError(label);
    // A label identifies at most one session at a time, checked against the sessions on disk (name-the-session-at-start D4).
    const existing = await findSessionWorktreeByLabel(storeRoot, deps.config, labelSlug);
    if (existing !== null) throw new SessionNameExistsError(labelSlug, existing);
  }

  const defaultBranch = deps.config.git.default_branch;
  const fetched = await deps.fetch(storeRoot);
  // The local branch both with no remote at all and with a remote that lacks the branch: honest, expected states.
  const startPoint = fetched ? `origin/${defaultBranch}` : defaultBranch;

  let branch = joined?.branch ?? generateSessionBranchName(deps.config, deps.now(), labelSlug ?? undefined);
  if (joined === undefined && deps.branchTaken !== undefined) {
    for (let step = 1; step <= 60 && (await deps.branchTaken(branch)); step += 1) {
      branch = generateSessionBranchName(deps.config, new Date(deps.now().getTime() + step * 1000), labelSlug ?? undefined);
    }
  }
  const worktree = joined === undefined ? worktreePathFor({ root: storeRoot, config: deps.config }, branch) : path.join(storeRoot, deps.config.session.worktrees_path, joined.worktreeName);
  const added = await addWorktree(deps.git, storeRoot, worktree, branch, startPoint, { allowFailure: true });
  if (added.exitCode !== 0) throw new SessionWorktreeRefusedError(branch, worktree, added.stderr);
  return { name: path.basename(worktree), worktree, branch, startPoint, fetched, label: labelSlug };
}
