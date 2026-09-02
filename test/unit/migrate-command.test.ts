import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { execute } from '../../src/commands/migrate.js';
import { renderStoreConfig } from '../../src/config/render.js';
import type { StoreConfig } from '../../src/config/schema.js';
import { ExitCode } from '../../src/core/exit-codes.js';
import type { Store } from '../../src/core/store.js';
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
    session: { branch_prefix: 'session/', worktrees_path: '.worktrees/' },
    write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] },
    catalog: { path: 'catalog/', section_max_bytes: 32768 },
    disclosure: { internal_audiences: [], hard_walls: [], leak_markers: {} },
    ingest: { inbox_path: 'inbox/', tracking_params: [] },
    organize: { archive_path: 'archive/', rollup_stale_days: 7 },
    harness: { skills_path: 'skills/', guidance_path: 'guidance/' },
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

describe('migrate command', () => {
  it('reports no pending migrations for a store already at the current schema version', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { ...(await setUpV1Store(tmp.root)), config: { ...makeV1Config(), schema_version: 5, fields: { visibility: 'lens' } } };
      const outcome = await execute(store, {});
      expect(outcome.exitCode).toBe(ExitCode.Ok);
      expect(outcome.data).toEqual({ currentVersion: 5, targetVersion: 5, applied: false, migrations: [] });
    } finally {
      await tmp.cleanup();
    }
  });

  it('--dry-run reports deltas without writing anything', async () => {
    const tmp = await makeTmpDir();
    try {
      const store = await setUpV1Store(tmp.root);
      await writeNote(tmp.root, 'projects/a.md', '---\nscope: shared\n---\nContent.\n');
      const before = await readFile(path.join(tmp.root, 'projects/a.md'), 'utf8');

      const outcome = await execute(store, { dryRun: true });
      expect(outcome.data?.applied).toBe(false);
      expect(outcome.data?.migrations[0]?.deltas.length).toBeGreaterThan(0);

      const after = await readFile(path.join(tmp.root, 'projects/a.md'), 'utf8');
      expect(after).toBe(before);
    } finally {
      await tmp.cleanup();
    }
  });

  it('a real run applies the migration and reports the new schema version', async () => {
    const tmp = await makeTmpDir();
    try {
      const store = await setUpV1Store(tmp.root);
      await writeNote(tmp.root, 'projects/a.md', '---\nscope: shared\n---\nContent.\n');

      const outcome = await execute(store, {});
      expect(outcome.exitCode).toBe(ExitCode.Ok);
      expect(outcome.data?.applied).toBe(true);
      expect(outcome.schemaVersion).toBe(5);

      const after = await readFile(path.join(tmp.root, 'projects/a.md'), 'utf8');
      expect(after).toContain('lens: shared');
    } finally {
      await tmp.cleanup();
    }
  });
});
