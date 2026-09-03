import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { StoreConfig } from '../../src/config/schema.js';
import { buildCatalog } from '../../src/core/catalog/build.js';
import { contentHashOfBody } from '../../src/core/content/canonicalize.js';
import { buildPerNoteRecords } from '../../src/core/records.js';
import type { Store } from '../../src/core/store.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

function makeConfig(overrides: Partial<StoreConfig> = {}): StoreConfig {
  return {
    schema_version: 1,
    taxonomy: { profile: 'para', layers: [{ name: 'Projects', path: 'projects', description: '' }] },
    derived: { paths: [] },
    retrieval: { exclude_paths: [], relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } },
    git: { default_branch: 'main' },
    session: { branch_prefix: 'session/', worktrees_path: '.worktrees/' },
    write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] },
    catalog: { path: 'catalog/', section_max_bytes: 32768 },
    publish: { path: 'publish/' },
    skills: { vendored: [] },
    ingest: { inbox_path: 'raw/inbox/', capture_root: 'raw/', tracking_params: [] },
    organize: { archive_destination: 'archive/', rollup_stale_days: 7 },
    harness: { skills_path: 'skills/', guidance_path: 'guidance/', convention_max_bytes: 32768 },
    adapters: [],
    ...overrides,
  };
}

async function writeNote(root: string, relPath: string, content: string): Promise<void> {
  const full = path.join(root, relPath);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content);
}

describe('buildPerNoteRecords', () => {
  it('produces a stable {id, path, gloss, hash} record for every retrievable note', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await writeNote(tmp.root, 'projects/a.md', '---\nscope: shared\n---\nHello world.\n');
      const records = await buildPerNoteRecords(store);
      expect(records).toEqual([
        {
          id: 'projects/a.md',
          path: 'projects/a.md',
          gloss: '',
          hash: contentHashOfBody('Hello world.\n'),
        },
      ]);
    } finally {
      await tmp.cleanup();
    }
  });

  it('picks up a gloss authored into the catalog after a build', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await writeNote(tmp.root, 'projects/a.md', '---\nscope: shared\n---\nHello.\n');
      await buildCatalog(store);

      const { readFile, writeFile: write } = await import('node:fs/promises');
      const catalogPath = path.join(tmp.root, 'catalog', 'projects.md');
      const withGloss = (await readFile(catalogPath, 'utf8')).replace(') — ', ') — a hand-written gloss');
      await write(catalogPath, withGloss);

      const [record] = await buildPerNoteRecords(store);
      expect(record?.gloss).toBe('a hand-written gloss');
    } finally {
      await tmp.cleanup();
    }
  });

  it('returns an empty array for an empty store', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      expect(await buildPerNoteRecords(store)).toEqual([]);
    } finally {
      await tmp.cleanup();
    }
  });
});
