import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { baseRef } from '../approval/sessions.js';
import { SessionRefusedError } from '../errors.js';
import { ExitCode } from '../exit-codes.js';
import type { ForgeCredentials } from '../forge/credentials.js';
import type { GitRunner } from '../git/exec.js';
import { rebaseInProgress, workingChanges, type SessionRef } from './resolve.js';
import { fetchDefaultBranch, type StatusDeps } from './status.js';

/**
 * write-lifecycle spec (*`ctxr session rebase` brings a session onto the
 * default branch*): the conflict playbook's mechanics. The judgment — reading
 * both sides and writing a version that keeps both meanings — stays the
 * agent's; this fetches, rebases, reports each conflict with both sides, and
 * stages and continues once the agent has resolved them
 * (bring-the-session-lifecycle-into-the-cli D3).
 */
export interface Conflict {
  /** Relative to the worktree's top level. */
  path: string;
  /** The default branch's version, with the session's commits applied so far; null when that side deleted the file. */
  default_branch: string | null;
  /** The version in the session commit being replayed; null when it deleted the file. */
  session: string | null;
}

export type RebaseOutcome = 'rebased' | 'up-to-date' | 'conflict' | 'aborted';

export interface RebaseResult {
  session: string;
  branch: string;
  onto: string;
  fetched: boolean;
  outcome: RebaseOutcome;
  head: string;
  conflicts: Conflict[];
}

export type RebaseMode = 'start' | 'continue' | 'abort';

const MARKER = /^(<{7}|>{7})( |$)/m;

async function stageContent(git: GitRunner, cwd: string, stage: 2 | 3, file: string): Promise<string | null> {
  const shown = await git.run(['show', `:${stage}:${file}`], { cwd, allowFailure: true });
  return shown.exitCode === 0 ? shown.stdout : null;
}

async function conflictedPaths(git: GitRunner, cwd: string): Promise<string[]> {
  const { stdout } = await git.run(['diff', '--name-only', '--diff-filter=U', '-z'], { cwd, allowFailure: true });
  return stdout.split('\0').filter((p) => p !== '');
}

async function conflicts(git: GitRunner, cwd: string): Promise<Conflict[]> {
  const found: Conflict[] = [];
  for (const file of await conflictedPaths(git, cwd)) {
    found.push({ path: file, default_branch: await stageContent(git, cwd, 2, file), session: await stageContent(git, cwd, 3, file) });
  }
  return found;
}

async function head(git: GitRunner, cwd: string): Promise<string> {
  return (await git.run(['rev-parse', 'HEAD'], { cwd })).stdout.trim();
}

export async function rebaseSession(deps: StatusDeps & { credentials: ForgeCredentials }, session: SessionRef, mode: RebaseMode): Promise<RebaseResult> {
  const { git } = deps;
  const cwd = session.path;
  const inProgress = await rebaseInProgress(git, cwd);
  const result = async (outcome: RebaseOutcome, onto: string, fetched: boolean): Promise<RebaseResult> => ({
    session: session.name,
    branch: session.branch,
    onto,
    fetched,
    outcome,
    head: await head(git, cwd),
    conflicts: outcome === 'conflict' ? await conflicts(git, cwd) : [],
  });
  const onto = await baseRef(git, cwd, deps.config.git.default_branch);
  // A rebase replays commits, so its editor must never wait on a person.
  const rebase = (args: readonly string[]) => git.run(['-c', 'core.editor=true', 'rebase', ...args], { cwd, allowFailure: true, env: { ...deps.env, GIT_EDITOR: 'true' } });

  if (mode === 'abort') {
    if (!inProgress) throw new SessionRefusedError(ExitCode.Usage, 'no_rebase', `No rebase is in progress in "${session.name}", so there is nothing to abort.`, { session: session.name });
    await rebase(['--abort']);
    return result('aborted', onto, false);
  }

  if (mode === 'continue') {
    if (!inProgress) throw new SessionRefusedError(ExitCode.Usage, 'no_rebase', `No rebase is in progress in "${session.name}", so there is nothing to continue.`, { session: session.name });
    const unresolved: string[] = [];
    for (const file of await conflictedPaths(git, cwd)) {
      const working = await readFile(path.join(cwd, file), 'utf8').catch(() => null);
      if (working !== null && MARKER.test(working)) unresolved.push(file);
    }
    if (unresolved.length > 0) {
      throw new SessionRefusedError(ExitCode.CheckFailed, 'conflict_unresolved', `Conflict markers remain in ${unresolved.map((f) => `"${f}"`).join(', ')}; resolve them before continuing.`, { session: session.name, paths: unresolved });
    }
    for (const file of await conflictedPaths(git, cwd)) await git.run(['add', '-A', '--', file], { cwd, allowFailure: true });
    const continued = await rebase(['--continue']);
    if (continued.exitCode === 0) return result('rebased', onto, false);
    if (await rebaseInProgress(git, cwd)) return result('conflict', onto, false);
    throw new SessionRefusedError(ExitCode.CheckFailed, 'rebase_failed', `The rebase could not continue: ${continued.stderr.trim() || continued.stdout.trim()}`, { session: session.name });
  }

  if (inProgress) {
    throw new SessionRefusedError(ExitCode.Usage, 'rebase_in_progress', `A rebase is already in progress in "${session.name}"; finish it with \`ctxr session rebase ${session.name} --continue\` or undo it with \`--abort\`.`, { session: session.name });
  }
  const dirty = await workingChanges(git, cwd);
  if (dirty.length > 0) {
    throw new SessionRefusedError(ExitCode.CheckFailed, 'uncommitted_changes', `"${session.name}" has uncommitted changes (${dirty.map((c) => c.path).join(', ')}); submit or set them aside before rebasing.`, { session: session.name, paths: dirty.map((c) => c.path) });
  }
  const fetched = await fetchDefaultBranch(deps, cwd);
  const base = await baseRef(git, cwd, deps.config.git.default_branch);
  const before = await head(git, cwd);
  const rebased = await rebase(['--quiet', base]);
  if (rebased.exitCode === 0) return result((await head(git, cwd)) === before ? 'up-to-date' : 'rebased', base, fetched);
  if (await rebaseInProgress(git, cwd)) return result('conflict', base, fetched);
  throw new SessionRefusedError(ExitCode.CheckFailed, 'rebase_failed', `The rebase could not start: ${rebased.stderr.trim() || rebased.stdout.trim()}`, { session: session.name });
}
