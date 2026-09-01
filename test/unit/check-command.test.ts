import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { execute } from '../../src/commands/check.js';
import type { StoreConfig } from '../../src/config/schema.js';
import { CheckAudienceRequiredError, NoteNotFoundError } from '../../src/core/errors.js';
import { ExitCode } from '../../src/core/exit-codes.js';
import type { Store } from '../../src/core/store.js';
import { makeFakeEnv } from '../helpers/fake-env.js';

const FIXTURES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/notes');

function makeStore(root: string, disclosure: StoreConfig['disclosure'] = { internal_audiences: [], hard_walls: [], leak_markers: {} }): Store {
  const config: StoreConfig = {
    schema_version: 1,
    taxonomy: { profile: 'para', layers: [] },
    fields: { visibility: 'scope' },
    visibility: { default_context: 'private', directory_defaults: {}, contexts: {} },
    derived: { paths: [] },
    retrieval: { exclude_paths: [], relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } },
    git: { default_branch: 'main' },
    session: { branch_prefix: 'session/', worktrees_path: '.worktrees/', workspaces_external: false },
    write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] },
    catalog: { path: 'catalog/', section_max_bytes: 32768 },
    disclosure,
    ingest: { inbox_path: 'inbox/', tracking_params: [] },
    organize: { archive_path: 'archive/', rollup_stale_days: 7 },
    harness: { skills_path: 'skills/', conventions_path: 'conventions/' },
    adapters: [],
  };
  return { root, config };
}

describe('check command', () => {
  it('maps ALLOW to exit code Ok', async () => {
    const store = makeStore(FIXTURES_DIR, {
      internal_audiences: [],
      hard_walls: [{ audience: 'external', verdict: 'allow' }],
      leak_markers: {},
    });
    const env = makeFakeEnv({ cwd: FIXTURES_DIR });
    const outcome = await execute(env, store, { path: 'explicit-visibility.md', audience: 'external' });
    expect(outcome.exitCode).toBe(ExitCode.Ok);
    expect(outcome.data).toEqual({
      path: 'explicit-visibility.md',
      audience: 'external',
      verdict: 'allow',
      rung: 'hard_wall',
    });
  });

  it('maps DENY to the reserved DisclosureDeny exit code', async () => {
    const store = makeStore(FIXTURES_DIR, {
      internal_audiences: [],
      hard_walls: [{ audience: 'external', verdict: 'deny' }],
      leak_markers: {},
    });
    const env = makeFakeEnv({ cwd: FIXTURES_DIR });
    const outcome = await execute(env, store, { path: 'explicit-visibility.md', audience: 'external' });
    expect(outcome.exitCode).toBe(ExitCode.DisclosureDeny);
    expect(outcome.data?.verdict).toBe('deny');
  });

  it('maps ASK (the untagged, external default) to the reserved DisclosureAsk exit code', async () => {
    const store = makeStore(FIXTURES_DIR);
    const env = makeFakeEnv({ cwd: FIXTURES_DIR });
    const outcome = await execute(env, store, { path: 'no-frontmatter.md', audience: 'external' });
    expect(outcome.exitCode).toBe(ExitCode.DisclosureAsk);
    expect(outcome.data).toEqual({ path: 'no-frontmatter.md', audience: 'external', verdict: 'ask', rung: 'external_default' });
  });

  it('throws NoteNotFoundError for a path that does not exist', async () => {
    const store = makeStore(FIXTURES_DIR);
    const env = makeFakeEnv({ cwd: FIXTURES_DIR });
    await expect(execute(env, store, { path: 'nonexistent.md', audience: 'external' })).rejects.toBeInstanceOf(
      NoteNotFoundError,
    );
  });

  it('accepts an absolute path and normalizes it to store-relative in the report', async () => {
    const store = makeStore(FIXTURES_DIR);
    const env = makeFakeEnv({ cwd: '/somewhere/else' });
    const outcome = await execute(env, store, {
      path: path.join(FIXTURES_DIR, 'no-frontmatter.md'),
      audience: 'external',
    });
    expect(outcome.data?.path).toBe('no-frontmatter.md');
  });

  it('throws CheckAudienceRequiredError when neither --audience nor --scan is given', async () => {
    const store = makeStore(FIXTURES_DIR);
    const env = makeFakeEnv({ cwd: FIXTURES_DIR });
    await expect(execute(env, store, { path: 'no-frontmatter.md' })).rejects.toBeInstanceOf(CheckAudienceRequiredError);
  });
});

describe('check --scan (store-primitives-from-migration-audit D3)', () => {
  it('reports the same leak findings lint would, for one note, and exits non-zero', async () => {
    const { mkdir, writeFile } = await import('node:fs/promises');
    const { makeTmpDir } = await import('../helpers/tmp-store.js');
    const tmp = await makeTmpDir();
    try {
      const store = makeStore(tmp.root, {
        internal_audiences: [],
        hard_walls: [],
        leak_markers: { 'ctx-b': ['SECRET-B'] },
      });
      await mkdir(path.join(tmp.root, 'projects'), { recursive: true });
      await writeFile(path.join(tmp.root, 'projects', 'a.md'), '---\nscope: ctx-a\n---\nSECRET-B leaked here.\n');
      const env = makeFakeEnv({ cwd: tmp.root });

      const outcome = await execute(env, store, { path: 'projects/a.md', scan: true });

      expect(outcome.exitCode).toBe(ExitCode.CheckFailed);
      expect(outcome.data?.leaks).toEqual([
        { path: 'projects/a.md', context: 'ctx-b', pattern: 'SECRET-B', matchedText: 'SECRET-B' },
      ]);
      expect(outcome.findings).toHaveLength(1);
    } finally {
      await tmp.cleanup();
    }
  });

  it('no leaks: exits Ok with an empty leaks array, no --audience needed', async () => {
    const { mkdir, writeFile } = await import('node:fs/promises');
    const { makeTmpDir } = await import('../helpers/tmp-store.js');
    const tmp = await makeTmpDir();
    try {
      const store = makeStore(tmp.root, { internal_audiences: [], hard_walls: [], leak_markers: {} });
      await mkdir(path.join(tmp.root, 'projects'), { recursive: true });
      await writeFile(path.join(tmp.root, 'projects', 'a.md'), '# Clean\n');
      const env = makeFakeEnv({ cwd: tmp.root });

      const outcome = await execute(env, store, { path: 'projects/a.md', scan: true });
      expect(outcome.exitCode).toBe(ExitCode.Ok);
      expect(outcome.data?.leaks).toEqual([]);
    } finally {
      await tmp.cleanup();
    }
  });
});
