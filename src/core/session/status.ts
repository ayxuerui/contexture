import type { StoreConfig } from '../../config/schema.js';
import { baseRef } from '../approval/sessions.js';
import { runRemoteGit, type ForgeCredentials } from '../forge/credentials.js';
import type { GitRunner } from '../git/exec.js';
import { hasRemote } from '../git/worktree.js';
import { commitsAhead, rebaseInProgress, workingChanges, type SessionRef, type WorkingChange } from './resolve.js';

/**
 * write-lifecycle spec (*`ctxr session status` re-scans a session*): the
 * re-scan the submit and lifecycle skills ran as six git commands, in one
 * call both surfaces share (bring-the-session-lifecycle-into-the-cli D3).
 */
export interface SessionStatus {
  session: string;
  worktree: string;
  branch: string;
  head: string;
  /** What "ahead" is measured against: `origin/<default>` when this clone has it, else the local default branch. */
  base: string;
  /** Whether the default branch was fetched first; false offline or with no remote. */
  fetched: boolean;
  uncommitted: WorkingChange[];
  diff_stat: { committed: string; uncommitted: string };
  ahead: number;
  commits: { sha: string; subject: string }[];
  rebase_in_progress: boolean;
  /** `--diff` only: the unified diff of uncommitted work, untracked files included. */
  diff: string | null;
}

export interface StatusDeps {
  git: GitRunner;
  config: StoreConfig;
  env: Readonly<Record<string, string | undefined>>;
  /** Fetches the default branch first when given; the re-scan then measures against what the remote has now. */
  credentials?: ForgeCredentials;
}

/** Fetches the default branch into its remote-tracking ref; false when there is no remote or it cannot be reached. */
export async function fetchDefaultBranch(deps: StatusDeps & { credentials: ForgeCredentials }, cwd: string): Promise<boolean> {
  if (!(await hasRemote(deps.git, cwd))) return false;
  const branch = deps.config.git.default_branch;
  const fetched = await runRemoteGit(deps.git, deps.credentials, deps.env, ['fetch', '--quiet', 'origin', `+refs/heads/${branch}:refs/remotes/origin/${branch}`], { cwd, allowFailure: true });
  return fetched.exitCode === 0;
}

async function untrackedDiff(git: GitRunner, cwd: string, file: string): Promise<string> {
  // `--no-index` exits 1 when the files differ, which for a new file they always do.
  return (await git.run(['diff', '--no-index', '--', '/dev/null', file], { cwd, allowFailure: true })).stdout;
}

export async function sessionStatus(deps: StatusDeps, session: SessionRef, opts: { diff?: boolean } = {}): Promise<SessionStatus> {
  const run = async (args: readonly string[]): Promise<string> => (await deps.git.run(args, { cwd: session.path, allowFailure: true })).stdout;
  const fetched = deps.credentials === undefined ? false : await fetchDefaultBranch({ ...deps, credentials: deps.credentials }, session.path);
  const base = await baseRef(deps.git, session.path, deps.config.git.default_branch);
  const uncommitted = await workingChanges(deps.git, session.path);
  const log = await run(['log', '--format=%H%x09%s', `${base}..HEAD`]);
  const commits = log
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => {
      const [sha, ...subject] = line.split('\t');
      return { sha: sha!, subject: subject.join('\t') };
    });

  let diff: string | null = null;
  if (opts.diff === true) {
    const parts = [await run(['diff', 'HEAD'])];
    for (const change of uncommitted.filter((c) => c.status === '??')) parts.push(await untrackedDiff(deps.git, session.path, change.path));
    diff = parts.filter((part) => part !== '').join('');
  }

  return {
    session: session.name,
    worktree: session.path,
    branch: session.branch,
    head: (await run(['rev-parse', 'HEAD'])).trim(),
    base,
    fetched,
    uncommitted,
    diff_stat: {
      committed: (await run(['diff', '--stat', `${base}...HEAD`])).replace(/\n$/, ''),
      uncommitted: (await run(['diff', '--stat', 'HEAD'])).replace(/\n$/, ''),
    },
    ahead: await commitsAhead(deps.git, session.path, base),
    commits,
    rebase_in_progress: await rebaseInProgress(deps.git, session.path),
    diff,
  };
}
