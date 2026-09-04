import type { GitRunner } from './exec.js';

export async function hasRemote(git: GitRunner, cwd: string, name = 'origin'): Promise<boolean> {
  const result = await git.run(['remote'], { cwd, allowFailure: true });
  if (result.exitCode !== 0) return false;
  return result.stdout.split('\n').includes(name);
}

/**
 * write-lifecycle spec: a session worktree is cut from a freshly fetched
 * default branch, when a remote exists. Returns false (rather than
 * throwing) when the fetch doesn't succeed — most commonly a remote that
 * exists but is still empty (nothing pushed yet, the common case for a
 * brand-new project) — so the caller can degrade to the local branch
 * instead of crashing on an honest, expected state.
 */
export async function fetchOrigin(git: GitRunner, cwd: string, branch: string, remote = 'origin'): Promise<boolean> {
  const result = await git.run(['fetch', remote, branch], { cwd, allowFailure: true });
  return result.exitCode === 0;
}

export async function addWorktree(
  git: GitRunner,
  cwd: string,
  worktreePath: string,
  newBranch: string,
  startPoint: string,
): Promise<void> {
  await git.run(['worktree', 'add', '-b', newBranch, worktreePath, startPoint], { cwd });
}

/**
 * isolate-the-portability-test (D2): a checkout of a recorded commit with no
 * branch attached. `addWorktree` above always passes `-b`, so it cannot
 * produce one — and a branch would be a second name for a commit the caller
 * is about to throw away.
 */
export async function addDetachedWorktree(git: GitRunner, cwd: string, worktreePath: string, commit: string): Promise<void> {
  await git.run(['worktree', 'add', '--detach', worktreePath, commit], { cwd });
}

/**
 * Removes a linked worktree. `--force` because the caller owns the checkout
 * outright and a verify run may well have left it dirty (the derived-artifact
 * step writes into it); refusing to reclaim a checkout the tool created would
 * strand it.
 */
export async function removeWorktree(git: GitRunner, cwd: string, worktreePath: string): Promise<void> {
  await git.run(['worktree', 'remove', '--force', worktreePath], { cwd, allowFailure: true });
}

/** Clears registrations whose directory is already gone, so a failed removal cannot accumulate stale entries. */
export async function pruneWorktrees(git: GitRunner, cwd: string): Promise<void> {
  await git.run(['worktree', 'prune'], { cwd, allowFailure: true });
}

/**
 * The commit HEAD points at, or null on an unborn HEAD. Returning a value
 * rather than throwing is what lets the portability test refuse "there is no
 * commit to verify" as a checked condition instead of a caught git error.
 */
export async function resolveHead(git: GitRunner, cwd: string): Promise<string | null> {
  const result = await git.run(['rev-parse', 'HEAD'], { cwd, allowFailure: true });
  if (result.exitCode !== 0) return null;
  const sha = result.stdout.trim();
  return sha === '' ? null : sha;
}

export interface WorktreeInfo {
  path: string;
  branch: string | null;
  head: string;
  locked: boolean;
}

/** Parses `git worktree list --porcelain`'s block format (blocks separated by a blank line). */
export function parseWorktreeList(porcelain: string): WorktreeInfo[] {
  const blocks = porcelain.split('\n\n').map((b) => b.trim()).filter(Boolean);
  const infos: WorktreeInfo[] = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    let worktreePath = '';
    let head = '';
    let branch: string | null = null;
    let locked = false;
    for (const line of lines) {
      if (line.startsWith('worktree ')) worktreePath = line.slice('worktree '.length);
      else if (line.startsWith('HEAD ')) head = line.slice('HEAD '.length);
      else if (line.startsWith('branch ')) branch = line.slice('branch '.length).replace(/^refs\/heads\//, '');
      else if (line === 'locked' || line.startsWith('locked ')) locked = true;
    }
    if (worktreePath) infos.push({ path: worktreePath, branch, head, locked });
  }
  return infos;
}

export async function listWorktrees(git: GitRunner, cwd: string): Promise<WorktreeInfo[]> {
  const result = await git.run(['worktree', 'list', '--porcelain'], { cwd });
  return parseWorktreeList(result.stdout);
}

/**
 * The store's canonical clone: git lists the repository's MAIN worktree first
 * in `worktree list --porcelain`, so the first entry is it, whichever linked
 * worktree the command was invoked from. Falls back to the passed cwd when the
 * list is empty rather than throwing — a repository with no linked worktrees
 * then behaves exactly as a caller that never asked.
 *
 * stabilize-write-gate-hook-path: used to anchor a generated enforcement
 * primitive's own absolute invocation path (e.g. the write-gate hook command)
 * at a location that outlives any single session worktree.
 */
export async function mainWorktreePath(git: GitRunner, cwd: string): Promise<string> {
  const worktrees = await listWorktrees(git, cwd);
  return worktrees[0]?.path ?? cwd;
}
