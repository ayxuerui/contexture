import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { execute as executeAddAlt } from '../../src/commands/source-add-alt.js';
import { execute as executeCheck } from '../../src/commands/source-check.js';
import { execute as executeStamp } from '../../src/commands/source-stamp.js';
import type { StoreConfig } from '../../src/config/schema.js';
import { NoteNotFoundError, SourceIdentityMissingError } from '../../src/core/errors.js';
import type { Store } from '../../src/core/store.js';
import { makeFakeEnv } from '../helpers/fake-env.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

function makeConfig(): StoreConfig {
  return {
    schema_version: 1,
    taxonomy: { profile: 'para', layers: [] },
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
    harness: { skills_path: 'skills/', conventions_path: 'conventions/' },
    adapters: [],
  };
}

async function writeNote(root: string, relPath: string, content: string): Promise<void> {
  const full = path.join(root, relPath);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content);
}

describe('ctxr source stamp', () => {
  it('records the given id and a computed hash when --hash is omitted', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await writeNote(tmp.root, 'projects/legacy.md', '# Legacy\n\nsome body text.\n');
      const env = makeFakeEnv({ cwd: tmp.root });

      const outcome = await executeStamp(env, store, { path: 'projects/legacy.md', id: 'src-1' });

      expect(outcome.exitCode).toBe(0);
      expect(outcome.data?.sourceId).toBe('src-1');
      expect(outcome.data?.sourceHash.length).toBeGreaterThan(0);
      const text = await readFile(path.join(tmp.root, 'projects/legacy.md'), 'utf8');
      expect(text).toContain('source_id: src-1');
      expect(text).toContain(`source_hash: ${outcome.data?.sourceHash}`);
      expect(text).toContain('# Legacy');
    } finally {
      await tmp.cleanup();
    }
  });

  it('records an explicit --hash instead of computing one', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await writeNote(tmp.root, 'projects/legacy.md', '# Legacy\n');
      const env = makeFakeEnv({ cwd: tmp.root });

      const outcome = await executeStamp(env, store, { path: 'projects/legacy.md', id: 'src-1', hash: 'explicit-hash' });
      expect(outcome.data).toEqual({ path: 'projects/legacy.md', sourceId: 'src-1', sourceHash: 'explicit-hash' });
    } finally {
      await tmp.cleanup();
    }
  });

  it('stamping, then checking the same id against unchanged content, reports duplicate (already_ingested)', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await writeNote(tmp.root, 'projects/legacy.md', '# Legacy\n\nsame content.\n');
      const env = makeFakeEnv({ cwd: tmp.root });

      await executeStamp(env, store, { path: 'projects/legacy.md', id: 'src-1' });
      await writeNote(tmp.root, 'projects/candidate.md', '# Legacy\n\nsame content.\n');
      const check = await executeCheck(env, store, { path: 'projects/candidate.md', sourceId: 'src-1' });
      expect(check.data?.verdict).toBe('already_ingested');
      expect(check.data?.matches).toEqual(['projects/legacy.md']);
    } finally {
      await tmp.cleanup();
    }
  });

  it('stamping, then checking the same id against CHANGED content, reports drift', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await writeNote(tmp.root, 'projects/legacy.md', '# Legacy\n\noriginal.\n');
      const env = makeFakeEnv({ cwd: tmp.root });

      await executeStamp(env, store, { path: 'projects/legacy.md', id: 'src-1' });
      await writeNote(tmp.root, 'projects/candidate.md', '# Legacy\n\nchanged.\n');
      const check = await executeCheck(env, store, { path: 'projects/candidate.md', sourceId: 'src-1' });
      expect(check.data?.verdict).toBe('drift');
      expect(check.data?.matches).toEqual(['projects/legacy.md']);
    } finally {
      await tmp.cleanup();
    }
  });

  it('throws NoteNotFoundError for a missing note', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      const env = makeFakeEnv({ cwd: tmp.root });
      await expect(executeStamp(env, store, { path: 'nope.md', id: 'src-1' })).rejects.toBeInstanceOf(NoteNotFoundError);
    } finally {
      await tmp.cleanup();
    }
  });
});

describe('ctxr source add-alt', () => {
  it('appends an alternative id, and a later check against it reports duplicate', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await writeNote(tmp.root, 'projects/ingested.md', '# Ingested\n\nshared content.\n');
      const env = makeFakeEnv({ cwd: tmp.root });
      await executeStamp(env, store, { path: 'projects/ingested.md', id: 'src-1' });
      await writeNote(tmp.root, 'projects/candidate.md', '# Ingested\n\nshared content.\n');

      const outcome = await executeAddAlt(env, store, { path: 'projects/ingested.md', id: 'src-2' });
      expect(outcome.data).toEqual({ path: 'projects/ingested.md', altIds: ['src-2'] });

      const check = await executeCheck(env, store, { path: 'projects/candidate.md', sourceId: 'src-2' });
      expect(check.data?.verdict).toBe('already_ingested');
      expect(check.data?.matches).toEqual(['projects/ingested.md']);
    } finally {
      await tmp.cleanup();
    }
  });

  it('does not duplicate an id already recorded as an alternate', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await writeNote(tmp.root, 'projects/ingested.md', '---\nsource_id: src-1\nsource_hash: h1\n---\n# Ingested\n');
      const env = makeFakeEnv({ cwd: tmp.root });

      await executeAddAlt(env, store, { path: 'projects/ingested.md', id: 'src-2' });
      const outcome2 = await executeAddAlt(env, store, { path: 'projects/ingested.md', id: 'src-2' });
      expect(outcome2.data?.altIds).toEqual(['src-2']);
    } finally {
      await tmp.cleanup();
    }
  });

  it('refuses on a note with no primary source identity yet', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await writeNote(tmp.root, 'projects/fresh.md', '# Fresh\n');
      const env = makeFakeEnv({ cwd: tmp.root });
      await expect(executeAddAlt(env, store, { path: 'projects/fresh.md', id: 'src-2' })).rejects.toBeInstanceOf(
        SourceIdentityMissingError,
      );
    } finally {
      await tmp.cleanup();
    }
  });
});
