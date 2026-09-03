import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { dropAccessAxesMigration } from '../../src/core/migrations/drop-access-axes.js';
import { archiveDestinationFromTaxonomyMigration } from '../../src/core/migrations/archive-destination-from-taxonomy.js';
import { dropForgeAndWorkspacesExternalMigration } from '../../src/core/migrations/drop-forge-and-workspaces-external.js';
import { renameConventionsPathMigration } from '../../src/core/migrations/rename-conventions-path.js';
import { renameProceduresPathMigration } from '../../src/core/migrations/rename-procedures-path.js';
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
    derived: { paths: [] },
    retrieval: { exclude_paths: [], relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } },
    git: { default_branch: 'main' },
    session: { branch_prefix: 'session/', worktrees_path: '.worktrees/' },
    write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] },
    catalog: { path: 'catalog/', section_max_bytes: 32768 },
    publish: { path: 'publish/' },
    skills: { vendored: [] },
    ingest: { inbox_path: 'inbox/', tracking_params: [] },
    organize: { archive_destination: 'archive/', rollup_stale_days: 7 },
    harness: { skills_path: 'procedures/', guidance_path: 'conventions/' },
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

async function setUpV3StoreWithConventionsPath(root: string, conventionsPath = '.contexture/conventions/'): Promise<Store> {
  await mkdir(root, { recursive: true });
  const text = [
    'schema_version: 3',
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
    `harness: { skills_path: skills/, conventions_path: ${conventionsPath} }`,
    'adapters: []',
    '',
  ].join('\n');
  await writeFile(path.join(root, 'contexture.yaml'), text);
  return { root, config: await readConfig(root) };
}

async function setUpV4StoreWithLegacyForgeAndWorkspacesExternal(root: string): Promise<Store> {
  await mkdir(root, { recursive: true });
  const text = [
    'schema_version: 4',
    'taxonomy: { profile: para, layers: [] }',
    'fields: { visibility: lens }',
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
    '',
  ].join('\n');
  await writeFile(path.join(root, 'contexture.yaml'), text);
  return { root, config: await readConfig(root) };
}

