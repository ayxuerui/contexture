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
import { fetchOrigin, listWorktrees, removeWorktree, deleteBranch, hasRemote } from '../core/git/worktree.js';
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
  const branch = flags.branch ?? (await currentBranch(env.git, store.root));
  if (branch === defaultBranch) {
    throw new SessionLandOnDefaultBranchError(branch);
  }

  const [forgeAdapter] = configuredAdapters(store.config, 'forge', registry);
  if (!forgeAdapter || !(await forgeAdapter.isAvailable(store.root))) {
    throw new NoForgeConfiguredError();
  }

  const ref = flags.pr !== undefined ? String(flags.pr) : branch;
  let pr = await forgeAdapter.pullRequest(store.root, ref);
  if (pr.headBranch !== branch) {
    throw new PullRequestHeadMismatchError(branch, pr.headBranch);
  }

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

  const sync = await syncRootCheckout(env, store, defaultBranch);
  const reap = await reapWorktree(env, store, branch, flags.reap ?? false);

  return outcome(store, branch, pr, gate, merged, sync, reap);
}

function gateMessage(pr: PullRequestState): string {
  return `PR #${pr.number} "${pr.title}" (${pr.url}) — OPEN, MERGEABLE. Merge?`;
}

/** D2: fast-forward only, in whatever checkout this command runs from — never checked out, reset, or discarded. */
async function syncRootCheckout(env: RunEnv, store: Store, defaultBranch: string): Promise<SyncOutcome> {
  const branch = await currentBranch(env.git, store.root);
  if (branch !== defaultBranch) {
    return { attempted: false, synced: false, reason: 'root checkout is not on the default branch' };
  }
  if (!(await hasRemote(env.git, store.root))) {
    return { attempted: false, synced: false, reason: 'no remote configured' };
  }
  const fetched = await fetchOrigin(env.git, store.root, defaultBranch);
  if (!fetched) {
    return { attempted: true, synced: false, reason: 'fetch failed' };
  }
  const merge = await env.git.run(['merge', '--ff-only', `origin/${defaultBranch}`], { cwd: store.root, allowFailure: true });
  if (merge.exitCode !== 0) {
    return { attempted: true, synced: false, reason: 'cannot fast-forward (diverged from origin)' };
  }
  return { attempted: true, synced: true };
}

/** D3: opt-in, and scoped to a worktree `session start` made — never the one this command is currently running from. */
async function reapWorktree(env: RunEnv, store: Store, branch: string, requested: boolean): Promise<ReapOutcome> {
  if (!requested) {
    return { attempted: false, reaped: false, reason: 'pass --reap, or run `ctxr session reap`' };
  }
  const worktrees = await listWorktrees(env.git, store.root);
  const target = worktrees.find((w) => w.branch === branch);
  if (!target) {
    return { attempted: true, reaped: false, reason: 'no worktree found for this branch' };
  }
  if (!isSessionBranch(store.config, branch) && !isSessionWorktreePath(store.config, target.path)) {
    return { attempted: true, reaped: false, reason: 'not a session worktree' };
  }
  if (path.resolve(target.path) === path.resolve(store.root)) {
    return {
      attempted: true,
      reaped: false,
      reason: 'cannot remove the worktree this command is currently running from; run `ctxr session reap` from elsewhere',
    };
  }
  if (!(await isWorkingTreeClean(env.git, target.path))) {
    return { attempted: true, reaped: false, reason: 'worktree has uncommitted changes' };
  }
  await removeWorktree(env.git, store.root, target.path);
  await deleteBranch(env.git, store.root, branch);
  return { attempted: true, reaped: true };
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
        `; sync ${sync.synced ? 'ok' : sync.attempted ? 'skipped: ' + sync.reason : 'not attempted'}` +
        `; reap ${reap.reaped ? 'ok' : reap.attempted ? 'skipped: ' + reap.reason : 'not attempted'}.`;
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
