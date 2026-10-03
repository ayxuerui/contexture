import type { Document } from 'yaml';
import { readConfig, readConfigMigrating } from '../config/load.js';
import { MIGRATION_STEPS } from '../config/migrations.js';
import type { StoreConfig } from '../config/schema.js';
import type { RunEnv } from './env.js';
import { NotAGitRepositoryError } from './errors.js';
import { isInsideGitRepo } from './git/repo.js';
import { resolveExistingRoot, type RootFlags } from './root.js';

export interface Store {
  root: string;
  config: StoreConfig;
}

/**
 * The choke point every non-`init` command goes through: root resolution,
 * then the git-repository check (context-store spec), then config load
 * (which itself gates schema_version — store-lifecycle spec). Done once,
 * structurally, here — so no command can skip either check by omission.
 */
export async function openStore(env: RunEnv, flags: RootFlags): Promise<Store> {
  const root = resolveExistingRoot(env, flags);
  if (!(await isInsideGitRepo(env.git, root))) {
    throw new NotAGitRepositoryError(root);
  }
  const config = await readConfig(root, env.migrationSteps ?? MIGRATION_STEPS);
  return { root, config };
}

export interface MigratingStore extends Store {
  /** The configuration document to write back when `migratedFrom` is set. */
  document: Document;
  /** The schema version the store was recorded at, when it was migrated in memory; null when already current. */
  migratedFrom: number | null;
}

/**
 * migrate-stores-on-update: `openStore` for `ctxr update` alone — the same root
 * resolution and git check, then the one configuration read allowed to carry an
 * older store forward (in memory; nothing is written here). No other command
 * may call this: the schema-version gate's exception is update's, and only
 * update's.
 */
export async function openStoreMigrating(env: RunEnv, flags: RootFlags): Promise<MigratingStore> {
  const root = resolveExistingRoot(env, flags);
  if (!(await isInsideGitRepo(env.git, root))) {
    throw new NotAGitRepositoryError(root);
  }
  const read = await readConfigMigrating(root, env.migrationSteps ?? MIGRATION_STEPS);
  return { root, config: read.config, document: read.document, migratedFrom: read.migratedFrom };
}