async function setUpV5Store(root: string, opts: { profile?: string; archivePath?: string } = {}): Promise<Store> {
  const profile = opts.profile ?? 'para';
  const archivePath = opts.archivePath ?? 'archive/';
  await mkdir(root, { recursive: true });
  const text = [
    'schema_version: 5',
    `taxonomy: { profile: ${profile}, layers: [] }`,
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
    `organize: { archive_path: ${archivePath} }`,
    'harness: { skills_path: skills/, guidance_path: guidance/ }',
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
  // The 1 -> 2 migration was retired with the visibility field it renamed
  // (retire-the-access-axes D7), so the chain starts at 2 -> 3 for a v1 store.
  it('includes all five migrations, in order, for a store at schema_version 1', () => {
    expect(pendingMigrations(1).map((m) => m.id)).toEqual([
      renameProceduresPathMigration.id,
      renameConventionsPathMigration.id,
      dropForgeAndWorkspacesExternalMigration.id,
      archiveDestinationFromTaxonomyMigration.id,
      dropAccessAxesMigration.id,
    ]);
  });

  it('includes the procedures-path, conventions-path, and forge/workspaces_external migrations for a store at schema_version 2', () => {
    expect(pendingMigrations(2).map((m) => m.id)).toEqual([
      renameProceduresPathMigration.id,
      renameConventionsPathMigration.id,
      dropForgeAndWorkspacesExternalMigration.id,
      archiveDestinationFromTaxonomyMigration.id,
      dropAccessAxesMigration.id,
    ]);
  });

  it('includes the conventions-path, forge/workspaces_external, and archive-destination migrations for a store at schema_version 3', () => {
    expect(pendingMigrations(3).map((m) => m.id)).toEqual([
      renameConventionsPathMigration.id,
      dropForgeAndWorkspacesExternalMigration.id,
      archiveDestinationFromTaxonomyMigration.id,
      dropAccessAxesMigration.id,
    ]);
  });

  it('includes the forge/workspaces_external and archive-destination migrations for a store at schema_version 4', () => {
    expect(pendingMigrations(4).map((m) => m.id)).toEqual([
      dropForgeAndWorkspacesExternalMigration.id,
      archiveDestinationFromTaxonomyMigration.id,
      dropAccessAxesMigration.id,
    ]);
  });

  it('includes the archive-destination and access-axis migrations for a store at schema_version 5', () => {
    expect(pendingMigrations(5).map((m) => m.id)).toEqual([
      archiveDestinationFromTaxonomyMigration.id,
      dropAccessAxesMigration.id,
    ]);
  });

  it('includes only the access-axis migration for a store at schema_version 6', () => {
    expect(pendingMigrations(6).map((m) => m.id)).toEqual([dropAccessAxesMigration.id]);
  });

  it('is empty for a store already at the current schema version', () => {
    expect(pendingMigrations(7)).toEqual([]);
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

  it('a v1 store runs all five migrations, in order', async () => {
    const tmp = await makeTmpDir();
    try {
      const store = await setUpV1Store(tmp.root);
      // A genuine v1 note carries the visibility key under its v1 spelling.
      // Nothing in the chain may rewrite it any more (design.md D3/D7).
      await writeNote(tmp.root, 'projects/a.md', '---\nscope: shared\ntitle: Keep me\n---\nContent.\n');
      const noteBefore = await readFile(path.join(tmp.root, 'projects/a.md'), 'utf8');

      let workingStore = store;
      for (const migration of pendingMigrations(workingStore.config.schema_version)) {
        await migration.apply(workingStore);
        workingStore = { root: tmp.root, config: await readConfig(tmp.root) };
      }

      expect(workingStore.config.schema_version).toBe(7);
      // drop-access-axes removes the fields:/visibility:/disclosure: blocks at 6 -> 7.
      expect((workingStore.config as { fields?: unknown }).fields).toBeUndefined();
      expect((workingStore.config as { visibility?: unknown }).visibility).toBeUndefined();
      expect((workingStore.config as { disclosure?: unknown }).disclosure).toBeUndefined();
      expect(workingStore.config.harness.skills_path).toBe('procedures/');
      expect(workingStore.config.harness.guidance_path).toBe('conventions/');
      // The v1 fixture is a PARA store still on the shipped archive/ default,
      // so the last migration in the chain adopts the profile's own layer.
      expect(workingStore.config.organize.archive_destination).toBe('archives/');

      const configContent = await readFile(path.join(tmp.root, 'contexture.yaml'), 'utf8');
      expect(configContent).not.toContain('procedures_path');
      expect(configContent).not.toContain('conventions_path');
      expect(configContent).not.toContain('archive_path');
      expect(pendingMigrations(workingStore.config.schema_version)).toEqual([]);

      // No migration in the chain touches a note.
      expect(await readFile(path.join(tmp.root, 'projects/a.md'), 'utf8')).toBe(noteBefore);
    } finally {
      await tmp.cleanup();
    }
  });
});

describe('renameConventionsPathMigration', () => {
  it('plan() reports only the config delta for an operator-customized path, and writes nothing (dry-run)', async () => {
    const tmp = await makeTmpDir();
    try {
      const store = await setUpV3StoreWithConventionsPath(tmp.root, 'notes/conventions/');
      const deltas = await renameConventionsPathMigration.plan(store);
      expect(deltas).toEqual([
        { path: 'contexture.yaml', description: 'rename harness.conventions_path to harness.guidance_path and set schema_version to 4' },
      ]);

      const configContent = await readFile(path.join(tmp.root, 'contexture.yaml'), 'utf8');
      expect(configContent).toContain('schema_version: 3');
      expect(configContent).toContain('conventions_path: notes/conventions/');
    } finally {
      await tmp.cleanup();
    }
  });

  it('plan() also reports the directory move when the path sat at the old default', async () => {
    const tmp = await makeTmpDir();
    try {
      const store = await setUpV3StoreWithConventionsPath(tmp.root);
      const deltas = await renameConventionsPathMigration.plan(store);
      expect(deltas.map((d) => d.path)).toEqual(['contexture.yaml', '.contexture/guidance/']);
    } finally {
      await tmp.cleanup();
    }
  });

  it('apply() renames the key and bumps schema_version, preserving an operator-customized path verbatim', async () => {
    const tmp = await makeTmpDir();
    try {
      const store = await setUpV3StoreWithConventionsPath(tmp.root, 'notes/conventions/');
      const applied = await renameConventionsPathMigration.apply(store);
      expect(applied).toEqual([
        { path: 'contexture.yaml', description: 'rename harness.conventions_path to harness.guidance_path and set schema_version to 4' },
      ]);

      const configContent = await readFile(path.join(tmp.root, 'contexture.yaml'), 'utf8');
      expect(configContent).not.toContain('conventions_path');
      expect(configContent).toContain('guidance_path: notes/conventions/');
      expect(configContent).toContain('schema_version: 4');

      const config = await readConfig(tmp.root);
      expect(config.schema_version).toBe(4);
      expect(config.harness.guidance_path).toBe('notes/conventions/');
    } finally {
      await tmp.cleanup();
    }
  });

  it('apply() moves the directory on disk when the path sat at the old default', async () => {
    const tmp = await makeTmpDir();
    try {
      const store = await setUpV3StoreWithConventionsPath(tmp.root);
      await writeNote(tmp.root, '.contexture/conventions/house-style.md', '---\ntitle: House style\n---\nBody.\n');

      await renameConventionsPathMigration.apply(store);

      expect(existsSync(path.join(tmp.root, '.contexture/conventions'))).toBe(false);
      const moved = await readFile(path.join(tmp.root, '.contexture/guidance/house-style.md'), 'utf8');
      expect(moved).toContain('House style');

      const config = await readConfig(tmp.root);
      expect(config.harness.guidance_path).toBe('.contexture/guidance/');
    } finally {
      await tmp.cleanup();
    }
  });

  it('apply() at the old default with nothing on disk yet just rewrites the config', async () => {
    const tmp = await makeTmpDir();
    try {
      const store = await setUpV3StoreWithConventionsPath(tmp.root);
      const applied = await renameConventionsPathMigration.apply(store);
      expect(applied.map((d) => d.path)).toEqual(['contexture.yaml', '.contexture/guidance/']);

      const config = await readConfig(tmp.root);
      expect(config.harness.guidance_path).toBe('.contexture/guidance/');
      expect(existsSync(path.join(tmp.root, '.contexture/conventions'))).toBe(false);
    } finally {
      await tmp.cleanup();
    }
  });

  it('is resumable: a second apply() on an already-migrated store changes nothing', async () => {
    const tmp = await makeTmpDir();
    try {
      const store = await setUpV3StoreWithConventionsPath(tmp.root);
      await renameConventionsPathMigration.apply(store);

      const migratedConfig = await readConfig(tmp.root);
      const second = await renameConventionsPathMigration.apply({ root: tmp.root, config: migratedConfig });
      expect(second).toEqual([]);

      const configContent = await readFile(path.join(tmp.root, 'contexture.yaml'), 'utf8');
      expect(configContent).toContain('schema_version: 4');
    } finally {
      await tmp.cleanup();
    }
  });
});

describe('dropForgeAndWorkspacesExternalMigration', () => {
  it('plan() reports the one config delta and writes nothing (dry-run)', async () => {
    const tmp = await makeTmpDir();
    try {
      const store = await setUpV4StoreWithLegacyForgeAndWorkspacesExternal(tmp.root);
      const deltas = await dropForgeAndWorkspacesExternalMigration.plan(store);
      expect(deltas).toEqual([
        {
          path: 'contexture.yaml',
          description: 'strip any legacy kind: forge adapter declarations and the session.workspaces_external key, and set schema_version to 5',
        },
      ]);

      const configContent = await readFile(path.join(tmp.root, 'contexture.yaml'), 'utf8');
      expect(configContent).toContain('schema_version: 4');
      expect(configContent).toContain('kind: forge');
      expect(configContent).toContain('workspaces_external: true');
    } finally {
      await tmp.cleanup();
    }
  });

  it('apply() strips the forge adapter declaration and workspaces_external, keeping the harness-generation adapter, and bumps schema_version to 5', async () => {
    const tmp = await makeTmpDir();
    try {
      const store = await setUpV4StoreWithLegacyForgeAndWorkspacesExternal(tmp.root);
      const applied = await dropForgeAndWorkspacesExternalMigration.apply(store);
      expect(applied).toEqual([
        {
          path: 'contexture.yaml',
          description: 'strip any legacy kind: forge adapter declarations and the session.workspaces_external key, and set schema_version to 5',
        },
      ]);

      const configContent = await readFile(path.join(tmp.root, 'contexture.yaml'), 'utf8');
      expect(configContent).not.toContain('forge');
      expect(configContent).not.toContain('workspaces_external');
      expect(configContent).toContain('schema_version: 5');
      expect(configContent).toContain('claude-code');

      const config = await readConfig(tmp.root);
      expect(config.schema_version).toBe(5);
      expect(config.adapters).toEqual([{ id: 'claude-code', kind: 'harness-generation' }]);
    } finally {
      await tmp.cleanup();
    }
  });

  it('is resumable: a second apply() on an already-migrated store changes nothing', async () => {
    const tmp = await makeTmpDir();
    try {
      const store = await setUpV4StoreWithLegacyForgeAndWorkspacesExternal(tmp.root);
      await dropForgeAndWorkspacesExternalMigration.apply(store);

      const migratedConfig = await readConfig(tmp.root);
      const second = await dropForgeAndWorkspacesExternalMigration.apply({ root: tmp.root, config: migratedConfig });
      expect(second).toEqual([]);

      const configContent = await readFile(path.join(tmp.root, 'contexture.yaml'), 'utf8');
      expect(configContent).toContain('schema_version: 5');
    } finally {
      await tmp.cleanup();
    }
  });
});

describe('archiveDestinationFromTaxonomyMigration', () => {
  const configDelta = {
    path: 'contexture.yaml',
    description: 'rename organize.archive_path to organize.archive_destination and set schema_version to 6',
  };
  const destinationDelta = {
    path: 'archives/',
    description: "adopt the taxonomy's own archive destination, moving the default-valued archive directory from archive/ to archives/",
  };

  it('plan() reports both the rename and the destination change for a PARA store still on the shipped default, writing nothing', async () => {
    const tmp = await makeTmpDir();
    try {
      const store = await setUpV5Store(tmp.root);
      expect(await archiveDestinationFromTaxonomyMigration.plan(store)).toEqual([configDelta, destinationDelta]);

      const configContent = await readFile(path.join(tmp.root, 'contexture.yaml'), 'utf8');
      expect(configContent).toContain('schema_version: 5');
      expect(configContent).toContain('archive_path: archive/');
    } finally {
      await tmp.cleanup();
    }
  });

  it('apply() renames the key and adopts the PARA profile\'s own archives/ destination', async () => {
    const tmp = await makeTmpDir();
    try {
      const store = await setUpV5Store(tmp.root);
      expect(await archiveDestinationFromTaxonomyMigration.apply(store)).toEqual([configDelta, destinationDelta]);

      const configContent = await readFile(path.join(tmp.root, 'contexture.yaml'), 'utf8');
      expect(configContent).not.toContain('archive_path');

      const config = await readConfig(tmp.root);
      expect(config.schema_version).toBe(6);
      expect(config.organize.archive_destination).toBe('archives/');
    } finally {
      await tmp.cleanup();
    }
  });

  it('apply() moves an existing archive/ directory to archives/, and skips the move when there is nothing there', async () => {
    const withDir = await makeTmpDir();
    try {
      const store = await setUpV5Store(withDir.root);
      await writeNote(withDir.root, 'archive/Retired.md', '---\nlens: private\n---\nOld.\n');

      await archiveDestinationFromTaxonomyMigration.apply(store);

      expect(existsSync(path.join(withDir.root, 'archive'))).toBe(false);
      expect(await readFile(path.join(withDir.root, 'archives/Retired.md'), 'utf8')).toContain('Old.');
    } finally {
      await withDir.cleanup();
    }

    const withoutDir = await makeTmpDir();
    try {
      const store = await setUpV5Store(withoutDir.root);
      await archiveDestinationFromTaxonomyMigration.apply(store);

      expect(existsSync(path.join(withoutDir.root, 'archives'))).toBe(false);
      expect((await readConfig(withoutDir.root)).organize.archive_destination).toBe('archives/');
    } finally {
      await withoutDir.cleanup();
    }
  });

  it('never rewrites an operator-customized value — that store gets a pure key rename', async () => {
    const tmp = await makeTmpDir();
    try {
      const store = await setUpV5Store(tmp.root, { archivePath: 'retired/' });
      expect(await archiveDestinationFromTaxonomyMigration.plan(store)).toEqual([configDelta]);

      await archiveDestinationFromTaxonomyMigration.apply(store);

      const config = await readConfig(tmp.root);
      expect(config.schema_version).toBe(6);
      expect(config.organize.archive_destination).toBe('retired/');
    } finally {
      await tmp.cleanup();
    }
  });

  it('leaves the value alone for a profile that declares no archive destination', async () => {
    for (const profile of ['diataxis', 'zettelkasten', 'custom']) {
      const tmp = await makeTmpDir();
      try {
        const store = await setUpV5Store(tmp.root, { profile });
        expect(await archiveDestinationFromTaxonomyMigration.plan(store)).toEqual([configDelta]);

        await archiveDestinationFromTaxonomyMigration.apply(store);

        const config = await readConfig(tmp.root);
        expect(config.schema_version).toBe(6);
        expect(config.organize.archive_destination, `profile ${profile}`).toBe('archive/');
      } finally {
        await tmp.cleanup();
      }
    }
  });

  it('is a no-op once applied', async () => {
    const tmp = await makeTmpDir();
    try {
      const store = await setUpV5Store(tmp.root);
      await archiveDestinationFromTaxonomyMigration.apply(store);

      const migrated = { root: tmp.root, config: await readConfig(tmp.root) };
      expect(await archiveDestinationFromTaxonomyMigration.plan(migrated)).toEqual([]);
      expect(await archiveDestinationFromTaxonomyMigration.apply(migrated)).toEqual([]);
    } finally {
      await tmp.cleanup();
    }
  });
});
