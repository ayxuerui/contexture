import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { execute as executeIngest } from '../../src/commands/ingest.js';
import { execute as executeSourceCheck } from '../../src/commands/source-check.js';
import { execute as executeSourceHash } from '../../src/commands/source-hash.js';
import type { StoreConfig } from '../../src/config/schema.js';
import { AlreadyIngestedError } from '../../src/core/errors.js';
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

async function writeNote(root: string, relPath: string, content: string): Promise<void> {
  const full = path.join(root, relPath);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content);
}

describe('source hash command', () => {
  it('reports the canonicalized-content hash of a file', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await writeNote(tmp.root, 'inbox/a.md', '# Title\n\nBody.\n');
      const env = makeFakeEnv({ cwd: tmp.root });
      const outcome = await executeSourceHash(env, store, { path: 'inbox/a.md' });
      expect(outcome.exitCode).toBe(ExitCode.Ok);
      expect(outcome.data?.hash).toMatch(/^[0-9a-f]{16}$/);
    } finally {
      await tmp.cleanup();
    }
  });
});

describe('ingest command', () => {
  it('stamps source-identity fields onto the file frontmatter, freezing the hash at that moment', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await writeNote(tmp.root, 'inbox/a.md', '# Captured\n\nRaw content.\n');
      const env = makeFakeEnv({ cwd: tmp.root });

      const outcome = await executeIngest(env, store, { path: 'inbox/a.md', sourceType: 'web', sourceId: 'src-1' });
      expect(outcome.exitCode).toBe(ExitCode.Ok);
      expect(outcome.data).toEqual({
        path: 'inbox/a.md',
        sourceType: 'web',
        sourceId: 'src-1',
        sourceHash: expect.stringMatching(/^[0-9a-f]{16}$/),
        ingested: env.now().toISOString(),
      });

      const written = await readFile(path.join(tmp.root, 'inbox/a.md'), 'utf8');
      expect(written).toContain('source_type: web');
      expect(written).toContain('source_id: src-1');
      expect(written).toContain('# Captured');
      expect(written).toContain('Raw content.');
    } finally {
      await tmp.cleanup();
    }
  });

  it('leaves catalog check green for the newly ingested note (task 6.6)', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await writeNote(tmp.root, 'inbox/a.md', '# Captured\n\nRaw content.\n');
      const env = makeFakeEnv({ cwd: tmp.root });
      await executeIngest(env, store, { path: 'inbox/a.md', sourceType: 'web', sourceId: 'src-1' });

      const { checkCatalogCoverage } = await import('../../src/core/catalog/build.js');
      expect(await checkCatalogCoverage(store)).toEqual({ missing: [], dangling: [] });
    } finally {
      await tmp.cleanup();
    }
  });

  it('refuses to re-ingest a file that already carries source-identity fields', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await writeNote(tmp.root, 'inbox/a.md', '# Captured\n\nRaw content.\n');
      const env = makeFakeEnv({ cwd: tmp.root });
      await executeIngest(env, store, { path: 'inbox/a.md', sourceType: 'web', sourceId: 'src-1' });

      await expect(
        executeIngest(env, store, { path: 'inbox/a.md', sourceType: 'web', sourceId: 'src-1' }),
      ).rejects.toBeInstanceOf(AlreadyIngestedError);
    } finally {
      await tmp.cleanup();
    }
  });

  it('preserves other pre-existing frontmatter fields untouched', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await writeNote(tmp.root, 'inbox/a.md', '---\ntitle: Pre-existing Title\n---\n# Captured\n\nRaw content.\n');
      const env = makeFakeEnv({ cwd: tmp.root });
      await executeIngest(env, store, { path: 'inbox/a.md', sourceType: 'web', sourceId: 'src-1' });

      const written = await readFile(path.join(tmp.root, 'inbox/a.md'), 'utf8');
      expect(written).toContain('title: Pre-existing Title');
    } finally {
      await tmp.cleanup();
    }
  });
});

describe('source check command (via the CLI command layer)', () => {
  it('reports "new" for material matching no existing note', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await writeNote(tmp.root, 'inbox/a.md', '# Fresh\n\nContent.\n');
      const env = makeFakeEnv({ cwd: tmp.root });
      const outcome = await executeSourceCheck(env, store, { path: 'inbox/a.md', sourceId: 'src-1' });
      expect(outcome.exitCode).toBe(ExitCode.Ok);
      expect(outcome.data?.verdict).toBe('new');
    } finally {
      await tmp.cleanup();
    }
  });

  it('reports "already_ingested" and makes no write, for a second check against the same source-id', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await writeNote(tmp.root, 'inbox/a.md', '# Fresh\n\nContent.\n');
      const env = makeFakeEnv({ cwd: tmp.root });
      await executeIngest(env, store, { path: 'inbox/a.md', sourceType: 'web', sourceId: 'src-1' });

      const before = await readFile(path.join(tmp.root, 'inbox/a.md'), 'utf8');
      const outcome = await executeSourceCheck(env, store, { path: 'inbox/a.md', sourceId: 'src-1' });
      const after = await readFile(path.join(tmp.root, 'inbox/a.md'), 'utf8');

      expect(outcome.data?.verdict).toBe('already_ingested');
      expect(after).toBe(before); // zero additional writes
    } finally {
      await tmp.cleanup();
    }
  });
});
