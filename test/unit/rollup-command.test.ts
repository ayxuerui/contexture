import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { execute as executeGather } from '../../src/commands/rollup-gather.js';
import { execute as executeWrite, ROLLUP_FENCE } from '../../src/commands/rollup-write.js';
import type { StoreConfig } from '../../src/config/schema.js';
import { MarkerMismatchError, NoteNotFoundError } from '../../src/core/errors.js';
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
    identity: { path: 'identity/', files: {}, entry_delimiter: '' },
    harness: { procedures_path: 'procedures/', conventions_path: 'conventions/' },
    adapters: [],
  };
}

async function writeNote(root: string, relPath: string, content: string): Promise<void> {
  const full = path.join(root, relPath);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content);
}

describe('rollup gather', () => {
  it('enumerates notes linking to the entity by stem', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await writeNote(tmp.root, 'projects/topic.md', 'The topic.\n');
      await writeNote(tmp.root, 'projects/a.md', 'Discusses [[topic]].\n');
      await writeNote(tmp.root, 'projects/b.md', 'No link here.\n');
      const env = makeFakeEnv({ cwd: tmp.root });

      const outcome = await executeGather(env, store, { entity: 'projects/topic.md' });
      expect(outcome.data).toEqual({ entity: 'projects/topic.md', candidates: ['projects/a.md'] });
    } finally {
      await tmp.cleanup();
    }
  });

  it('throws NoteNotFoundError for an entity that does not exist', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      const env = makeFakeEnv({ cwd: tmp.root });
      await expect(executeGather(env, store, { entity: 'projects/nope.md' })).rejects.toBeInstanceOf(NoteNotFoundError);
    } finally {
      await tmp.cleanup();
    }
  });
});

describe('rollup write', () => {
  it('writes agent-supplied content into a fenced region on the entity note', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await writeNote(tmp.root, 'projects/topic.md', '# Topic\n\nOriginal.\n');
      const contentFile = path.join(tmp.root, 'content.txt');
      await writeFile(contentFile, 'Synthesized rollup text.\n');
      const env = makeFakeEnv({ cwd: tmp.root });

      const outcome = await executeWrite(env, store, { entity: 'projects/topic.md', contentFile });
      expect(outcome.data).toEqual({ path: 'projects/topic.md', changed: true });

      const written = await readFile(path.join(tmp.root, 'projects/topic.md'), 'utf8');
      expect(written).toContain('Original.');
      expect(written).toContain('Synthesized rollup text.');
      expect(written).toContain(ROLLUP_FENCE.start);
    } finally {
      await tmp.cleanup();
    }
  });

  it('running write twice with unchanged content is a byte-identical no-op', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await writeNote(tmp.root, 'projects/topic.md', '# Topic\n\nOriginal.\n');
      const contentFile = path.join(tmp.root, 'content.txt');
      await writeFile(contentFile, 'Same text.\n');
      const env = makeFakeEnv({ cwd: tmp.root });

      await executeWrite(env, store, { entity: 'projects/topic.md', contentFile });
      const before = await readFile(path.join(tmp.root, 'projects/topic.md'), 'utf8');

      const second = await executeWrite(env, store, { entity: 'projects/topic.md', contentFile });
      const after = await readFile(path.join(tmp.root, 'projects/topic.md'), 'utf8');

      expect(second.data?.changed).toBe(false);
      expect(after).toBe(before);
    } finally {
      await tmp.cleanup();
    }
  });

  it('a mismatched fence marker aborts the write with zero bytes changed', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await writeNote(
        tmp.root,
        'projects/topic.md',
        `# Topic\n\n${ROLLUP_FENCE.start}\nstray unmatched start marker\n`,
      );
      const contentFile = path.join(tmp.root, 'content.txt');
      await writeFile(contentFile, 'New text.\n');
      const env = makeFakeEnv({ cwd: tmp.root });

      const before = await readFile(path.join(tmp.root, 'projects/topic.md'), 'utf8');
      await expect(executeWrite(env, store, { entity: 'projects/topic.md', contentFile })).rejects.toBeInstanceOf(
        MarkerMismatchError,
      );
      const after = await readFile(path.join(tmp.root, 'projects/topic.md'), 'utf8');
      expect(after).toBe(before);
    } finally {
      await tmp.cleanup();
    }
  });

  it('throws NoteNotFoundError for an entity that does not exist', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      const contentFile = path.join(tmp.root, 'content.txt');
      await writeFile(contentFile, 'Text.\n');
      const env = makeFakeEnv({ cwd: tmp.root });
      await expect(
        executeWrite(env, store, { entity: 'projects/nope.md', contentFile }),
      ).rejects.toBeInstanceOf(NoteNotFoundError);
    } finally {
      await tmp.cleanup();
    }
  });

  it('store-primitives-from-migration-audit D4: a real write stamps rolled_up:, a no-op does not', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await writeNote(tmp.root, 'projects/topic.md', '---\nscope: shared\n---\n# Topic\n\nOriginal.\n');
      const contentFile = path.join(tmp.root, 'content.txt');
      await writeFile(contentFile, 'Synthesized text.\n');
      const env = makeFakeEnv({ cwd: tmp.root, now: () => new Date('2026-01-01T00:00:00.000Z') });

      await executeWrite(env, store, { entity: 'projects/topic.md', contentFile });
      const afterFirst = await readFile(path.join(tmp.root, 'projects/topic.md'), 'utf8');
      expect(afterFirst).toContain('rolled_up: 2026-01-01T00:00:00.000Z');

      // A later "run" with UNCHANGED content must not bump the timestamp — true no-op stays byte-identical.
      const laterEnv = makeFakeEnv({ cwd: tmp.root, now: () => new Date('2026-06-01T00:00:00.000Z') });
      const second = await executeWrite(laterEnv, store, { entity: 'projects/topic.md', contentFile });
      const afterSecond = await readFile(path.join(tmp.root, 'projects/topic.md'), 'utf8');
      expect(second.data?.changed).toBe(false);
      expect(afterSecond).toBe(afterFirst);
      expect(afterSecond).toContain('rolled_up: 2026-01-01T00:00:00.000Z');
    } finally {
      await tmp.cleanup();
    }
  });
});
