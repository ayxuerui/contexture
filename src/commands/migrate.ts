import type { CommandOutcome, CommandRequires } from '../core/command.js';
import { readConfig } from '../config/load.js';
import { SUPPORTED_SCHEMA_VERSION } from '../config/schema.js';
import { ExitCode } from '../core/exit-codes.js';
import type { MigrationDelta } from '../core/migrations/types.js';
import { pendingMigrations } from '../core/migrations/registry.js';
import type { Store } from '../core/store.js';

export const requires: CommandRequires = { store: 'required' };

export interface MigrateFlags {
  dryRun?: boolean;
}

export interface MigrateMigrationResult {
  id: string;
  fromVersion: number;
  toVersion: number;
  deltas: MigrationDelta[];
}

export interface MigrateData {
  currentVersion: number;
  targetVersion: number;
  applied: boolean;
  migrations: MigrateMigrationResult[];
}

/**
 * store-lifecycle spec: `--dry-run` reports exact deltas with nothing
 * applied; a real run applies each pending migration in order, reloading
 * the store's config after each one so a later migration in the chain
 * (none exist yet, but the mechanism supports it) sees the version it
 * actually needs to start from. Resumability is a property of each
 * migration's own plan()/apply() (see core/migrations/types.ts) — this
 * command does no extra bookkeeping of its own.
 */
export async function execute(store: Store, flags: MigrateFlags): Promise<CommandOutcome<MigrateData>> {
  const pending = pendingMigrations(store.config.schema_version);
  const startingVersion = store.config.schema_version;

  if (pending.length === 0) {
    return {
      exitCode: ExitCode.Ok,
      data: { currentVersion: startingVersion, targetVersion: SUPPORTED_SCHEMA_VERSION, applied: false, migrations: [] },
      findings: [],
      humanSummary: `Already at schema_version ${startingVersion}; nothing to migrate.`,
      storeRoot: store.root,
      schemaVersion: store.config.schema_version,
    };
  }

  const results: MigrateMigrationResult[] = [];
  let workingStore = store;

  for (const migration of pending) {
    if (flags.dryRun) {
      const deltas = await migration.plan(workingStore);
      results.push({ id: migration.id, fromVersion: migration.fromVersion, toVersion: migration.toVersion, deltas });
      continue;
    }
    const deltas = await migration.apply(workingStore);
    results.push({ id: migration.id, fromVersion: migration.fromVersion, toVersion: migration.toVersion, deltas });
    workingStore = { root: workingStore.root, config: await readConfig(workingStore.root) };
  }

  return {
    exitCode: ExitCode.Ok,
    data: {
      currentVersion: startingVersion,
      targetVersion: SUPPORTED_SCHEMA_VERSION,
      applied: !flags.dryRun,
      migrations: results,
    },
    findings: [],
    humanSummary: flags.dryRun
      ? `--dry-run: ${results.reduce((n, r) => n + r.deltas.length, 0)} change(s) would be made across ${results.length} migration(s).`
      : `Applied ${results.length} migration(s), now at schema_version ${workingStore.config.schema_version}.`,
    storeRoot: store.root,
    schemaVersion: flags.dryRun ? store.config.schema_version : workingStore.config.schema_version,
  };
}
