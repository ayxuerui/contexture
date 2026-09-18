import { readFileSync, statSync } from 'node:fs';
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
 * Whether `root` is itself a linked worktree's checkout, as opposed to a
 * repository's main working tree (or no git checkout at all) — detected the
 * same way git itself distinguishes them, without a subprocess: in the main
 * working tree `.git` is a directory; in a linked worktree it is a text file
 * whose content starts with `gitdir: `. Synchronous and fs-only (no
 * `GitRunner`) because write-lifecycle/path-gate.ts's `isWriteInScope` calls
 * this on every gated tool call and has no git runner of its own to spare.
 */
export function isLinkedWorktreeRoot(root: string): boolean {
  const gitPath = path.join(root, '.git');
  let stat;
  try {
    stat = statSync(gitPath);
  } catch {
    return false;
  }
  if (!stat.isFile()) return false;
  try {
    return readFileSync(gitPath, 'utf8').trimStart().startsWith('gitdir:');
  } catch {
    return false;
  }
}

/**
 * The administrative directory a linked worktree's `.git` file points at, or
 * null when `root` is not a linked worktree. A linked worktree's `.git` is a
 * text file reading `gitdir: <path>`, where <path> is that worktree's own
 * directory inside the OWNING repository — `<owner>/.git/worktrees/<name>`.
 *
 * Git may write that path relative to the worktree (`worktree add
 * --relative-paths`, git 2.48+), so it is resolved against `root` before
 * being returned; an absolute pointer resolves to itself.
 */
export function linkedWorktreeGitDir(root: string): string | null {
  const gitPath = path.join(root, '.git');
  let stat;
  try {
    stat = statSync(gitPath);
  } catch {
    return null;
  }
  if (!stat.isFile()) return null;
  let contents;
  try {
    contents = readFileSync(gitPath, 'utf8');
  } catch {
    return null;
  }
  const line = contents.split('\n')[0]?.trim() ?? '';
  if (!line.startsWith('gitdir:')) return null;
  const pointer = line.slice('gitdir:'.length).trim();
  if (pointer === '') return null;
  return path.resolve(root, pointer);
}

/**
 * Whether `candidate` is a linked worktree of the repository whose main
 * working tree is `owner` — the "same store, different checkout" question
 * root resolution asks (resolve-the-worktree-you-are-in D2).
 *
 * Decided from the worktree's own `gitdir:` pointer rather than by comparing
 * `git rev-parse --git-common-dir` on both sides: root resolution is
 * synchronous, has no GitRunner, and runs ahead of every command, so it
 * cannot spend two subprocesses here. `isLinkedWorktreeRoot` above already
 * made that trade for the same reason.
 *
 * Containment is compared with `path.relative` rather than `startsWith`, so
 * that `<owner>/.git/worktrees-backup/x` does not match
 * `<owner>/.git/worktrees` (D3). `realpath` is deliberately not called: it
 * would make a symlinked store root fail to match the operator's own
 * configured path, and skipping it fails closed — to the caller's current
 * answer, never to a wrong tree.
 */
export function isWorktreeOf(candidate: string, owner: string): boolean {
  const gitDir = linkedWorktreeGitDir(candidate);
  if (gitDir === null) return false;
  const worktreesDir = path.resolve(owner, '.git', 'worktrees');
  const rel = path.relative(worktreesDir, gitDir);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
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
