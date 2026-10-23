import type { GitResult } from './exec.js';

export interface FastForwardOutcome {
  /** True when the clone is at the remote's branch afterwards — moved, or already there (`from === to`). */
  synced: boolean;
  from: string | null;
  to: string | null;
  /** Why it was left alone; null when synced. */
  reason: string | null;
}

export type CloneGit = (args: readonly string[]) => Promise<GitResult>;

/**
 * land-sweep-syncs-canonical-clone's rule, shared by `land` and by
 * `ctxr shared-stores sync` (mount-shared-stores D4): fast-forward a clone to
 * `origin/<branch>` only when it is on that branch, has no uncommitted changes
 * to tracked files, and has not diverged. Anything else is somebody's work, so
 * it is reported and left alone — never forced, reset, stashed or switched.
 *
 * `run` runs git in the clone, failures allowed; the caller fetches first,
 * with whatever credential its transport needs. `label` names the clone in a
 * reason ("the canonical clone", "the mount").
 */
export async function fastForwardIfSafe(run: CloneGit, branch: string, label: string): Promise<FastForwardOutcome> {
  const head = async (ref: string): Promise<string | null> => {
    const r = await run(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
    return r.exitCode === 0 ? r.stdout.trim() : null;
  };
  const from = await head('HEAD');
  const leave = (reason: string): FastForwardOutcome => ({ synced: false, from, to: from, reason });

  const onBranch = (await run(['symbolic-ref', '--quiet', '--short', 'HEAD'])).stdout.trim();
  if (onBranch !== branch) return leave(`${label} is on "${onBranch || 'a detached HEAD'}", not ${branch}`);
  const dirty = (await run(['status', '--porcelain', '--untracked-files=no'])).stdout.trim();
  if (dirty !== '') return leave(`${label} has uncommitted changes to tracked files`);
  const target = await head(`origin/${branch}`);
  if (target === null) return leave(`origin/${branch} could not be read`);
  if (target === from) return { synced: true, from, to: from, reason: null };
  const behind = await run(['merge-base', '--is-ancestor', 'HEAD', `origin/${branch}`]);
  if (behind.exitCode !== 0) return leave(`${label} has diverged from origin/${branch}`);
  const ff = await run(['merge', '--ff-only', '--quiet', `origin/${branch}`]);
  if (ff.exitCode !== 0) return leave(`git refused the fast-forward: ${ff.stderr.trim().split('\n')[0] ?? ''}`);
  return { synced: true, from, to: await head('HEAD'), reason: null };
}
