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

  it('leaves mission_path undefined when the key is not declared', async () => {
    const tmp = await makeTmpDir();
    try {
      const text = [
        'schema_version: 1',
        'taxonomy: { profile: para, layers: [] }',
        'fields: { visibility: scope }',
        'visibility: { default_context: private, directory_defaults: {} }',
        'derived: { paths: [] }',
        'retrieval: { exclude_paths: [], relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } }',
        'git: { default_branch: main }',
        'session: { branch_prefix: session/, worktrees_path: .worktrees/ }',
        'write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] }',
        'catalog: { path: catalog/, section_max_bytes: 32768 }',
        'disclosure: { internal_audiences: [], hard_walls: [], leak_markers: {} }',
        'ingest: { inbox_path: inbox/ }',
        'organize: { archive_path: archive/ }',
        'harness: { procedures_path: procedures/ }',
        'adapters: []',
        '',
      ].join('\n');
      await writeFile(path.join(tmp.root, CONFIG_FILE_NAME), text);
      const config = await readConfig(tmp.root);
      expect(config.organize.mission_path).toBeUndefined();
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
        'retrieval: { exclude_paths: [], relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } }',
        'git: { default_branch: main }',
        'session: { branch_prefix: session/, worktrees_path: .worktrees/ }',
        'write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] }',
        'catalog: { path: catalog/, section_max_bytes: 32768 }',
        'disclosure: { internal_audiences: [], hard_walls: [], leak_markers: {} }',
        'ingest: { inbox_path: inbox/ }',
        'organize: { archive_path: archive/ }',
        "identity: { path: identity/, files: {}, entry_delimiter: '' }",
        'harness: { procedures_path: procedures/ }',
        'adapters: []',
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

describe('harness.skills_path / procedures_path fallback (rename-procedures-to-skills)', () => {
  it('loads a schema-3 config that declares skills_path', async () => {
    const tmp = await makeTmpDir();
    try {
      const text = [
        'schema_version: 3',
        'taxonomy: { profile: para, layers: [] }',
        'fields: { visibility: scope }',
        'visibility: { default_context: private, directory_defaults: {} }',
        'derived: { paths: [] }',
        'retrieval: { exclude_paths: [], relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } }',
        'git: { default_branch: main }',
        'session: { branch_prefix: session/, worktrees_path: .worktrees/ }',
        'write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] }',
        'catalog: { path: catalog/, section_max_bytes: 32768 }',
        'disclosure: { internal_audiences: [], hard_walls: [], leak_markers: {} }',
        'ingest: { inbox_path: inbox/ }',
        'organize: { archive_path: archive/ }',
        'harness: { skills_path: .claude/skills/ }',
        'adapters: []',
      ].join('\n');
      await writeFile(path.join(tmp.root, CONFIG_FILE_NAME), text);
      const config = await readConfig(tmp.root);
      expect(config.harness.skills_path).toBe('.claude/skills/');
      expect((config.harness as Record<string, unknown>).procedures_path).toBeUndefined();
    } finally {
      await tmp.cleanup();
    }
  });

  it('loads a schema-2 config that declares only the old procedures_path key', async () => {
    const tmp = await makeTmpDir();
    try {
      const text = [
        'schema_version: 2',
        'taxonomy: { profile: para, layers: [] }',
        'fields: { visibility: scope }',
        'visibility: { default_context: private, directory_defaults: {} }',
        'derived: { paths: [] }',
        'retrieval: { exclude_paths: [], relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } }',
        'git: { default_branch: main }',
        'session: { branch_prefix: session/, worktrees_path: .worktrees/ }',
        'write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] }',
        'catalog: { path: catalog/, section_max_bytes: 32768 }',
        'disclosure: { internal_audiences: [], hard_walls: [], leak_markers: {} }',
        'ingest: { inbox_path: inbox/ }',
        'organize: { archive_path: archive/ }',
        'harness: { procedures_path: procedures/ }',
        'adapters: []',
      ].join('\n');
      await writeFile(path.join(tmp.root, CONFIG_FILE_NAME), text);
      const config = await readConfig(tmp.root);
      expect(config.harness.skills_path).toBe('procedures/');
    } finally {
      await tmp.cleanup();
    }
  });

  it('prefers skills_path when both keys are present', async () => {
    const tmp = await makeTmpDir();
    try {
      const text = [
        'schema_version: 3',
        'taxonomy: { profile: para, layers: [] }',
        'fields: { visibility: scope }',
        'visibility: { default_context: private, directory_defaults: {} }',
        'derived: { paths: [] }',
        'retrieval: { exclude_paths: [], relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } }',
        'git: { default_branch: main }',
        'session: { branch_prefix: session/, worktrees_path: .worktrees/ }',
        'write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] }',
        'catalog: { path: catalog/, section_max_bytes: 32768 }',
        'disclosure: { internal_audiences: [], hard_walls: [], leak_markers: {} }',
        'ingest: { inbox_path: inbox/ }',
        'organize: { archive_path: archive/ }',
        'harness: { skills_path: .claude/skills/, procedures_path: old-procedures/ }',
        'adapters: []',
      ].join('\n');
      await writeFile(path.join(tmp.root, CONFIG_FILE_NAME), text);
      const config = await readConfig(tmp.root);
      expect(config.harness.skills_path).toBe('.claude/skills/');
    } finally {
      await tmp.cleanup();
    }
  });

  it('fails with a message naming ctxr migrate when neither key is present', async () => {
    const tmp = await makeTmpDir();
    try {
      const text = [
        'schema_version: 3',
        'taxonomy: { profile: para, layers: [] }',
        'fields: { visibility: scope }',
        'visibility: { default_context: private, directory_defaults: {} }',
        'derived: { paths: [] }',
        'retrieval: { exclude_paths: [], relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } }',
        'git: { default_branch: main }',
        'session: { branch_prefix: session/, worktrees_path: .worktrees/ }',
        'write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] }',
        'catalog: { path: catalog/, section_max_bytes: 32768 }',
        'disclosure: { internal_audiences: [], hard_walls: [], leak_markers: {} }',
        'ingest: { inbox_path: inbox/ }',
        'organize: { archive_path: archive/ }',
        'harness: {}',
        'adapters: []',
      ].join('\n');
      await writeFile(path.join(tmp.root, CONFIG_FILE_NAME), text);
      await expect(readConfig(tmp.root)).rejects.toMatchObject({
        message: expect.stringContaining('ctxr migrate'),
      });
    } finally {
      await tmp.cleanup();
    }
  });
});

describe('adapters kind: forge / session.workspaces_external leniency (session-keeps-only-what-git-cannot-do D2)', () => {
  it('loads a schema-4 config still declaring a legacy forge adapter and workspaces_external, dropping both', async () => {
    const tmp = await makeTmpDir();
    try {
      const text = [
        'schema_version: 4',
        'taxonomy: { profile: para, layers: [] }',
        'fields: { visibility: scope }',
        'visibility: { default_context: private, directory_defaults: {} }',
        'derived: { paths: [] }',
        'retrieval: { exclude_paths: [], relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } }',
        'git: { default_branch: main }',
        'session: { branch_prefix: session/, worktrees_path: .worktrees/, workspaces_external: true }',
        'write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] }',
        'catalog: { path: catalog/, section_max_bytes: 32768 }',
        'disclosure: { internal_audiences: [], hard_walls: [], leak_markers: {} }',
        'ingest: { inbox_path: inbox/ }',
        'organize: { archive_path: archive/ }',
        'harness: { skills_path: skills/, guidance_path: guidance/ }',
        'adapters: [{ id: github, kind: forge }, { id: claude-code, kind: harness-generation }]',
      ].join('\n');
      await writeFile(path.join(tmp.root, CONFIG_FILE_NAME), text);
      const config = await readConfig(tmp.root);
      expect(config.adapters).toEqual([{ id: 'claude-code', kind: 'harness-generation' }]);
      expect((config.session as Record<string, unknown>).workspaces_external).toBeUndefined();
    } finally {
      await tmp.cleanup();
    }
  });

  it('still rejects a genuinely unrecognized adapter kind', async () => {
    const tmp = await makeTmpDir();
    try {
      const text = [
        'schema_version: 4',
        'taxonomy: { profile: para, layers: [] }',
        'fields: { visibility: scope }',
        'visibility: { default_context: private, directory_defaults: {} }',
        'derived: { paths: [] }',
        'retrieval: { exclude_paths: [], relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } }',
        'git: { default_branch: main }',
        'session: { branch_prefix: session/, worktrees_path: .worktrees/ }',
        'write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] }',
        'catalog: { path: catalog/, section_max_bytes: 32768 }',
        'disclosure: { internal_audiences: [], hard_walls: [], leak_markers: {} }',
        'ingest: { inbox_path: inbox/ }',
        'organize: { archive_path: archive/ }',
        'harness: { skills_path: skills/, guidance_path: guidance/ }',
        'adapters: [{ id: something, kind: not-a-real-kind }]',
      ].join('\n');
      await writeFile(path.join(tmp.root, CONFIG_FILE_NAME), text);
      await expect(readConfig(tmp.root)).rejects.toBeInstanceOf(InvalidConfigError);
    } finally {
      await tmp.cleanup();
    }
  });
});
