import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renameProceduresPathMigration } from '../../src/core/migrations/rename-procedures-path.js';
import { renameVisibilityFieldMigration } from '../../src/core/migrations/rename-visibility-field.js';
import { pendingMigrations } from '../../src/core/migrations/registry.js';
import type { Store } from '../../src/core/store.js';
import { readConfig } from '../../src/config/load.js';
import { renderStoreConfig } from '../../src/config/render.js';
import type { StoreConfig } from '../../src/config/schema.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

function makeV1Config(): StoreConfig {
  return {
    schema_version: 1,
    taxonomy: { profile: 'para', layers: [{ name: 'Projects', path: 'projects', description: 'Active work.' }] },
    fields: { visibility: 'scope' },
    visibility: { default_context: 'private', directory_defaults: {}, contexts: {} },
    derived: { paths: [] },
    retrieval: { exclude_paths: [], relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } },
    git: { default_branch: 'main' },
    session: { branch_prefix: 'session/', worktrees_path: '.worktrees/', workspaces_external: false },
    write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] },
    catalog: { path: 'catalog/', section_max_bytes: 32768 },
    disclosure: { internal_audiences: [], hard_walls: [], leak_markers: {} },
    ingest: { inbox_path: 'inbox/', tracking_params: [] },
    organize: { archive_path: 'archive/', rollup_stale_days: 7 },
    harness: { skills_path: 'procedures/', conventions_path: 'conventions/' },
    adapters: [],
  };
}

async function setUpV1Store(root: string): Promise<Store> {
  const config = makeV1Config();
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, 'contexture.yaml'), renderStoreConfig(config));
  return { root, config };
}

async function setUpV2StoreWithProceduresPath(root: string): Promise<Store> {
  await mkdir(root, { recursive: true });
  const text = [
    'schema_version: 2',
    'taxonomy: { profile: para, layers: [] }',
    'fields: { visibility: lens }',
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
    'harness: { procedures_path: procedures/, conventions_path: conventions/ }',
    'adapters: []',
    '',
  ].join('\n');
  await writeFile(path.join(root, 'contexture.yaml'), text);
  return { root, config: await readConfig(root) };
}

async function writeNote(root: string, relPath: string, content: string): Promise<void> {
  const full = path.join(root, relPath);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content);
}

describe('pendingMigrations', () => {
  it('includes both migrations, in order, for a store at schema_version 1', () => {
    expect(pendingMigrations(1).map((m) => m.id)).toEqual([
      renameVisibilityFieldMigration.id,
      renameProceduresPathMigration.id,
    ]);
  });

  it('includes only the procedures-path rename for a store at schema_version 2', () => {
    expect(pendingMigrations(2).map((m) => m.id)).toEqual([renameProceduresPathMigration.id]);
  });

  it('is empty for a store already at the current schema version', () => {
    expect(pendingMigrations(3)).toEqual([]);
  });
});

describe('renameVisibilityFieldMigration', () => {
  it('plan() reports every note carrying the old key, plus the config change, with nothing written', async () => {
    const tmp = await makeTmpDir();
    try {
      const store = await setUpV1Store(tmp.root);
      await writeNote(tmp.root, 'projects/a.md', '---\nscope: shared\n---\nContent.\n');
      await writeNote(tmp.root, 'projects/b.md', '---\ntitle: No visibility field\n---\nContent.\n');

      const deltas = await renameVisibilityFieldMigration.plan(store);
      expect(deltas.map((d) => d.path).sort()).toEqual(['contexture.yaml', 'projects/a.md']);

      const noteContent = await readFile(path.join(tmp.root, 'projects/a.md'), 'utf8');
      expect(noteContent).toContain('scope: shared');
      const configContent = await readFile(path.join(tmp.root, 'contexture.yaml'), 'utf8');
      expect(configContent).toContain('schema_version: 1');
    } finally {
      await tmp.cleanup();
    }
  });

  it('apply() renames the field on every affected note and bumps the config', async () => {
    const tmp = await makeTmpDir();
    try {
      const store = await setUpV1Store(tmp.root);
      await writeNote(tmp.root, 'projects/a.md', '---\nscope: shared\ntitle: Keep me\n---\nContent.\n');
      await writeNote(tmp.root, 'projects/b.md', '---\ntitle: No visibility field\n---\nContent.\n');

      await renameVisibilityFieldMigration.apply(store);

      const noteA = await readFile(path.join(tmp.root, 'projects/a.md'), 'utf8');
      expect(noteA).toContain('lens: shared');
      expect(noteA).not.toContain('scope:');
      expect(noteA).toContain('title: Keep me');

      const noteB = await readFile(path.join(tmp.root, 'projects/b.md'), 'utf8');
      expect(noteB).toContain('title: No visibility field');
      expect(noteB).not.toContain('lens:');

      const config = await readConfig(tmp.root);
      expect(config.schema_version).toBe(2);
      expect(config.fields.visibility).toBe('lens');
    } finally {
      await tmp.cleanup();
    }
  });

  it('is resumable: applying twice is idempotent and only touches what still needs it', async () => {
    const tmp = await makeTmpDir();
    try {
      const store = await setUpV1Store(tmp.root);
      await writeNote(tmp.root, 'projects/a.md', '---\nscope: shared\n---\nContent.\n');
      await writeNote(tmp.root, 'projects/b.md', '---\nscope: private\n---\nContent.\n');

      // Simulate an interruption: only b.md got renamed, config never bumped.
      await writeNote(tmp.root, 'projects/b.md', '---\nlens: private\n---\nContent.\n');

      const resumed = await renameVisibilityFieldMigration.apply(store);
      expect(resumed.map((d) => d.path)).toEqual(['projects/a.md', 'contexture.yaml']);

      const config = await readConfig(tmp.root);
      expect(config.schema_version).toBe(2);

      const second = await renameVisibilityFieldMigration.apply({ root: tmp.root, config });
      expect(second).toEqual([]);
    } finally {
      await tmp.cleanup();
    }
  });
});

