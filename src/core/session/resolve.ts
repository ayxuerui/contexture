import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import type { StoreConfig } from '../../config/schema.js';
import { SessionRefusedError } from '../errors.js';
import { ExitCode } from '../exit-codes.js';
import type { GitRunner } from '../git/exec.js';
import { listWorktrees } from '../git/worktree.js';
import { storePrefix } from '../graph/tree.js';

/**
 * bring-the-session-lifecycle-into-the-cli D3: a session argument is the
 * worktree's directory name, as `ctxr session list` prints it. The session
 * commands act only on a linked worktree directly under the canonical clone's
 * configured worktrees path, checked out on a branch — the guard #31 found
 * missing from `abandon` (D1, point 4), applied to every session command.
 */
export interface SessionRef {
  /** The worktree's directory name. */
  name: string;
  /** The worktree's top level. */
  path: string;
  branch: string;
  /** The store root inside the worktree: `path` plus the store's prefix in its repository. */
  storeRoot: string;
  /** The canonical clone's top level — the repository's main worktree. */
  canonical: string;
}

async function real(p: string): Promise<string> {
  try {
    return await realpath(p);
  } catch {
    return path.resolve(p);
  }
}

/**
 * Resolves `arg` — a directory name, or a path when it carries a separator — to
 * a session, or with no `arg` the session containing `cwd`. Refused with the
 * usage code for anything that is not a session: the canonical clone, a
 * worktree outside the worktrees path, a detached checkout, a name no worktree
 * carries.
 */
export async function resolveSession(git: GitRunner, storeRoot: string, config: StoreConfig, arg: string | undefined, cwd: string): Promise<SessionRef> {
  const worktrees = await listWorktrees(git, storeRoot);
  const canonical = worktrees[0]?.path ?? storeRoot;
  const prefix = await storePrefix(git, storeRoot);
  const worktreesDir = await real(path.join(canonical, prefix, config.session.worktrees_path));

  let target: string;
  if (arg === undefined) {
    const top = await git.run(['rev-parse', '--show-toplevel'], { cwd, allowFailure: true });
    target = top.stdout.trim();
    if (top.exitCode !== 0 || target === '' || (await real(target)) === (await real(canonical))) {
      throw new SessionRefusedError(ExitCode.Usage, 'not_in_session', `"${cwd}" is not inside a session worktree; name the session, as \`ctxr session list\` prints it.`, { cwd });
    }
  } else if (arg.includes('/') || arg.includes(path.sep) || arg === '.' || arg === '..') {
    target = path.resolve(cwd, arg);
  } else {
    const named = worktrees.find((w) => path.basename(w.path) === arg);
    if (named === undefined) {
      throw new SessionRefusedError(ExitCode.Usage, 'not_found', `No session worktree is named "${arg}"; \`ctxr session list\` names them.`, { session: arg }, arg);
    }
    target = named.path;
  }

  const realTarget = await real(target);
  const worktree = await (async () => {
    for (const w of worktrees) if ((await real(w.path)) === realTarget) return w;
    return undefined;
  })();
  const shown = arg ?? target;
  if (worktree === undefined || (await stat(realTarget).catch(() => null)) === null) {
    throw new SessionRefusedError(ExitCode.Usage, 'not_a_session', `"${shown}" is not a worktree of this store's repository.`, { session: shown }, shown);
  }
  if (worktree === worktrees[0]) {
    throw new SessionRefusedError(ExitCode.Usage, 'not_a_session', `"${shown}" is the canonical clone, not a session.`, { session: shown, worktree: worktree.path }, shown);
  }
  if (path.dirname(realTarget) !== worktreesDir) {
    throw new SessionRefusedError(ExitCode.Usage, 'not_a_session', `"${shown}" is not under the configured worktrees path (${config.session.worktrees_path}), so it is not a session.`, { session: shown, worktree: worktree.path }, shown);
  }
  const branch = worktree.branch ?? (await rebasingBranch(git, worktree.path));
  if (branch === null) {
    throw new SessionRefusedError(ExitCode.Usage, 'not_a_session', `"${shown}" is not checked out on a branch, so it is not a session.`, { session: shown, worktree: worktree.path }, shown);
  }
  return { name: path.basename(worktree.path), path: worktree.path, branch, storeRoot: path.join(worktree.path, prefix), canonical };
}

/** The branch a rebase in progress will move, which git lists as a detached checkout until the rebase ends; null when none is. */
async function rebasingBranch(git: GitRunner, cwd: string): Promise<string | null> {
  for (const name of ['rebase-merge', 'rebase-apply']) {
    const gitPath = (await git.run(['rev-parse', '--git-path', `${name}/head-name`], { cwd, allowFailure: true })).stdout.trim();
    const headName = await readFile(path.resolve(cwd, gitPath), 'utf8').catch(() => null);
    if (headName !== null && headName.startsWith('refs/heads/')) return headName.trim().slice('refs/heads/'.length);
  }
  return null;
}

/** Whether `cwd`'s checkout is partway through a rebase. */
export async function rebaseInProgress(git: GitRunner, cwd: string): Promise<boolean> {
  for (const name of ['rebase-merge', 'rebase-apply']) {
    const gitPath = (await git.run(['rev-parse', '--git-path', name], { cwd })).stdout.trim();
    if ((await stat(path.resolve(cwd, gitPath)).catch(() => null)) !== null) return true;
  }
  return false;
}

export interface WorkingChange {
  /** Relative to the worktree's top level. */
  path: string;
  /** git's two-letter short status (`M `, ` M`, `??`, `UU`, …). */
  status: string;
}

/** The worktree's uncommitted changes, untracked files included, as `git status --short` lists them. */
export async function workingChanges(git: GitRunner, cwd: string): Promise<WorkingChange[]> {
  const { stdout } = await git.run(['status', '--porcelain=v1', '-z', '--untracked-files=all'], { cwd });
  const fields = stdout.split('\0');
  const changes: WorkingChange[] = [];
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i]!;
    if (field.length < 4) continue;
    const status = field.slice(0, 2);
    changes.push({ path: field.slice(3), status });
    // A rename or copy is followed by its source path, which is not a change of its own.
    if (status.startsWith('R') || status.startsWith('C')) i += 1;
  }
  return changes;
}

/** The number of commits HEAD carries that `base` lacks. */
export async function commitsAhead(git: GitRunner, cwd: string, base: string): Promise<number> {
  const counted = await git.run(['rev-list', '--count', `${base}..HEAD`], { cwd, allowFailure: true });
  return counted.exitCode === 0 ? Number.parseInt(counted.stdout.trim(), 10) || 0 : 0;
}
