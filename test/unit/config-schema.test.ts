import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readConfig } from '../../src/config/load.js';
import { InvalidConfigError, SchemaVersionMissingError, SchemaVersionNewerError } from '../../src/core/errors.js';
import { CONFIG_FILE_NAME } from '../../src/core/root.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

const FIXTURES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/config');

describe('readConfig', () => {
  it('throws SchemaVersionNewerError when schema_version exceeds SUPPORTED_SCHEMA_VERSION', async () => {
    const tmp = await makeTmpDir();
    try {
      const text = await readFile(path.join(FIXTURES_DIR, 'newer-schema.yaml'), 'utf8');
      await writeFile(path.join(tmp.root, CONFIG_FILE_NAME), text);
      await expect(readConfig(tmp.root)).rejects.toBeInstanceOf(SchemaVersionNewerError);
    } finally {
      await tmp.cleanup();
    }
  });

  it('throws SchemaVersionMissingError when schema_version is absent', async () => {
    const tmp = await makeTmpDir();
    try {
      const text = await readFile(path.join(FIXTURES_DIR, 'missing-schema-version.yaml'), 'utf8');
      await writeFile(path.join(tmp.root, CONFIG_FILE_NAME), text);
      await expect(readConfig(tmp.root)).rejects.toBeInstanceOf(SchemaVersionMissingError);
    } finally {
      await tmp.cleanup();
    }
  });

  it('throws InvalidConfigError naming the offending key on a shape mismatch', async () => {
    const tmp = await makeTmpDir();
    try {
      await writeFile(path.join(tmp.root, CONFIG_FILE_NAME), 'schema_version: 1\ntaxonomy: "not an object"\n');
      await expect(readConfig(tmp.root)).rejects.toBeInstanceOf(InvalidConfigError);
    } finally {
      await tmp.cleanup();
    }
  });

  it('accepts unknown top-level keys (loose validation)', async () => {
    const tmp = await makeTmpDir();
    try {
      const text = [
        'schema_version: 1',
        'taxonomy: { profile: para, layers: [] }',
        'fields: { visibility: scope }',
        'visibility: { default_context: private, directory_defaults: {} }',
        'derived: { paths: [] }',
        'retrieval: { exclude_paths: [] }',
        'git: { default_branch: main }',
        'session: { branch_prefix: session/, worktrees_path: .worktrees/ }',
        'write_lifecycle: { diff_size_ceiling_lines: 2000 }',
        'catalog: { path: catalog/, section_max_bytes: 32768 }',
        'disclosure: { internal_audiences: [], hard_walls: [] }',
        'ingest: { inbox_path: inbox/ }',
        'a_future_section: { anything: true }',
        '',
      ].join('\n');
      await writeFile(path.join(tmp.root, CONFIG_FILE_NAME), text);
      const config = await readConfig(tmp.root);
      expect(config.schema_version).toBe(1);
    } finally {
      await tmp.cleanup();
    }
  });
});
