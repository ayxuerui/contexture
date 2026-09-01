import path from 'node:path';
import type { PullRequestState, MergeMethod } from '../adapters/forge/types.js';
import { configuredAdapters } from '../adapters/registry.js';
import { BUILTIN_ADAPTERS } from '../adapters/builtin/index.js';
import type { Adapter } from '../adapters/types.js';
import type { CommandOutcome, CommandRequires } from '../core/command.js';
import { isInteractive, type RunEnv } from '../core/env.js';
import {
  MergeNotConfirmedError,
  NoForgeConfiguredError,
  PullRequestClosedError,
  PullRequestHeadMismatchError,
  PullRequestNotMergeableError,
  SessionLandConsentRequiredError,
  SessionLandOnDefaultBranchError,
} from '../core/errors.js';
import { ExitCode } from '../core/exit-codes.js';
import { currentBranch } from '../core/git/repo.js';
import { fetchOrigin, listWorktrees, mainWorktreePath, removeWorktree, deleteBranch, hasRemote } from '../core/git/worktree.js';
import { isWorkingTreeClean } from '../core/git/repo.js';
import { isSessionBranch, isSessionWorktreePath } from '../core/session.js';
import type { Store } from '../core/store.js';

export const requires: CommandRequires = { store: 'required' };

export interface SessionLandFlags {
  pr?: number;
  branch?: string;
  yes?: boolean;
  mergeMethod?: MergeMethod;
  reap?: boolean;
}

export interface SyncOutcome {
  attempted: boolean;
  synced: boolean;
  reason?: string;
}

export interface ReapOutcome {
  attempted: boolean;
  reaped: boolean;
  reason?: string;
}

export interface SessionLandData {
  branch: string;
  pr: { number: number; url: string; title: string; state: string; mergeable: string };
  gate: 'confirmed' | 'declined' | 'not_required';
  merged: boolean;
  sync: SyncOutcome;
  reap: ReapOutcome;
}

/**
 * session-submit-and-land spec (D1): every step re-reads live state (the
 * pull request's state, the root checkout's branch, the worktree list), so
 * a retry after a partial failure is just running the command again — it
 * naturally skips whatever already happened rather than replaying it.
 */
export async function execute(
  env: RunEnv,
  store: Store,
  flags: SessionLandFlags,
  registry: readonly Adapter[] = BUILTIN_ADAPTERS,
): Promise<CommandOutcome<SessionLandData>> {
  // D1 / the non-interactive-consent scenario: fails before reading or
  // changing anything on the forge — checked first, before any git or
  // network call at all.
  if (!flags.yes && !isInteractive(env)) {
    throw new SessionLandConsentRequiredError();
  }

  const defaultBranch = store.config.git.default_branch;
  // The target comes from exactly one source: --branch names it outright,
  // --pr defers to the pull request's head branch, and with neither it is the
  // branch checked out where the command was invoked. Only the first two are
  // knowable without the forge, so only they can be refused before contacting it.
  const requested = flags.branch ?? (flags.pr === undefined ? await currentBranch(env.git, store.root) : undefined);
  if (requested === defaultBranch) {
    throw new SessionLandOnDefaultBranchError(requested);
  }

  const [forgeAdapter] = configuredAdapters(store.config, 'forge', registry);
  if (!forgeAdapter || !(await forgeAdapter.isAvailable(store.root))) {
    throw new NoForgeConfiguredError();
  }

  const ref = flags.pr !== undefined ? String(flags.pr) : (requested as string);
  let pr = await forgeAdapter.pullRequest(store.root, ref);
  if (requested === undefined) {
    // The target IS the head branch, so there is nothing to mismatch — but the
    // default branch is still refused, now on the branch the forge reported.
    if (pr.headBranch === defaultBranch) {
      throw new SessionLandOnDefaultBranchError(pr.headBranch);
    }
  } else if (pr.headBranch !== requested) {
    throw new PullRequestHeadMismatchError(requested, pr.headBranch);
  }
  const branch = requested ?? pr.headBranch;

  let merged = pr.state === 'merged';
  let gate: SessionLandData['gate'] = 'not_required';

  if (pr.state === 'closed') {
    throw new PullRequestClosedError(pr.number);
  }

  if (pr.state === 'open') {
    if (pr.mergeable === 'unknown') {
      pr = await forgeAdapter.pullRequest(store.root, ref); // D1: re-query once before stopping
    }
    if (pr.mergeable === 'conflicting' || pr.mergeable === 'unknown') {
      throw new PullRequestNotMergeableError(pr.number, pr.mergeable);
    }

    // pr.mergeable === 'mergeable' from here on.
    const confirmed = flags.yes ? true : await env.prompter.confirm({ message: gateMessage(pr) });
    gate = confirmed ? 'confirmed' : 'declined';
    if (!confirmed) {
      return outcome(store, branch, pr, gate, false, { attempted: false, synced: false }, { attempted: false, reaped: false });
    }

    await forgeAdapter.mergePullRequest(store.root, pr.number, flags.mergeMethod ?? 'squash');
    const after = await forgeAdapter.pullRequest(store.root, ref);
    if (after.state !== 'merged') {
      throw new MergeNotConfirmedError(pr.number);
    }
    pr = after;
    merged = true;
  }

  const clone = await mainWorktreePath(env.git, store.root);
  const sync = await syncCanonicalClone(env, clone, defaultBranch);
  const reap = await reapWorktree(env, store, clone, branch, flags.reap ?? false);

  return outcome(store, branch, pr, gate, merged, sync, reap);
}

