import { existsSync } from 'node:fs';
import path from 'node:path';
import type { CommandOutcome, CommandRequires } from '../core/command.js';
import type { RunEnv } from '../core/env.js';
import { ExitCode } from '../core/exit-codes.js';
import { resolveMounts, type MountState } from '../core/shared-stores.js';
import type { Store } from '../core/store.js';

export const requires: CommandRequires = { store: 'required' };

export interface MountStatus {
  name: string;
  location: string;
  url: string;
  present: boolean;
  /** Whether the mount's root holds a store configuration that loads. */
  isStore: boolean;
  /** Why it is not a store; null when it is, or when absent. */
  reason: string | null;
  branch: string | null;
  commit: string | null;
  /** Uncommitted changes to tracked files; null when there is no clone to ask. */
  dirty: boolean | null;
}

export interface SharedStoresStatusData {
  mounts: MountStatus[];
}

async function statusOf(env: RunEnv, mount: MountState): Promise<MountStatus> {
  const base = { name: mount.name, location: mount.location, url: mount.url };
  if (mount.state === 'absent') {
    return { ...base, present: false, isStore: false, reason: null, branch: null, commit: null, dirty: null };
  }
  const reason = mount.state === 'not_store' ? mount.reason : null;
  if (!existsSync(path.join(mount.root, '.git'))) {
    return { ...base, present: true, isStore: mount.state === 'present', reason, branch: null, commit: null, dirty: null };
  }
  const run = (args: readonly string[]) => env.git.run(args, { cwd: mount.root, allowFailure: true });
  const branch = (await run(['symbolic-ref', '--quiet', '--short', 'HEAD'])).stdout.trim();
  const commit = await run(['rev-parse', '--verify', '--quiet', 'HEAD']);
  const dirty = (await run(['status', '--porcelain', '--untracked-files=no'])).stdout.trim() !== '';
  return {
    ...base,
    present: true,
    isStore: mount.state === 'present',
    reason,
    branch: branch === '' ? null : branch,
    commit: commit.exitCode === 0 ? commit.stdout.trim() : null,
    dirty,
  };
}

function line(status: MountStatus): string {
  if (!status.present) return `${status.location}: absent (run \`ctxr shared-stores sync\` to clone it)`;
  const where = status.commit ? ` on ${status.branch ?? 'a detached HEAD'} at ${status.commit.slice(0, 7)}` : '';
  const store = status.isStore ? '' : `, not a store (${status.reason})`;
  return `${status.location}: present${where}${status.dirty ? ', with uncommitted changes' : ''}${store}`;
}

/** shared-stores spec: each mount's state, from the filesystem and local git only — no writes, no network. */
export async function execute(env: RunEnv, store: Store): Promise<CommandOutcome<SharedStoresStatusData>> {
  const mounts = await resolveMounts(store.root, store.config);
  const statuses: MountStatus[] = [];
  for (const mount of mounts) statuses.push(await statusOf(env, mount));
  return {
    exitCode: ExitCode.Ok,
    data: { mounts: statuses },
    findings: [],
    humanSummary: statuses.length === 0 ? 'This store declares no shared stores.' : statuses.map(line).join('\n'),
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}
