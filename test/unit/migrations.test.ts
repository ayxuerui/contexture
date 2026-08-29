import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
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
    retrieval: { exclude_paths: [] },
    git: { default_branch: 'main' },
    session: { branch_prefix: 'session/', worktrees_path: '.worktrees/' },
    write_lifecycle: { diff_size_ceiling_lines: 2000 },
    catalog: { path: 'catalog/', section_max_bytes: 32768 },
    disclosure: { internal_audiences: [], hard_walls: [] },
    ingest: { inbox_path: 'inbox/' },
    organize: { archive_path: 'archive/' },
    identity: { path: 'identity/' },
    harness: { procedures_path: 'procedures/', conventions_path: 'conventions/' },
    adapters: [],
  };
}

async function setUpV1Store(root: string): Promise<Store> {
  const config = makeV1Config();
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, 'contexture.yaml'), renderStoreConfig(config));
  return { root, config };
}

async function writeNote(root: string, relPath: string, content: string): Promise<void> {
  const full = path.join(root, relPath);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content);
}

describe('pendingMigrations', () => {
  it('includes the rename migration for a store at schema_version 1', () => {
    expect(pendingMigrations(1).map((m) => m.id)).toContain(renameVisibilityFieldMigration.id);
  });

  it('is empty for a store already at the current schema version', () => {
    expect(pendingMigrations(2)).toEqual([]);
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
