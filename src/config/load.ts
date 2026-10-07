import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseDocument, type Document } from 'yaml';
import { CONFIG_FILE_NAME } from '../core/root.js';
import {
  InvalidConfigError,
  SchemaMigrationFailedError,
  SchemaVersionBehindError,
  SchemaVersionMissingError,
  SchemaVersionNewerError,
} from '../core/errors.js';
import { MIGRATION_STEPS, migrationFloor, MigrationStepFailedError, runMigrations, type MigrationStep } from './migrations.js';
import { StoreConfigSchema, SUPPORTED_SCHEMA_VERSION, type StoreConfig } from './schema.js';

export function configPathFor(root: string): string {
  return path.join(root, CONFIG_FILE_NAME);
}

/**
 * store-lifecycle spec: "Schema version is recorded and gated" — every
 * command reads schema_version before operating. This peeks at it loosely,
 * BEFORE full validation, so a store whose recorded version differs in either
 * direction reports the version rather than the confusing generic
 * shape-validation error the full schema would otherwise produce.
 *
 * `steps` is the migration ladder the gate measures its floor against. It is
 * only ever overridden by tests; every command passes the shipped one.
 */
export async function readConfig(root: string, steps: readonly MigrationStep[] = MIGRATION_STEPS): Promise<StoreConfig> {
  return (await loadConfig(root, { migrate: false, steps })).config;
}

export interface MigratingRead {
  config: StoreConfig;
  /** The document as it should be written: migrated when `migratedFrom` is set, otherwise as read. */
  document: Document;
  /** The schema version the store was recorded at, when a migration ran; null when it was already current. */
  migratedFrom: number | null;
}

/**
 * migrate-stores-on-update (design D2): the one exception to the gate, for
 * `ctxr update` alone. A store recorded at an older version that is at or
 * above the migration floor is carried forward IN MEMORY and validated; the
 * caller decides whether and where the migrated document is written. Every
 * other refusal — newer, missing, below the floor — is identical to
 * `readConfig`'s, because it is the same function.
 */
export async function readConfigMigrating(
  root: string,
  steps: readonly MigrationStep[] = MIGRATION_STEPS,
): Promise<MigratingRead> {
  return loadConfig(root, { migrate: true, steps });
}

async function loadConfig(
  root: string,
  mode: { migrate: boolean; steps: readonly MigrationStep[] },
): Promise<MigratingRead> {
  const configPath = configPathFor(root);
  const text = await readFile(configPath, 'utf8');

  // A Document, not a plain value: a migration has to write back everything it
  // did not change — comments and key order included — and only the parsed
  // document carries those.
  const document = parseDocument(text);
  if (document.errors.length > 0) {
    throw new InvalidConfigError(configPath, [
      { path: '(root)', message: document.errors.map((err) => err.message).join('; ') },
    ]);
  }
  const raw: unknown = document.toJS();

  const rawVersion = (raw as { schema_version?: unknown } | null)?.schema_version;
  if (rawVersion === undefined || rawVersion === null) {
    throw new SchemaVersionMissingError(configPath);
  }
  if (typeof rawVersion !== 'number' || !Number.isInteger(rawVersion)) {
    throw new InvalidConfigError(configPath, [{ path: 'schema_version', message: 'must be an integer' }]);
  }
  if (rawVersion > SUPPORTED_SCHEMA_VERSION) {
    throw new SchemaVersionNewerError(rawVersion, SUPPORTED_SCHEMA_VERSION);
  }

  let toValidate: Document = document;
  let migratedFrom: number | null = null;
  /**
   * The older direction is refused here, before `safeParse`, for every command
   * but update — or an older config fails on the keys whose superseded
   * spellings the schema no longer accepts, reporting a shape error against
   * keys the operator never wrote instead of the version. Update migrates the
   * raw document first instead, so the typed schema still only ever sees the
   * current spellings.
   */
  if (rawVersion < SUPPORTED_SCHEMA_VERSION) {
    const floor = migrationFloor(mode.steps);
    if (!mode.migrate || rawVersion < floor) {
      throw new SchemaVersionBehindError(rawVersion, SUPPORTED_SCHEMA_VERSION, floor);
    }
    try {
      toValidate = runMigrations(document, rawVersion, mode.steps);
    } catch (err) {
      if (err instanceof MigrationStepFailedError) throw new SchemaMigrationFailedError(configPath, err.message);
      throw err;
    }
    migratedFrom = rawVersion;
  }

  const result = StoreConfigSchema.safeParse(toValidate.toJS());
  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({
      path: issue.path.join('.') || '(root)',
      message: issue.message,
    }));
    if (migratedFrom !== null) {
      throw new SchemaMigrationFailedError(
        configPath,
        `the migrated configuration does not validate: ${issues.map((i) => `${i.path}: ${i.message}`).join('; ')}`,
      );
    }
    throw new InvalidConfigError(configPath, issues);
  }
  return { config: result.data, document: toValidate, migratedFrom };
}