function gateMessage(pr: PullRequestState): string {
  return `PR #${pr.number} "${pr.title}" (${pr.url}) — OPEN, MERGEABLE. Merge?`;
}

/**
 * D2: fast-forward only, in the store's canonical clone — the checkout the
 * default branch lives in, whichever checkout the command was invoked from
 * (a session worktree, most often). Never checked out, reset, or discarded.
 */
async function syncCanonicalClone(env: RunEnv, clone: string, defaultBranch: string): Promise<SyncOutcome> {
  const branch = await currentBranch(env.git, clone);
  if (branch !== defaultBranch) {
    return { attempted: false, synced: false, reason: `the canonical clone (${clone}) is not on the default branch` };
  }
  if (!(await hasRemote(env.git, clone))) {
    return { attempted: false, synced: false, reason: 'no remote configured' };
  }
  const fetched = await fetchOrigin(env.git, clone, defaultBranch);
  if (!fetched) {
    return { attempted: true, synced: false, reason: 'fetch failed' };
  }
  const merge = await env.git.run(['merge', '--ff-only', `origin/${defaultBranch}`], { cwd: clone, allowFailure: true });
  if (merge.exitCode !== 0) {
    return { attempted: true, synced: false, reason: 'cannot fast-forward (diverged from origin)' };
  }
  return { attempted: true, synced: true };
}

/** D3: opt-in, and scoped to a worktree `session start` made — never the one this command is currently running from. */
async function reapWorktree(
  env: RunEnv,
  store: Store,
  clone: string,
  branch: string,
  requested: boolean,
): Promise<ReapOutcome> {
  if (!requested) {
    return { attempted: false, reaped: false, reason: 'pass --reap, or run `ctxr session reap`' };
  }
  const worktrees = await listWorktrees(env.git, clone);
  const target = worktrees.find((w) => w.branch === branch);
  if (!target) {
    return { attempted: true, reaped: false, reason: 'no worktree found for this branch' };
  }
  if (!isSessionBranch(store.config, branch) && !isSessionWorktreePath(store.config, target.path)) {
    return { attempted: true, reaped: false, reason: 'not a session worktree' };
  }
  // The hazard is the INVOKING directory, not the resolved store root: removing
  // the worktree this process stands in pulls the caller's cwd out from under it.
  if (isInside(env.cwd, target.path)) {
    return {
      attempted: true,
      reaped: false,
      reason: `cannot remove the worktree this command is running from; re-run from the canonical clone (${clone}), or run \`ctxr session reap\` there`,
    };
  }
  if (!(await isWorkingTreeClean(env.git, target.path))) {
    return { attempted: true, reaped: false, reason: 'worktree has uncommitted changes' };
  }
  await removeWorktree(env.git, clone, target.path);
  await deleteBranch(env.git, clone, branch);
  return { attempted: true, reaped: true };
}

/** True when `dir` IS `parent` or lies anywhere beneath it. */
function isInside(dir: string, parent: string): boolean {
  const resolved = path.resolve(dir);
  const root = path.resolve(parent);
  return resolved === root || resolved.startsWith(root + path.sep);
}

/** A step that did not happen names why, whether or not it was attempted — `attempted` stays on the JSON outcome for callers that distinguish the two. */
function stepSummary(done: boolean, reason?: string): string {
  if (done) return 'ok';
  return reason ? `skipped: ${reason}` : 'not attempted';
}

function outcome(
  store: Store,
  branch: string,
  pr: PullRequestState,
  gate: SessionLandData['gate'],
  merged: boolean,
  sync: SyncOutcome,
  reap: ReapOutcome,
): CommandOutcome<SessionLandData> {
  const summary =
    gate === 'declined'
      ? `Merge declined for PR #${pr.number}; nothing landed.`
      : `PR #${pr.number} ${merged ? 'merged' : 'not merged'}` +
        `; sync ${stepSummary(sync.synced, sync.reason)}` +
        `; reap ${stepSummary(reap.reaped, reap.reason)}.`;
  return {
    exitCode: ExitCode.Ok,
    data: {
      branch,
      pr: { number: pr.number, url: pr.url, title: pr.title, state: pr.state, mergeable: pr.mergeable },
      gate,
      merged,
      sync,
      reap,
    },
    findings: [],
    humanSummary: summary,
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}
