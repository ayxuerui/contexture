import { configPathFor, readConfigMigrating } from '../config/load.js';
import { MIGRATION_STEPS } from '../config/migrations.js';
import type { StoreConfig } from '../config/schema.js';
import type { CommandOutcome, CommandRequires } from '../core/command.js';
import type { RunEnv } from '../core/env.js';
import { SessionWorktreeRefusedError } from '../core/errors.js';
import { ExitCode } from '../core/exit-codes.js';
import { writeFileAtomic } from '../core/fs/atomic.js';
import { addWorktree, fetchOrigin, hasRemote, removeWorktree } from '../core/git/worktree.js';
import { reconcileStore } from '../core/reconcile.js';
import { CONFIG_FILE_NAME } from '../core/root.js';
import { worktreePathFor } from '../core/session.js';
import type { MigratingStore, Store } from '../core/store.js';
import { updateAdvisory } from '../core/version-check.js';
import { CLI_VERSION } from '../version.js';
import { generateAdapterOutputs } from './adapters-generate.js';

export const requires: CommandRequires = { store: 'required' };

export interface UpdateData {
  /** Every store-relative path this run rewrote to the installed version; empty when already current. */
  changed: string[];
  /** The schema versions a migration carried the store between; absent when none ran. */
  migrated?: { from: number; to: number };
  /**
   * `--worktree` only. The worktree the update was made in — null when nothing
   * was due and it was removed again, or when the branch already existed.
   */
  worktree?: string | null;
  /** `--worktree` only: the branch the update lives on, or would have. */
  branch?: string;
  /** `--worktree` only: true when the branch already existed, so nothing was done. */
  existing?: boolean;
}

/**
 * entry-doc-generation spec (D5): after upgrading contexture, bring every
 * contexture-owned file in the store to the installed version — generated
 * AGENTS.md sections, .gitignore blocks, hooks, the contexture-owned skill
 * copies, and each configured adapter's outputs. Operator content is never
 * touched. Idempotent: a current store reports nothing changed.
 */
export async function execute(
  env: RunEnv,
  store: Store & Partial<Pick<MigratingStore, 'document' | 'migratedFrom'>>,
): Promise<CommandOutcome<UpdateData>> {
  // migrate-stores-on-update: a store opened through openStoreMigrating may have
  // been carried forward in memory. Write it first, so the reconcile below — and
  // anything it shells out to, like the pre-commit hook's doctor — reads the
  // migrated configuration rather than the one the gate refuses.
  const migrated =
    store.migratedFrom !== null && store.migratedFrom !== undefined && store.document !== undefined
      ? { from: store.migratedFrom, to: store.config.schema_version }
      : undefined;
  if (migrated && store.document) {
    await writeFileAtomic(configPathFor(store.root), String(store.document));
  }

  const { changed, findings } = await reconcileStore(env, store.root, store.config);
  const adapterFiles = await generateAdapterOutputs(env.git, store);
  const all = [
    ...new Set([
      ...(migrated ? [CONFIG_FILE_NAME] : []),
      ...changed,
      ...adapterFiles.filter((f) => f.changed).map((f) => f.path),
    ]),
  ];

  // cli-contract: the human path for the release advisory. This is the command
  // someone runs right AFTER upgrading, so "you have not upgraded" is at its
  // most actionable here. It never changes this command's exit code.
  const advisory = await updateAdvisory(env, store);

  return {
    exitCode: ExitCode.Ok,
    data: migrated ? { changed: all, migrated } : { changed: all },
    findings: [...findings, ...advisory.findings],
    notices: advisory.notice ? [advisory.notice] : undefined,
    humanSummary:
      all.length === 0
        ? 'Store is already up to date.'
        : migrated
          ? `Migrated contexture.yaml from schema ${migrated.from} to ${migrated.to}, and updated ${all.length} file(s).`
          : `Updated ${all.length} contexture-owned file(s).`,
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}

/**
 * migrate-stores-on-update (design D3): the branch an update made with
 * `--worktree` lives on. Derived only from the configured prefix and the
 * running release, so every run of one release names the same branch — that is
 * what makes a caller running this at every container start idempotent. The
 * prefix is what `isSessionBranch` keys on, so `session list` and the
 * lifecycle skill's submit and reclaim steps treat it as any other session.
 */
export function updateBranchName(config: StoreConfig): string {
  return `${config.session.branch_prefix}ctxr-update-${CLI_VERSION}`;
}

async function branchExists(env: RunEnv, root: string, branch: string, remoteExists: boolean): Promise<boolean> {
  const local = await env.git.run(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], {
    cwd: root,
    allowFailure: true,
  });
  if (local.exitCode === 0) return true;
  if (!remoteExists) return false;
  // Exit 0 is "found"; 2 is "no such ref". Anything else — an unreachable remote —
  // is not evidence the branch exists, and the fetch below will fail on its own terms.
  const remote = await env.git.run(['ls-remote', '--exit-code', '--heads', 'origin', branch], {
    cwd: root,
    allowFailure: true,
  });
  return remote.exitCode === 0;
}

