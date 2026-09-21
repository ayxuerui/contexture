import { randomBytes } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import type { StoreConfig } from '../config/schema.js';
import { slugifySegment } from './slug.js';

/**
 * The longest a normalized label may be. Not about git, which tolerates far
 * longer refs: the label also becomes a worktree DIRECTORY name, which is a real
 * path segment on every platform, and a preview heading someone has to read.
 *
 * `slugifySegment` deliberately has no cap of its own — truncation there could
 * silently merge two distinct page subjects onto one path. Truncating here
 * cannot do that silently, because two labels that truncate alike produce the
 * same session name, and `session start` refuses a name that already exists
 * (name-the-session-at-start design.md D4) rather than quietly reusing it.
 */
const MAX_LABEL_LENGTH = 48;

/**
 * A caller's session label, normalized to what may appear in a branch name and a
 * directory name; empty when nothing survives, which the caller refuses rather
 * than treating as "no label given" (D3).
 *
 * Truncation prefers the last `-` boundary at or before the cap, so a long label
 * ends on a whole word instead of mid-word; a single over-long word has no
 * boundary to find and is cut at the cap.
 */
export function sessionLabelSlug(raw: string): string {
  const slug = slugifySegment(raw);
  if (slug.length <= MAX_LABEL_LENGTH) return slug;

  const cut = slug.slice(0, MAX_LABEL_LENGTH);
  const boundary = cut.lastIndexOf('-');
  return (boundary > 0 ? cut.slice(0, boundary) : cut).replace(/-+$/, '');
}

/**
 * write-lifecycle spec: session branch names are prefixed (configurable —
 * default "session/") and unique. Sortable by creation time, since that's
 * useful for `session list`'s ordering without needing to consult git history.
 *
 * A caller's label takes the random suffix's place rather than being appended
 * after it (name-the-session-at-start design.md D2) — the three random bytes
 * only ever bought uniqueness within one second, which a label does at least as
 * well, and a name carrying both a random token and a human one reads as
 * neither. The stamp stays in FRONT of the label: `listSessionWorktreeDirs` and
 * the browse navigation both order worktrees alphabetically, and a leading stamp
 * is what keeps that order chronological.
 *
 * The label is expected pre-normalized by `sessionLabelSlug`, so that a caller
 * refuses an unusable label before anything is created rather than here.
 */
export function generateSessionBranchName(config: StoreConfig, now: Date = new Date(), labelSlug?: string): string {
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, '')
    .replace('T', '-');
  const suffix = labelSlug && labelSlug.length > 0 ? labelSlug : randomBytes(3).toString('hex');
  return `${config.session.branch_prefix}${stamp}-${suffix}`;
}

/**
 * The label a session worktree directory carries, or null when it carries none —
 * recovered by matching the name `generateSessionBranchName` composes, with the
 * stamp at its fixed width.
 *
 * Matched as a whole trailing field rather than by a suffix test, which would
 * report a session labelled `ctx-a` as already holding the label `a`
 * (name-the-session-at-start design.md D7). An unlabelled session's random suffix
 * is six hex characters and is reported as no label.
 */
export function sessionLabelFromDirName(config: StoreConfig, dirName: string): string | null {
  const prefix = worktreeDirNameFor(config.session.branch_prefix);
  const pattern = new RegExp(`^${escapeForRegExp(prefix)}\\d{8}-\\d{6}-(.+)$`);
  const label = pattern.exec(dirName)?.[1];
  if (label === undefined) return null;
  return /^[0-9a-f]{6}$/.test(label) ? null : label;
}

function escapeForRegExp(raw: string): string {
  return raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The existing session worktree carrying `label`, or null. Reads the filesystem
 * rather than asking git (D7), and finds a session whose branch was renamed by
 * hand, because the directory keeps the name the label went into.
 */
export async function findSessionWorktreeByLabel(
  storeRoot: string,
  config: StoreConfig,
  label: string,
): Promise<string | null> {
  const dirs = await listSessionWorktreeDirs(storeRoot, config);
  const match = dirs.find((dir) => sessionLabelFromDirName(config, dir) === label);
  return match === undefined ? null : path.join(storeRoot, config.session.worktrees_path, match);
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
