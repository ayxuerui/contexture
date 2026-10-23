import type { StoreConfig } from '../../config/schema.js';
import type { ReviewStateName } from '../approval/decision.js';
import { baseRef, reviewStateOf, sessionWorktrees } from '../approval/sessions.js';
import { ForgeRequestError, type ForgeClient, type PullRequest } from '../forge/github.js';
import type { GitRunner } from '../git/exec.js';
import { commitsAhead, workingChanges } from './resolve.js';

/**
 * write-lifecycle spec (*`ctxr session list` reports each session's state*):
 * each session's branch, worktree, head, uncommitted state and commits ahead,
 * all read locally. With `review`, each one's open pull request and, when the
 * store declares change approval, the decision `ctxr review list` reports for
 * it. The forge stays behind the option so a plain list never waits on the
 * network; an unreachable forge reads `unknown`, because the list is an
 * inventory, not a check (bring-the-session-lifecycle-into-the-cli D3,
 * revision 1).
 */
export interface SessionListEntry {
  /** The worktree's directory name: what the other session commands take. */
  name: string;
  branch: string;
  worktree: string;
  head: string;
  uncommitted: boolean;
  ahead: number;
  /** `review` only: the open pull request, null when none is open. */
  pull_request?: { number: number | null; state: 'open' | 'unknown'; url: string | null } | null;
  /** `review` with change approval declared: the decision on the open pull request. */
  review?: { state: ReviewStateName | 'unknown'; comment: string | null } | null;
}

export interface ListReview {
  forge: ForgeClient;
  /** `change_approval.recording_login`; null when the store declares no change approval. */
  recordingLogin: string | null;
}

export interface SessionList {
  sessions: SessionListEntry[];
  /** `review` only: whether the forge answered. */
  forge_reachable?: boolean;
}

async function forgeOr<T>(call: () => Promise<T>): Promise<T | 'unknown'> {
  try {
    return await call();
  } catch (err) {
    if (err instanceof ForgeRequestError) return 'unknown';
    throw err;
  }
}

export async function listSessions(git: GitRunner, storeRoot: string, config: StoreConfig, opts: { review?: ListReview } = {}): Promise<SessionList> {
  const worktrees = await sessionWorktrees(git, storeRoot, config);
  const base = await baseRef(git, storeRoot, config.git.default_branch);
  const sessions: SessionListEntry[] = await Promise.all(
    worktrees.map(async (w) => ({
      name: w.name,
      branch: w.branch,
      worktree: w.path,
      head: (await git.run(['rev-parse', 'HEAD'], { cwd: w.path, allowFailure: true })).stdout.trim(),
      uncommitted: (await workingChanges(git, w.path)).length > 0,
      ahead: await commitsAhead(git, w.path, base),
    })),
  );
  if (opts.review === undefined) return { sessions };

  const { forge, recordingLogin } = opts.review;
  const open = await forgeOr(() => forge.openPulls());
  let reachable = open !== 'unknown';
  await Promise.all(
    sessions.map(async (entry) => {
      if (open === 'unknown') {
        entry.pull_request = { number: null, state: 'unknown', url: null };
        if (recordingLogin !== null) entry.review = { state: 'unknown', comment: null };
        return;
      }
      const pull: PullRequest | undefined = open.find((p) => p.headRef === entry.branch);
      entry.pull_request = pull === undefined ? null : { number: pull.number, state: 'open', url: pull.url };
      if (recordingLogin === null) return;
      if (pull === undefined) {
        entry.review = null;
        return;
      }
      const review = await forgeOr(() => reviewStateOf(git, entry.worktree, base, forge, recordingLogin, pull));
      if (review === 'unknown') {
        reachable = false;
        entry.review = { state: 'unknown', comment: null };
        return;
      }
      entry.review = { state: review.state, comment: review.state === 'changes-requested' ? (review.decision?.comment ?? null) : null };
    }),
  );
  return { sessions, forge_reachable: reachable };
}
