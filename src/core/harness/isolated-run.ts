import { execFile } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { GitRunner } from '../git/exec.js';
import { addDetachedWorktree, mainWorktreePath, pruneWorktrees, removeWorktree } from '../git/worktree.js';

const execFileAsync = promisify(execFile);

export interface IsolatedVerifyStep {
  operation: string;
  status: string;
  detail?: string;
}

export interface IsolatedVerifyResult {
  /** The commit the disposable checkout was made from — what the run actually verified. */
  commit: string;
  steps: IsolatedVerifyStep[];
  exitCode: number;
  /**
   * Whether the scrubbed home was still empty when the child finished. The
   * requirement says it must be; observing it is what makes that a mechanism
   * rather than an assumption about a directory nobody ever looks at.
   */
  homeWasEmpty: boolean;
}

/**
 * isolate-the-portability-test (D1): the environment the child runs under.
 *
 * Built from the injected environment, never `process.env`, so this stays a
 * pure function of its inputs and the source-level guard that no module
 * outside `core/env.ts` reads process state keeps holding.
 *
 * `HOME` and `USERPROFILE` point at an empty directory, `CONTEXTURE_STORE_ROOT`
 * (and the superseded `CONTEXTURE_ROOT` — rename-store-root-env-var: a leaked
 * one would make the child refuse via SupersededStoreRootEnvVarError instead
 * of being properly isolated) and every `XDG_*` key are removed, and git is
 * cut off from a global config. `PATH` is deliberately preserved: the
 * prerequisites step resolves a tool on it, so `PATH` is the subject of that
 * step rather than something the run isolates from.
 */
export function scrubbedChildEnv(
  env: Readonly<Record<string, string | undefined>>,
  homeDir: string,
): Record<string, string> {
  const child: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue;
    if (key === 'CONTEXTURE_STORE_ROOT' || key === 'CONTEXTURE_ROOT' || key.startsWith('XDG_')) continue;
    child[key] = value;
  }
  child.HOME = homeDir;
  child.USERPROFILE = homeDir;
  child.GIT_CONFIG_GLOBAL = '/dev/null';
  return child;
}

/**
 * Runs `verify` against a disposable checkout of `commit`, in a child process
 * with no harness state reachable. Isolation is produced by the mechanism
 * rather than asserted of the implementation, which is the property the
 * portability requirement now names.
 *
 * The child is `process.execPath` plus this CLI's own entry script — never a
 * `PATH` lookup for `ctxr`. Under a scrubbed environment a resolved `ctxr`
 * could be a different installation, and the run would silently verify the
 * wrong binary (D1). It runs bare `verify`, so the recursion terminates by
 * construction.
 *
 * The checkout and both temp directories are reclaimed whether the child
 * passes or fails — a failing run is exactly when a stranded worktree would
 * be least welcome.
 */
export async function runIsolatedVerify(
  git: GitRunner,
  storeRoot: string,
  env: Readonly<Record<string, string | undefined>>,
  commit: string,
): Promise<IsolatedVerifyResult> {
  // Register the checkout against the repository's main worktree, so a run
  // launched from inside a linked worktree still works — contexture's own
  // session model makes that the common case, not the exception.
  const repoRoot = await mainWorktreePath(git, storeRoot);
  const checkout = await mkdtemp(path.join(tmpdir(), 'ctxr-portable-'));
  const home = await mkdtemp(path.join(tmpdir(), 'ctxr-portable-home-'));
  // `worktree add` wants to create the directory itself.
  await rm(checkout, { recursive: true, force: true });

  try {
    await addDetachedWorktree(git, repoRoot, checkout, commit);
    const { stdout, exitCode } = await runChild(checkout, scrubbedChildEnv(env, home));
    // Read it before the finally block removes it — afterwards there is
    // nothing left to inspect.
    const homeWasEmpty = (await readdir(home)).length === 0;
    return { commit, steps: parseSteps(stdout), exitCode, homeWasEmpty };
  } finally {
    await removeWorktree(git, repoRoot, checkout);
    await pruneWorktrees(git, repoRoot);
    await rm(checkout, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  }
}

async function runChild(checkout: string, env: Record<string, string>): Promise<{ stdout: string; exitCode: number }> {
  const entry = process.argv[1];
  if (entry === undefined) throw new Error('cannot resolve this CLI\'s entry script to re-execute');
  try {
    const { stdout } = await execFileAsync(process.execPath, [entry, 'verify', '--json', '--root', checkout], { env });
    return { stdout, exitCode: 0 };
  } catch (err) {
    const failure = err as { stdout?: string; code?: number };
    return { stdout: failure.stdout ?? '', exitCode: typeof failure.code === 'number' ? failure.code : 1 };
  }
}

/** The child speaks the same JSON envelope every command does; anything else is reported as no steps. */
function parseSteps(stdout: string): IsolatedVerifyStep[] {
  try {
    const steps = (JSON.parse(stdout) as { data?: { steps?: unknown } }).data?.steps;
    return Array.isArray(steps) ? (steps as IsolatedVerifyStep[]) : [];
  } catch {
    return [];
  }
}
