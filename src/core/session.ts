import { randomBytes } from 'node:crypto';
import path from 'node:path';
import type { StoreConfig } from '../config/schema.js';

/**
 * write-lifecycle spec: session branch names are prefixed (configurable —
 * default "session/") and unique. Sortable by creation time, since that's
 * useful for reap/list ordering without needing to consult git history.
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

/** A branch name may contain "/"; a directory name may not treat that as a separator. */
export function worktreeDirNameFor(branch: string): string {
  return branch.replace(/\//g, '-');
}

export function worktreePathFor(store: { root: string; config: StoreConfig }, branch: string): string {
  return path.join(store.root, store.config.session.worktrees_path, worktreeDirNameFor(branch));
}
