import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { execute } from '../../src/commands/lint.js';
import { buildGraphFromNotes } from '../../src/core/graph/model.js';
import { writeGraph } from '../../src/core/graph/persist.js';
import { listNotes } from '../../src/core/notes/list.js';
import type { StoreConfig } from '../../src/config/schema.js';
import { ExitCode } from '../../src/core/exit-codes.js';
import type { Store } from '../../src/core/store.js';
import { makeFakeEnv } from '../helpers/fake-env.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

function makeConfig(): StoreConfig {
  return {
    schema_version: 1,
    taxonomy: { profile: 'para', layers: [{ name: 'Projects', path: 'projects', description: '' }] },
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

async function writeNote(root: string, relPath: string, content: string): Promise<void> {
  const full = path.join(root, relPath);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content);
}

describe('lint command', () => {
  it('always exits 0, even with several findings across multiple checks', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      // An orphan, a broken link, uningested inbox material, and a catalog gap — all at once.
      await writeNote(tmp.root, 'projects/orphan.md', 'No links.\n');
      await writeNote(tmp.root, 'projects/broken.md', 'Links to [[nowhere]].\n');
      await writeNote(tmp.root, 'inbox/uncaptured.md', 'Not yet ingested.\n');

      const notes = await listNotes(tmp.root, store.config);
      await writeGraph(store, buildGraphFromNotes(notes));

      const env = makeFakeEnv({ cwd: tmp.root });
      const outcome = await execute(env, store);

      expect(outcome.exitCode).toBe(ExitCode.Ok);
      expect(outcome.data?.summary.fail).toBeGreaterThan(0);
    } finally {
      await tmp.cleanup();
    }
  });

  it('exits 0 on a perfectly clean store too', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      const env = makeFakeEnv({ cwd: tmp.root });
      const outcome = await execute(env, store);
      expect(outcome.exitCode).toBe(ExitCode.Ok);
    } finally {
      await tmp.cleanup();
    }
  });

  it('never runs an invariant-severity check (that is what doctor runs)', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await writeNote(tmp.root, 'projects/a.md', 'No frontmatter, retrievable, no catalog entry.\n');
      const env = makeFakeEnv({ cwd: tmp.root });
      const outcome = await execute(env, store);
      // 'catalog.coverage' is doctor's invariant-severity id; lint has its own 'organize.catalog_gaps'.
      expect(outcome.data?.checks.some((c) => c.id === 'catalog.coverage')).toBe(false);
      expect(outcome.data?.checks.some((c) => c.id === 'organize.catalog_gaps')).toBe(true);
    } finally {
      await tmp.cleanup();
    }
  });
});