describe('renameProceduresPathMigration', () => {
  it('plan() reports the one config delta and writes nothing (dry-run)', async () => {
    const tmp = await makeTmpDir();
    try {
      const store = await setUpV2StoreWithProceduresPath(tmp.root);
      const deltas = await renameProceduresPathMigration.plan(store);
      expect(deltas).toEqual([
        { path: 'contexture.yaml', description: 'rename harness.procedures_path to harness.skills_path and set schema_version to 3' },
      ]);

      const configContent = await readFile(path.join(tmp.root, 'contexture.yaml'), 'utf8');
      expect(configContent).toContain('schema_version: 2');
      expect(configContent).toContain('procedures_path: procedures/');
    } finally {
      await tmp.cleanup();
    }
  });

  it('apply() renames the key and bumps the config to schema_version 3', async () => {
    const tmp = await makeTmpDir();
    try {
      const store = await setUpV2StoreWithProceduresPath(tmp.root);
      const applied = await renameProceduresPathMigration.apply(store);
      expect(applied).toEqual([
        { path: 'contexture.yaml', description: 'rename harness.procedures_path to harness.skills_path and set schema_version to 3' },
      ]);

      const configContent = await readFile(path.join(tmp.root, 'contexture.yaml'), 'utf8');
      expect(configContent).not.toContain('procedures_path');
      expect(configContent).toContain('skills_path: procedures/');
      expect(configContent).toContain('schema_version: 3');

      const config = await readConfig(tmp.root);
      expect(config.schema_version).toBe(3);
      expect(config.harness.skills_path).toBe('procedures/');
    } finally {
      await tmp.cleanup();
    }
  });

  it('is resumable: a second apply() on an already-migrated store changes nothing', async () => {
    const tmp = await makeTmpDir();
    try {
      const store = await setUpV2StoreWithProceduresPath(tmp.root);
      await renameProceduresPathMigration.apply(store);

      const migratedConfig = await readConfig(tmp.root);
      const second = await renameProceduresPathMigration.apply({ root: tmp.root, config: migratedConfig });
      expect(second).toEqual([]);

      const configContent = await readFile(path.join(tmp.root, 'contexture.yaml'), 'utf8');
      expect(configContent).toContain('schema_version: 3');
    } finally {
      await tmp.cleanup();
    }
  });

  it('a v1 store runs the visibility rename then the procedures-path rename, in order', async () => {
    const tmp = await makeTmpDir();
    try {
      const store = await setUpV1Store(tmp.root);

      let workingStore = store;
      for (const migration of pendingMigrations(workingStore.config.schema_version)) {
        await migration.apply(workingStore);
        workingStore = { root: tmp.root, config: await readConfig(tmp.root) };
      }

      expect(workingStore.config.schema_version).toBe(3);
      expect(workingStore.config.fields.visibility).toBe('lens');
      expect(workingStore.config.harness.skills_path).toBe('procedures/');

      const configContent = await readFile(path.join(tmp.root, 'contexture.yaml'), 'utf8');
      expect(configContent).not.toContain('procedures_path');
      expect(pendingMigrations(workingStore.config.schema_version)).toEqual([]);
    } finally {
      await tmp.cleanup();
    }
  });
});
