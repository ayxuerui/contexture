import path from 'node:path';
import type { GitRunner } from './exec.js';

/**
 * Enumerates every way contexture is allowed to write via git. `init` is the
 * sole construction site for `'bootstrap'` — there is no session/worktree
 * machinery yet at that point in the store's life. Every later write
 * (Phase 2 onward) uses `'session'`. `'derived'` is never commit-capable —
 * derived artifacts never ride a commit at all. Declaring this now, as a
 * type every commit-capable operation must accept and can reject `'derived'`
 * against, keeps `init`'s direct-commit behavior an enumerated exception
 * rather than a precedent for "just commit directly" to imitate later.
 */
export type WriteMode =
  | { kind: 'bootstrap' }
  | { kind: 'session'; worktree: string; branch: string }
  | { kind: 'derived' };

export type ToplevelStatus =
  | { kind: 'this-dir'; toplevel: string }
  | { kind: 'ancestor'; toplevel: string }
  | { kind: 'none' };

/** Distinguishes "root is already a repo", "root is inside another repo", and "no repo at all". */
export async function findToplevel(git: GitRunner, cwd: string): Promise<ToplevelStatus> {
  const result = await git.run(['rev-parse', '--show-toplevel'], { cwd, allowFailure: true });
  if (result.exitCode !== 0) return { kind: 'none' };
  const toplevel = result.stdout.trim();
  if (path.resolve(toplevel) === path.resolve(cwd)) {
    return { kind: 'this-dir', toplevel };
  }
  return { kind: 'ancestor', toplevel };
}

/** context-store spec: every non-init command refuses to operate on a root not inside a git repo. */
export async function isInsideGitRepo(git: GitRunner, cwd: string): Promise<boolean> {
  const result = await git.run(['rev-parse', '--is-inside-work-tree'], { cwd, allowFailure: true });
  return result.exitCode === 0 && result.stdout.trim() === 'true';
}

/**
 * Whether git has an explicit author identity available, from either source
 * it actually uses at commit time: `GIT_AUTHOR_*`/`GIT_COMMITTER_*`
 * env vars, or `git config user.email`/`user.name`. If neither, init
 * refuses (exit 2, naming the two config commands) rather than letting git
 * fall through to its own guessed `user@hostname` identity — that guess is
 * itself the fallback the fail-loud contract forbids, and it would put a
 * fake name in permanent history.
 */
export async function hasGitIdentity(
  git: GitRunner,
  cwd: string,
  env: Readonly<Record<string, string | undefined>>,
): Promise<boolean> {
  const hasCompleteEnvIdentity = Boolean(
    env.GIT_AUTHOR_NAME && env.GIT_AUTHOR_EMAIL && env.GIT_COMMITTER_NAME && env.GIT_COMMITTER_EMAIL,
  );
  if (hasCompleteEnvIdentity) return true;

  const email = await git.run(['config', 'user.email'], { cwd, allowFailure: true });
  const name = await git.run(['config', 'user.name'], { cwd, allowFailure: true });
  return (
    email.exitCode === 0 &&
    email.stdout.trim().length > 0 &&
    name.exitCode === 0 &&
    name.stdout.trim().length > 0
  );
}

export async function gitInit(git: GitRunner, cwd: string): Promise<void> {
  // Deliberately no `-b <name>`: the operator's own `init.defaultBranch`
  // config wins. The branch name is learned afterward via `currentBranch`,
  // so nothing in this codebase hardcodes "main".
  await git.run(['init'], { cwd });
}

export async function currentBranch(git: GitRunner, cwd: string): Promise<string> {
  const result = await git.run(['symbolic-ref', '--short', 'HEAD'], { cwd });
  return result.stdout.trim();
}

/** Explicit pathspecs only — never `-A` — so `init` stages exactly the scaffold it wrote. */
export async function addPaths(git: GitRunner, cwd: string, paths: readonly string[]): Promise<void> {
  if (paths.length === 0) return;
  await git.run(['add', '--', ...paths], { cwd });
}

export async function hasStagedChanges(git: GitRunner, cwd: string): Promise<boolean> {
  const result = await git.run(['diff', '--cached', '--quiet'], { cwd, allowFailure: true });
  return result.exitCode === 1; // git diff --quiet: 0 = no differences, 1 = differences found
}

/**
 * context-store spec: relocating a note is a single tracked rename, not
 * delete+create — this is what makes `git log --follow` on the new path
 * return the note's full prior history. Used by archive (Phase 7).
 */
export async function movePath(git: GitRunner, cwd: string, from: string, to: string): Promise<void> {
  await git.run(['mv', from, to], { cwd });
}

/** Whether `relativePath` is tracked by git — `git mv` refuses an untracked path, so callers check this first to fail with a specific, named error instead of a raw git stderr passthrough. */
export async function isTracked(git: GitRunner, cwd: string, relativePath: string): Promise<boolean> {
  const result = await git.run(['ls-files', '--error-unmatch', '--', relativePath], { cwd, allowFailure: true });
  return result.exitCode === 0;
}

/** Skips the commit (returns null) when nothing is staged — what makes re-init idempotent. */
export async function commitIfStaged(
  git: GitRunner,
  cwd: string,
  mode: WriteMode,
  message: string,
): Promise<string | null> {
  if (mode.kind === 'derived') {
    throw new Error('Internal error: attempted to commit with WriteMode "derived".');
  }
  if (!(await hasStagedChanges(git, cwd))) return null;
  await git.run(['commit', '-m', message], { cwd });
  const result = await git.run(['rev-parse', 'HEAD'], { cwd });
  return result.stdout.trim();
}

/** Pushes a session branch to the remote — never the default branch, which the installed hook refuses anyway. */
export async function pushBranch(git: GitRunner, cwd: string, branch: string, remote = 'origin'): Promise<void> {
  await git.run(['push', '--set-upstream', remote, branch], { cwd });
}

/** Whole-tree dirty check (staged AND unstaged) — distinct from hasStagedChanges, used by session reap. */
export async function isWorkingTreeClean(git: GitRunner, cwd: string): Promise<boolean> {
  const result = await git.run(['status', '--porcelain'], { cwd });
  return result.stdout.trim().length === 0;
}
