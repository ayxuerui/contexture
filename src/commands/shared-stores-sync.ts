import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CommandOutcome, CommandRequires } from '../core/command.js';
import type { RunEnv } from '../core/env.js';
import type { Finding } from '../core/envelope.js';
import { ExitCode } from '../core/exit-codes.js';
import { fastForwardIfSafe } from '../core/git/fast-forward.js';
import { mainWorkingTreeRoot, resolveMounts, SHARED_STORES_DIR, type MountState } from '../core/shared-stores.js';
import type { Store } from '../core/store.js';

export const requires: CommandRequires = { store: 'required' };

export type MountSyncOutcome = 'cloned' | 'fast_forwarded' | 'current' | 'left_alone' | 'failed';

export interface MountSyncResult {
  name: string;
  location: string;
  outcome: MountSyncOutcome;
  from: string | null;
  to: string | null;
  /** Why the mount was left alone or failed; null otherwise. */
  reason: string | null;
}

export interface SharedStoresSyncData {
  mounts: MountSyncResult[];
  /** Whether this run added the `shared/` entry to the repository's local exclude file. */
  excludeAdded: boolean;
}

/** The exclude line, anchored at the repository root so only the top-level `shared/` is ignored. */
const EXCLUDE_LINE = `/${SHARED_STORES_DIR}/`;

/**
 * shared-stores spec (and the critique's second revision): the ignore entry goes
 * in the repository's local exclude file — shared by every worktree through the
 * common git directory — never in a tracked file, which would leave the
 * canonical clone with an uncommitted change that blocks its own fast-forward.
 */
async function ensureLocalExclude(env: RunEnv, storeRoot: string): Promise<boolean> {
  const common = await env.git.run(['rev-parse', '--git-common-dir'], { cwd: storeRoot });
  const excludePath = path.join(path.resolve(storeRoot, common.stdout.trim()), 'info', 'exclude');
  let current = '';
  try {
    current = await readFile(excludePath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  if (current.split('\n').some((line) => line.trim() === EXCLUDE_LINE)) return false;
  await mkdir(path.dirname(excludePath), { recursive: true });
  const separator = current === '' || current.endsWith('\n') ? '' : '\n';
  await writeFile(excludePath, `${current}${separator}# ctxr: mounted stores (shared-stores)\n${EXCLUDE_LINE}\n`);
  return true;
}

/** The branch a mount fast-forwards to: its own recorded default branch, else what its remote calls HEAD. */
async function mountDefaultBranch(env: RunEnv, mount: MountState): Promise<string | null> {
  if (mount.state === 'present') return mount.config.git.default_branch;
  const remoteHead = await env.git.run(['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'], { cwd: mount.root, allowFailure: true });
  const ref = remoteHead.stdout.trim();
  return remoteHead.exitCode === 0 && ref.startsWith('origin/') ? ref.slice('origin/'.length) : null;
}

async function syncMount(env: RunEnv, mount: MountState): Promise<MountSyncResult> {
  const base = { name: mount.name, location: mount.location };
  if (mount.state === 'absent') {
    await mkdir(path.dirname(mount.root), { recursive: true });
    const cloned = await env.git.run(['clone', '--quiet', mount.url, mount.root], { cwd: path.dirname(mount.root), allowFailure: true });
    if (cloned.exitCode !== 0) {
      return { ...base, outcome: 'failed', from: null, to: null, reason: `git clone failed: ${cloned.stderr.trim().split('\n')[0] ?? ''}` };
    }
    const head = await env.git.run(['rev-parse', 'HEAD'], { cwd: mount.root, allowFailure: true });
    return { ...base, outcome: 'cloned', from: null, to: head.exitCode === 0 ? head.stdout.trim() : null, reason: null };
  }

  if (!existsSync(path.join(mount.root, '.git'))) {
    return { ...base, outcome: 'left_alone', from: null, to: null, reason: `${mount.location} exists but is not a git clone` };
  }
  const fetched = await env.git.run(['fetch', '--quiet', 'origin'], { cwd: mount.root, allowFailure: true });
  if (fetched.exitCode !== 0) {
    return { ...base, outcome: 'failed', from: null, to: null, reason: `git fetch failed: ${fetched.stderr.trim().split('\n')[0] ?? ''}` };
  }
  const branch = await mountDefaultBranch(env, mount);
  if (branch === null) {
    return { ...base, outcome: 'left_alone', from: null, to: null, reason: 'its default branch could not be determined' };
  }
  const outcome = await fastForwardIfSafe((args) => env.git.run(args, { cwd: mount.root, allowFailure: true }), branch, 'the mount');
  if (!outcome.synced) return { ...base, outcome: 'left_alone', from: outcome.from, to: outcome.to, reason: outcome.reason };
  return { ...base, outcome: outcome.from === outcome.to ? 'current' : 'fast_forwarded', from: outcome.from, to: outcome.to, reason: null };
}

function line(result: MountSyncResult): string {
  switch (result.outcome) {
    case 'cloned':
      return `${result.location}: cloned at ${result.to?.slice(0, 7) ?? 'unknown commit'}`;
    case 'fast_forwarded':
      return `${result.location}: fast-forwarded ${result.from?.slice(0, 7)}..${result.to?.slice(0, 7)}`;
    case 'current':
      return `${result.location}: already current`;
    case 'left_alone':
      return `${result.location}: left alone, ${result.reason}`;
    case 'failed':
      return `${result.location}: failed, ${result.reason}`;
  }
}

/**
 * shared-stores spec: clone each declared mount that is absent, fast-forward
 * each present one when that is safe, and report every mount. A mount with
 * local work is a warning; one that cannot be cloned or fetched fails the run,
 * after every other mount has been processed.
 */
export async function execute(env: RunEnv, store: Store): Promise<CommandOutcome<SharedStoresSyncData>> {
  const mainRoot = mainWorkingTreeRoot(store.root);
  const mounts = await resolveMounts(store.root, store.config);
  const excludeAdded = mounts.length > 0 ? await ensureLocalExclude(env, mainRoot) : false;

  const results: MountSyncResult[] = [];
  for (const mount of mounts) results.push(await syncMount(env, mount));

  const findings: Finding[] = [];
  for (const result of results) {
    if (result.outcome === 'left_alone') {
      findings.push({ code: 'shared_stores.mount_left_alone', severity: 'warning', message: line(result), subject: result.location });
    } else if (result.outcome === 'failed') {
      findings.push({ code: 'shared_stores.mount_unreachable', severity: 'error', message: line(result), subject: result.location });
    }
  }
  const failed = results.some((r) => r.outcome === 'failed');

  return {
    exitCode: failed ? ExitCode.CheckFailed : ExitCode.Ok,
    data: { mounts: results, excludeAdded },
    findings,
    humanSummary: results.length === 0 ? 'This store declares no shared stores.' : results.map(line).join('\n'),
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}
