import { randomBytes } from 'node:crypto';
import path from 'node:path';
import type { StoreConfig } from '../config/schema.js';

/**
 * write-lifecycle spec: session branch names are prefixed (configurable —
 * default "session/") and unique. Sortable by creation time, since that's
 * useful for `session list`'s ordering without needing to consult git history.
 */
export function generateSessionBranchName(config: StoreConfig, now: Date = new Date()): string {
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, '')
    .replace('T', '-');
  const suffix = randomBytes(3).toString('hex');
  return `${config.session.branch_prefix}${stamp}-${suffix}`;
}

export function isSessionBranch(config: StoreConfig, branch: string): boolean {
  return branch.startsWith(config.session.branch_prefix);
}

/**
 * write-lifecycle spec: a worktree is ALSO recognized as a session by where
 * it lives, not only by its branch's name — the `ctxr-submit` skill may
 * rename a session's branch by hand (`git branch -m <name>`) before it
 * reaches the forge, out from under the configured prefix, and a renamed
 * session must stay recognizable to `session list`.
 *
 * Deliberately independent of any particular `store.root`: the worktree's
 * OWN path shape is the durable identity — its immediate parent directory
 * is named after the configured worktrees path — because a caller checking
 * this may itself be running from inside the very worktree in question,
 * which would make a storeRoot-relative comparison meaningless.
 */
export function isSessionWorktreePath(config: StoreConfig, worktreePath: string): boolean {
  const worktreesDirName = path.basename(config.session.worktrees_path);
  const parts = path.resolve(worktreePath).split(path.sep);
  const index = parts.lastIndexOf(worktreesDirName);
  return index !== -1 && index === parts.length - 2;
}

/** A branch name may contain "/"; a directory name may not treat that as a separator. */
export function worktreeDirNameFor(branch: string): string {
  return branch.replace(/\//g, '-');
}

export function worktreePathFor(store: { root: string; config: StoreConfig }, branch: string): string {
  return path.join(store.root, store.config.session.worktrees_path, worktreeDirNameFor(branch));
}
