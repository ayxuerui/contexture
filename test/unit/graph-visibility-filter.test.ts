import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { StoreConfig } from '../../src/config/schema.js';
import type { GraphBuildResult } from '../../src/core/graph/model.js';
import { filterGraphByAudience } from '../../src/core/graph/visibility-filter.js';
import type { Store } from '../../src/core/store.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

function makeConfig(): StoreConfig {
  return {
    schema_version: 1,
    taxonomy: { profile: 'para', layers: [{ name: 'Projects', path: 'projects', description: '' }] },
    fields: { visibility: 'scope' },
    visibility: { default_context: 'private', directory_defaults: {} },
    derived: { paths: [] },
    retrieval: { exclude_paths: [] },
    git: { default_branch: 'main' },
    session: { branch_prefix: 'session/', worktrees_path: '.worktrees/' },
    write_lifecycle: { diff_size_ceiling_lines: 2000 },
    catalog: { path: 'catalog/', section_max_bytes: 32768 },
    disclosure: { internal_audiences: [], hard_walls: [] },
    ingest: { inbox_path: 'inbox/' },
  };
}

async function writeNote(root: string, relPath: string, content: string): Promise<void> {
  const full = path.join(root, relPath);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content);
}

describe('filterGraphByAudience', () => {
  it('excludes a node whose resolved visibility the requesting context cannot see, and its edges', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await writeNote(tmp.root, 'projects/a.md', '---\nscope: ctx-a\n---\n');
      await writeNote(tmp.root, 'projects/b.md', '---\nscope: ctx-b\n---\n');

      const graph: GraphBuildResult = {
        nodes: [{ id: 'projects/a.md', path: 'projects/a.md' }, { id: 'projects/b.md', path: 'projects/b.md' }],
        edges: [{ src: 'projects/a.md', dst: 'projects/b.md', type: 'link' }],
        dangling: [],
      };

      const filtered = await filterGraphByAudience(store, graph, 'ctx-a');
      expect(filtered.nodes.map((n) => n.id)).toEqual(['projects/a.md']);
      expect(filtered.edges).toEqual([]);
    } finally {
      await tmp.cleanup();
    }
  });

  it('keeps an edge only when both endpoints are visible to the requesting context', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await writeNote(tmp.root, 'projects/a.md', '---\nscope: ctx-a\n---\n');
      await writeNote(tmp.root, 'projects/b.md', '---\nscope: ctx-a\n---\n');

      const graph: GraphBuildResult = {
        nodes: [{ id: 'projects/a.md', path: 'projects/a.md' }, { id: 'projects/b.md', path: 'projects/b.md' }],
        edges: [{ src: 'projects/a.md', dst: 'projects/b.md', type: 'link' }],
        dangling: [],
      };

      const filtered = await filterGraphByAudience(store, graph, 'ctx-a');
      expect(filtered.nodes.map((n) => n.id).sort()).toEqual(['projects/a.md', 'projects/b.md']);
      expect(filtered.edges).toEqual([{ src: 'projects/a.md', dst: 'projects/b.md', type: 'link' }]);
    } finally {
      await tmp.cleanup();
    }
  });

  it('treats a graph node with no corresponding current note as not visible (fails closed)', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      // No note written for projects/deleted.md — a stale graph entry.
      const graph: GraphBuildResult = {
        nodes: [{ id: 'projects/deleted.md', path: 'projects/deleted.md' }],
        edges: [],
        dangling: [],
      };

      const filtered = await filterGraphByAudience(store, graph, 'ctx-a');
      expect(filtered.nodes).toEqual([]);
    } finally {
      await tmp.cleanup();
    }
  });
});
