import { baseRef } from '../approval/sessions.js';
import { SessionRefusedError } from '../errors.js';
import { ExitCode } from '../exit-codes.js';
import { ForgeRequestError } from '../forge/github.js';
import { removeSession, remoteTip, SessionRemoteError, type RemoteDeps } from './remote.js';
import { workingChanges, type SessionRef } from './resolve.js';

/**
 * write-lifecycle spec (*`ctxr session discard` removes only a session, and
 * only clean unless forced*): #31's `abandon` could force-remove any worktree
 * (bring-the-session-lifecycle-into-the-cli D1, point 4). `resolveSession`
 * has already refused anything that is not a session; this refuses, without
 * `--force`, a session whose removal would lose work — uncommitted changes, or
 * commits its remote branch lacks — and closes a pull request only when asked.
 */
export interface DiscardResult {
  session: string;
  worktree: string;
  branch: string;
  removed: boolean;
  forced: boolean;
  /** The pull request `--close-pull-request` closed; null when none was asked for or none was open. */
  closed_pull_request: number | null;
}

/**
 * The session's commits that are on no remote ref: not on its remote branch,
 * nor any other this clone has fetched. A session whose pull request was
 * squash-merged and whose branch was then deleted carries commits on no
 * remote ref, so a merged pull request at exactly this head counts as published.
 */
async function unpublishedCommits(deps: RemoteDeps, session: SessionRef): Promise<number> {
  const run = (args: readonly string[]) => deps.git.run(args, { cwd: session.path, allowFailure: true });
  const tip = (await run(['rev-parse', 'HEAD'])).stdout.trim();
  let remote: string | null = null;
  try {
    remote = await remoteTip(deps, session.path, session.branch);
  } catch (err) {
    if (!(err instanceof SessionRemoteError)) throw err;
  }
  if (remote === tip) return 0;
  const exclude = remote !== null && (await run(['cat-file', '-e', `${remote}^{commit}`])).exitCode === 0 ? [`^${remote}`] : [];
  // The default branch itself never counts: a session's base is already on it.
  const base = await baseRef(deps.git, session.path, deps.config.git.default_branch);
  const counted = await run(['rev-list', '--count', 'HEAD', ...exclude, `^${base}`, '--not', '--remotes=origin']);
  const count = counted.exitCode === 0 ? Number.parseInt(counted.stdout.trim(), 10) || 0 : 0;
  if (count === 0) return 0;
  try {
    const pulls = await deps.forge.pullsForHead(session.branch);
    if (pulls.some((p) => p.merged && p.headSha === tip)) return 0;
  } catch (err) {
    if (!(err instanceof ForgeRequestError)) throw err;
  }
  return count;
}

export async function discardSession(deps: RemoteDeps, session: SessionRef, opts: { force?: boolean; closePullRequest?: boolean } = {}): Promise<DiscardResult> {
  const force = opts.force === true;
  if (!force) {
    const dirty = await workingChanges(deps.git, session.path);
    if (dirty.length > 0) {
      throw new SessionRefusedError(
        ExitCode.CheckFailed,
        'discard_uncommitted',
        `"${session.name}" has uncommitted changes (${dirty.map((c) => c.path).join(', ')}); discarding it would destroy them. Pass --force to discard them anyway.`,
        { session: session.name, paths: dirty.map((c) => c.path) },
        session.name,
      );
    }
    const unpublished = await unpublishedCommits(deps, session);
    if (unpublished > 0) {
      throw new SessionRefusedError(
        ExitCode.CheckFailed,
        'discard_unpushed',
        `"${session.name}" carries ${unpublished} commit(s) its remote branch lacks; discarding it would destroy them. Pass --force to discard them anyway.`,
        { session: session.name, commits: unpublished },
        session.name,
      );
    }
  }

  let closed: number | null = null;
  if (opts.closePullRequest === true) {
    const open = (await deps.forge.pullsForHead(session.branch)).find((p) => p.state === 'open');
    if (open !== undefined) {
      await deps.forge.updatePull(open.number, { state: 'closed' });
      closed = open.number;
    }
  }

  await removeSession(deps.git, session.canonical, session);
  return { session: session.name, worktree: session.path, branch: session.branch, removed: true, forced: force, closed_pull_request: closed };
}
