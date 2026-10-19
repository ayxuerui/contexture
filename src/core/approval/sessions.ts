import path from 'node:path';
import type { StoreConfig } from '../../config/schema.js';
import { ForgeUnreachableError } from '../errors.js';
import type { GitRunner } from '../git/exec.js';
import { patchIds } from '../git/exec.js';
import { listWorktrees } from '../git/worktree.js';
import { ForgeRequestError, type ForgeClient, type PullRequest } from '../forge/github.js';
import { isSessionBranch, isSessionWorktreePath } from '../session.js';
import { resolveReviewState, type ReviewState } from './decision.js';

export interface SessionWorktree {
  /** The worktree's directory name — the key the review and approval routes use. */
  name: string;
  path: string;
  branch: string;
}

export interface SessionPull extends SessionWorktree {
  pull: PullRequest;
  review: ReviewState;
}

/** The session worktrees git knows, recognized as `ctxr session list` recognizes them. */
export async function sessionWorktrees(git: GitRunner, repoCwd: string, config: StoreConfig): Promise<SessionWorktree[]> {
  const worktrees = await listWorktrees(git, repoCwd);
  return worktrees
    .filter(
      (w): w is typeof w & { branch: string } =>
        w.branch !== null && (isSessionBranch(config, w.branch) || isSessionWorktreePath(config, w.path)),
    )
    .map((w) => ({ name: path.basename(w.path), path: w.path, branch: w.branch }));
}

/** `origin/<default>` when the repository has that ref, else the local default branch — the review route's own rule. */
export async function baseRef(git: GitRunner, cwd: string, defaultBranch: string): Promise<string> {
  const remote = await git.run(['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${defaultBranch}`], { cwd, allowFailure: true });
  return remote.exitCode === 0 ? `origin/${defaultBranch}` : defaultBranch;
}

/**
 * write-lifecycle spec (design.md D5): whether `currentHead` carries over the
 * approval of `approvedHead` — each head's commits since it left `base`, compared
 * by patch identity, commit for commit. Anything that cannot be computed (an
 * approved head no longer in this repository) is "no".
 */
export async function carriesOver(git: GitRunner, cwd: string, base: string, approvedHead: string, currentHead: string): Promise<boolean> {
  try {
    const forkOf = async (head: string): Promise<string> =>
      (await git.run(['merge-base', head, base], { cwd })).stdout.trim();
    const before = await patchIds(cwd, `${await forkOf(approvedHead)}..${approvedHead}`);
    const after = await patchIds(cwd, `${await forkOf(currentHead)}..${currentHead}`);
    return before.length > 0 && before.length === after.length && before.every((id, i) => id === after[i]);
  } catch {
    return false;
  }
}

/** Every forge call here, turned into the usage error the spec asks for when the forge cannot be read. */
export async function forgeRead<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (err) {
    if (err instanceof ForgeRequestError) throw new ForgeUnreachableError(err.message);
    throw err;
  }
}

/** One pull request's decision state, with an approval of an earlier head upgraded when the current head carries it over. */
export async function reviewStateOf(
  git: GitRunner,
  cwd: string,
  base: string,
  forge: ForgeClient,
  recordingLogin: string,
  pull: PullRequest,
): Promise<ReviewState> {
  const [reviews, comments] = await Promise.all([forge.reviews(pull.number), forge.comments(pull.number)]);
  const state = resolveReviewState({ reviews, comments, recordingLogin, head: pull.headSha });
  if (state.approvalNeedsCarryCheck && state.decision !== null && (await carriesOver(git, cwd, base, state.decision.head, pull.headSha))) {
    return { ...state, state: 'approved', approvalNeedsCarryCheck: false };
  }
  return state;
}

/**
 * change-approval spec: every session worktree whose branch has an open pull
 * request, with its decision state. A worktree with no open pull request is
 * left out.
 */
export async function sessionPulls(
  git: GitRunner,
  repoCwd: string,
  config: StoreConfig,
  forge: ForgeClient,
  recordingLogin: string,
): Promise<SessionPull[]> {
  const worktrees = await sessionWorktrees(git, repoCwd, config);
  const open = await forgeRead(() => forge.openPulls());
  const base = await baseRef(git, repoCwd, config.git.default_branch);
  const result: SessionPull[] = [];
  for (const worktree of worktrees) {
    const pull = open.find((p) => p.headRef === worktree.branch);
    if (pull === undefined) continue;
    const review = await forgeRead(() => reviewStateOf(git, worktree.path, base, forge, recordingLogin, pull));
    result.push({ ...worktree, pull, review });
  }
  return result;
}
