import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readConfig } from '../../src/config/load.js';
import { renderStoreConfig } from '../../src/config/render.js';
import type { StoreConfig } from '../../src/config/schema.js';
import { addExplanationCraftSkillMigration } from '../../src/core/migrations/add-explanation-craft-skill.js';
import { pendingMigrations } from '../../src/core/migrations/registry.js';
import { SUPPORTED_SCHEMA_VERSION } from '../../src/config/schema.js';
import type { Store } from '../../src/core/store.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

import { SHIPPED_DEFAULTS } from '../../src/config/defaults.js';
function makeV6Config(vendored: string[]): StoreConfig {
  return {
    schema_version: 6,
    taxonomy: { profile: 'para', layers: [{ name: 'Projects', path: 'projects', description: 'Active work.' }] },
    fields: { visibility: 'scope' },
    visibility: { default_context: 'private', directory_defaults: {}, contexts: {} },
    derived: { paths: [] },
    retrieval: { exclude_paths: [], demote_paths: [], gather_max_notes: 50, relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } },
    git: { default_branch: 'main' },
    session: { branch_prefix: 'session/', worktrees_path: '.worktrees/' },
    write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] },
    catalog: { path: 'catalog/', section_max_bytes: 32768 },
    publish: { path: 'publish/' },
    skills: { vendored },
    update_check: SHIPPED_DEFAULTS.update_check,
    disclosure: { internal_audiences: [], hard_walls: [], leak_markers: {} },
    ingest: { inbox_path: 'raw/inbox/', capture_root: 'raw/', tracking_params: [] },
    organize: { archive_destination: 'archive/', rollup_stale_days: 7 },
    harness: { skills_path: '.agents/skills/', guidance_path: '.contexture/guidance/', convention_max_bytes: 32768 },
    adapters: [],
  };
}

async function setUpStore(root: string, vendored: string[]): Promise<Store> {
  const config = makeV6Config(vendored);
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, 'contexture.yaml'), renderStoreConfig(config));
  return { root, config };
}

/**
 * vendor-explanation-craft-skill: init writes the RESOLVED vendored list into
 * contexture.yaml and update never rewrites configuration, so growing the
 * shipped default reaches new stores only. This migration is the whole of the
 * propagation path to stores already on disk — and it must not overwrite a list
 * an operator curated on the way.
 */
describe('0007-add-explanation-craft-skill', () => {
  it('appends the new skill to a store still sitting on the previous shipped default', async () => {
    const tmp = await makeTmpDir();
    try {
      const store = await setUpStore(tmp.root, ['frontend-design']);

      const planned = await addExplanationCraftSkillMigration.plan(store);
      expect(planned).toHaveLength(1);
      expect(planned[0]?.path).toBe('contexture.yaml');
      expect(planned[0]?.description).toContain('eli5');

      // plan() is dry: nothing on disk moved.
      expect((await readConfig(tmp.root)).skills.vendored).toEqual(['frontend-design']);
      expect((await readConfig(tmp.root)).schema_version).toBe(6);

      await addExplanationCraftSkillMigration.apply(store);

      const migrated = await readConfig(tmp.root);
      expect(migrated.skills.vendored).toEqual(['frontend-design', 'eli5']);
      expect(migrated.schema_version).toBe(7);
    } finally {
      await tmp.cleanup();
    }
  });

  it('leaves a curated list alone, bumping the version only', async () => {
    const tmp = await makeTmpDir();
    try {
      const store = await setUpStore(tmp.root, ['frontend-design', 'something-the-operator-added']);

      const planned = await addExplanationCraftSkillMigration.plan(store);
      expect(planned[0]?.description).toContain('untouched');

      await addExplanationCraftSkillMigration.apply(store);

      const migrated = await readConfig(tmp.root);
      expect(migrated.skills.vendored).toEqual(['frontend-design', 'something-the-operator-added']);
      expect(migrated.schema_version).toBe(7);
    } finally {
      await tmp.cleanup();
    }
  });

  it('never re-adds to a list emptied to opt out', async () => {
    const tmp = await makeTmpDir();
    try {
      const store = await setUpStore(tmp.root, []);
      await addExplanationCraftSkillMigration.apply(store);

      const migrated = await readConfig(tmp.root);
      expect(migrated.skills.vendored).toEqual([]);
      expect(migrated.schema_version).toBe(7);
    } finally {
      await tmp.cleanup();
    }
  });

  it('is a no-op on a store already at the new version, however its list reads', async () => {
    const tmp = await makeTmpDir();
    try {
      const store = await setUpStore(tmp.root, ['frontend-design']);
      await addExplanationCraftSkillMigration.apply(store);

      const afterFirst = await readFile(path.join(tmp.root, 'contexture.yaml'), 'utf8');
      const migratedStore: Store = { root: tmp.root, config: await readConfig(tmp.root) };

      expect(await addExplanationCraftSkillMigration.plan(migratedStore)).toEqual([]);
      expect(await addExplanationCraftSkillMigration.apply(migratedStore)).toEqual([]);
      expect(await readFile(path.join(tmp.root, 'contexture.yaml'), 'utf8')).toBe(afterFirst);
    } finally {
      await tmp.cleanup();
    }
  });

  /**
   * Resumability, per the store-lifecycle requirement: apply() decides from
   * current on-disk state, not from the snapshot it was handed, so a re-run
   * after an interruption that already wrote the config does not append twice.
   */
  it('re-reads from disk, so a resumed run does not double-append', async () => {
    const tmp = await makeTmpDir();
    try {
      const store = await setUpStore(tmp.root, ['frontend-design']);
      await addExplanationCraftSkillMigration.apply(store);

      // The same stale snapshot a resumed run would still be holding.
      await addExplanationCraftSkillMigration.apply(store);

      expect((await readConfig(tmp.root)).skills.vendored).toEqual(['frontend-design', 'eli5']);
    } finally {
      await tmp.cleanup();
    }
  });

  it('is reachable from the registry for a store at the previous version', () => {
    const pending = pendingMigrations(6).map((m) => m.id);
    expect(pending).toContain('0007-add-explanation-craft-skill');
    // Version-agnostic: this migration is done once a store is past its own
    // toVersion, whatever the current supported version happens to be.
    expect(pendingMigrations(SUPPORTED_SCHEMA_VERSION).map((m) => m.id)).not.toContain('0007-add-explanation-craft-skill');
  });
});