/**
 * `ctxr update --worktree`: migrate and re-render in a worktree this command
 * creates for itself, never in the checkout it was invoked from.
 *
 * `store` is the INVOKING checkout's configuration, migrated in memory only. It
 * supplies the branch prefix, worktrees path and default branch in their
 * current shape, so a step that renames one of them cannot strand the command
 * before it starts. The worktree's own `contexture.yaml` — from the freshly
 * fetched default branch, which may be ahead of the invoking checkout — is
 * what gets migrated and written.
 *
 * It commits nothing. Whether the branch is pushed, reviewed or thrown away is
 * the caller's decision.
 */
export async function executeInWorktree(env: RunEnv, store: MigratingStore): Promise<CommandOutcome<UpdateData>> {
  const git = env.git;
  const branch = updateBranchName(store.config);
  const remoteExists = await hasRemote(git, store.root);

  if (await branchExists(env, store.root, branch, remoteExists)) {
    return {
      exitCode: ExitCode.Ok,
      data: { changed: [], worktree: null, branch, existing: true },
      findings: [],
      humanSummary: `Branch "${branch}" already exists; nothing was done.`,
      storeRoot: store.root,
      schemaVersion: store.config.schema_version,
    };
  }

  const defaultBranch = store.config.git.default_branch;
  const fetched = remoteExists ? await fetchOrigin(git, store.root, defaultBranch) : false;
  const startPoint = fetched ? `origin/${defaultBranch}` : defaultBranch;
  const worktreeDir = worktreePathFor(store, branch);

  const added = await addWorktree(git, store.root, worktreeDir, branch, startPoint, { allowFailure: true });
  if (added.exitCode !== 0) throw new SessionWorktreeRefusedError(branch, worktreeDir, added.stderr);

  const discard = async (): Promise<void> => {
    await removeWorktree(git, store.root, worktreeDir);
    await git.run(['branch', '-D', branch], { cwd: store.root, allowFailure: true });
  };

  let outcome: CommandOutcome<UpdateData>;
  try {
    const read = await readConfigMigrating(worktreeDir, env.migrationSteps ?? MIGRATION_STEPS);
    outcome = await execute(env, { root: worktreeDir, ...read });
  } catch (err) {
    // A refused or failed run leaves nothing behind for the next run to trip over.
    await discard();
    throw err;
  }

  const data = outcome.data ?? { changed: [] };
  if (data.changed.length === 0) {
    await discard();
    return {
      ...outcome,
      data: { changed: [], worktree: null, branch, existing: false },
      humanSummary: 'Store is already up to date.',
      storeRoot: store.root,
    };
  }

  return {
    ...outcome,
    data: { ...data, worktree: worktreeDir, branch, existing: false },
    humanSummary: `${outcome.humanSummary} Worktree "${worktreeDir}" on branch "${branch}" (from ${startPoint}), uncommitted.`,
    storeRoot: store.root,
  };
}
