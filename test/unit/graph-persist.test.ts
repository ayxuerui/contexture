import { describe, expect, it } from 'vitest';
import type { StoreConfig } from '../../src/config/schema.js';
import type { GraphBuildResult } from '../../src/core/graph/model.js';
import { graphFilePath, readGraph, writeGraph } from '../../src/core/graph/persist.js';
import type { Store } from '../../src/core/store.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

function makeConfig(): StoreConfig {
  return {
    schema_version: 1,
    taxonomy: { profile: 'para', layers: [] },
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

const SAMPLE: GraphBuildResult = {
  nodes: [{ id: 'a.md', path: 'a.md' }],
  edges: [],
  dangling: [],
};

describe('readGraph', () => {
  it('returns null when no graph artifact has ever been written', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      expect(await readGraph(store)).toBeNull();
    } finally {
      await tmp.cleanup();
    }
  });
});

describe('writeGraph / readGraph', () => {
  it('round-trips a graph through disk', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await writeGraph(store, SAMPLE);
      expect(await readGraph(store)).toEqual(SAMPLE);
    } finally {
      await tmp.cleanup();
    }
  });

  it('writes under the store-relative derived path returned by graphFilePath', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await writeGraph(store, SAMPLE);
      const { readFile } = await import('node:fs/promises');
      const raw = await readFile(graphFilePath(store), 'utf8');
      expect(JSON.parse(raw)).toEqual(SAMPLE);
    } finally {
      await tmp.cleanup();
    }
  });
});
