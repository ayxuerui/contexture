import { randomBytes } from 'node:crypto';
import { readdir } from 'node:fs/promises';
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

/**
 * The session worktrees present on disk, by directory name.
 *
 * preview-pages-before-they-land D1: discovery is a listing of the CONFIGURED
 * worktrees path rather than `listWorktrees()`, which is better informed and
 * would be the obvious choice anywhere else. The browsing surface rebuilds its
 * route table on every request and caches nothing (local-browsing-surface D2),
 * so asking git here would put a subprocess fork behind every page view, every
 * stylesheet miss, every favicon probe — and caching the answer to avoid that
 * would hide a session started after the server booted, which is the very
 * discovery failure previewing exists to fix.
 *
 * Scanning the path is also the identity rule this module already committed
 * to: `isSessionWorktreePath` above declares a session's durable identity to
 * be its path shape, and `worktreePathFor` puts every session the CLI creates
 * under that path. What it gives up is a worktree made by hand somewhere else,
 * which the CLI never produces.
 *
 * A missing worktrees path yields no worktrees rather than throwing, matching
 * how the published-page walk already treats a store with no publish directory.
 */
export async function listSessionWorktreeDirs(storeRoot: string, config: StoreConfig): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(path.join(storeRoot, config.session.worktrees_path), { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}
