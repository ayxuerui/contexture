import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { CONFIG_FILE_NAME } from '../core/root.js';
import {
  InvalidConfigError,
  SchemaVersionMissingError,
  SchemaVersionNewerError,
} from '../core/errors.js';
import { StoreConfigSchema, SUPPORTED_SCHEMA_VERSION, type StoreConfig } from './schema.js';

export function configPathFor(root: string): string {
  return path.join(root, CONFIG_FILE_NAME);
}

/**
 * store-lifecycle spec: "Schema version is recorded and gated" — every
 * command reads schema_version before operating. This peeks at it loosely,
 * BEFORE full validation, so a store with a genuinely newer/incompatible
 * shape reports "your version is newer" rather than a confusing generic
 * shape-validation error the full schema would otherwise produce.
 */
export async function readConfig(root: string): Promise<StoreConfig> {
  const configPath = configPathFor(root);
  const text = await readFile(configPath, 'utf8');

  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (err) {
    throw new InvalidConfigError(configPath, [
      { path: '(root)', message: err instanceof Error ? err.message : String(err) },
    ]);
  }

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

  const result = StoreConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({
      path: issue.path.join('.') || '(root)',
      message: issue.message,
    }));
    throw new InvalidConfigError(configPath, issues);
  }
  return result.data;
}
