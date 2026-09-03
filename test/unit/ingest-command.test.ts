import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { execute as executeIngest } from '../../src/commands/ingest.js';
import { execute as executeSourceCheck } from '../../src/commands/source-check.js';
import { execute as executeSourceHash } from '../../src/commands/source-hash.js';
import type { StoreConfig } from '../../src/config/schema.js';
import { AlreadyIngestedError, NoteNotFoundError } from '../../src/core/errors.js';
import { ExitCode } from '../../src/core/exit-codes.js';
import type { Store } from '../../src/core/store.js';
import { makeFakeEnv } from '../helpers/fake-env.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

function makeConfig(): StoreConfig {
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
  const CAPTURE = 'raw/inbox/a.md';
  const NOTE = 'projects/topic.md';
  const RETAINED = 'raw/202601/a.md';

  async function setUpStore(root: string): Promise<Store> {
    await writeNote(root, CAPTURE, '# Captured\n\nRaw content.\n');
    await writeNote(root, NOTE, '# Topic\n\nWhat the store knows.\n');
    return { root, config: makeConfig() };
  }

  it('stamps identity onto the capture, retains it under the month, and cites it from the note', async () => {
    const tmp = await makeTmpDir();
    try {
      const store = await setUpStore(tmp.root);
      const env = makeFakeEnv({ cwd: tmp.root });

      const outcome = await executeIngest(env, store, { path: CAPTURE, into: NOTE, sourceType: 'web', sourceId: 'src-1' });
      expect(outcome.exitCode).toBe(ExitCode.Ok);
      expect(outcome.data).toEqual({
        capture: RETAINED,
        note: NOTE,
        sourceType: 'web',
        sourceId: 'src-1',
        sourceHash: expect.stringMatching(/^[0-9a-f]{16}$/),
        ingested: env.now().toISOString(),
      });

      const retained = await readFile(path.join(tmp.root, RETAINED), 'utf8');
      expect(retained).toContain('source_type: web');
      expect(retained).toContain('source_id: src-1');
      expect(retained).toContain('# Captured');
      // The capture survived ingest and left the inbox.
      expect(existsSync(path.join(tmp.root, CAPTURE))).toBe(false);

      const note = await readFile(path.join(tmp.root, NOTE), 'utf8');
      expect(note).toContain(`- ${RETAINED}`);
      expect(note).toContain('What the store knows.');
      // The synthesis carries no identity of its own; the capture holds it.
      expect(note).not.toContain('source_id:');
    } finally {
      await tmp.cleanup();
    }
  });

  it('leaves catalog coverage green: the note has an entry, the retained capture has none', async () => {
    const tmp = await makeTmpDir();
    try {
      const store = await setUpStore(tmp.root);
      store.config.retrieval.exclude_paths = ['raw/'];
      const env = makeFakeEnv({ cwd: tmp.root });
      await executeIngest(env, store, { path: CAPTURE, into: NOTE, sourceType: 'web', sourceId: 'src-1' });

      const { checkCatalogCoverage } = await import('../../src/core/catalog/build.js');
      expect(await checkCatalogCoverage(store)).toEqual({ missing: [], dangling: [] });

      const { listNotes } = await import('../../src/core/notes/list.js');
      expect((await listNotes(tmp.root, store.config)).map((n) => n.path)).not.toContain(RETAINED);
    } finally {
      await tmp.cleanup();
    }
  });

  it('accepts a capture that arrived already knowing where it came from', async () => {
    const tmp = await makeTmpDir();
    try {
      const store = await setUpStore(tmp.root);
      await writeNote(tmp.root, CAPTURE, '---\nsource_type: article\nsource_id: src-1\n---\n# Captured\n');
      const env = makeFakeEnv({ cwd: tmp.root });

      const outcome = await executeIngest(env, store, { path: CAPTURE, into: NOTE, sourceType: 'article', sourceId: 'src-1' });
      expect(outcome.exitCode).toBe(ExitCode.Ok);
      expect(await readFile(path.join(tmp.root, RETAINED), 'utf8')).toContain('ingested:');
    } finally {
      await tmp.cleanup();
    }
  });

  it('refuses a capture ingest has already stamped', async () => {
    const tmp = await makeTmpDir();
    try {
      const store = await setUpStore(tmp.root);
      const env = makeFakeEnv({ cwd: tmp.root });
      await executeIngest(env, store, { path: CAPTURE, into: NOTE, sourceType: 'web', sourceId: 'src-1' });

      await expect(
        executeIngest(env, store, { path: RETAINED, into: NOTE, sourceType: 'web', sourceId: 'src-1' }),
      ).rejects.toBeInstanceOf(AlreadyIngestedError);
    } finally {
      await tmp.cleanup();
    }
  });

  it('refuses when the destination note does not exist, without touching the capture', async () => {
    const tmp = await makeTmpDir();
    try {
      const store = await setUpStore(tmp.root);
      const env = makeFakeEnv({ cwd: tmp.root });
      const before = await readFile(path.join(tmp.root, CAPTURE), 'utf8');

      await expect(
        executeIngest(env, store, { path: CAPTURE, into: 'projects/absent.md', sourceType: 'web', sourceId: 'src-1' }),
      ).rejects.toBeInstanceOf(NoteNotFoundError);
      expect(await readFile(path.join(tmp.root, CAPTURE), 'utf8')).toBe(before);
    } finally {
      await tmp.cleanup();
    }
  });

  it('cites a second capture without dropping the first', async () => {
    const tmp = await makeTmpDir();
    try {
      const store = await setUpStore(tmp.root);
      await writeNote(tmp.root, 'raw/inbox/b.md', '# Also captured\n');
      const env = makeFakeEnv({ cwd: tmp.root });

      await executeIngest(env, store, { path: CAPTURE, into: NOTE, sourceType: 'web', sourceId: 'src-1' });
      await executeIngest(env, store, { path: 'raw/inbox/b.md', into: NOTE, sourceType: 'web', sourceId: 'src-2' });

      const note = await readFile(path.join(tmp.root, NOTE), 'utf8');
      expect(note).toContain(`- ${RETAINED}`);
      expect(note).toContain('- raw/202601/b.md');
    } finally {
      await tmp.cleanup();
    }
  });

  it('preserves other pre-existing frontmatter fields untouched', async () => {
    const tmp = await makeTmpDir();
    try {
      const store = await setUpStore(tmp.root);
      await writeNote(tmp.root, CAPTURE, '---\ntitle: Pre-existing Title\n---\n# Captured\n\nRaw content.\n');
      const env = makeFakeEnv({ cwd: tmp.root });
      await executeIngest(env, store, { path: CAPTURE, into: NOTE, sourceType: 'web', sourceId: 'src-1' });

      expect(await readFile(path.join(tmp.root, RETAINED), 'utf8')).toContain('title: Pre-existing Title');
    } finally {
      await tmp.cleanup();
    }
  });

  it('moves a binary capture with its sidecar, and hashes the bytes rather than the prose', async () => {
    const tmp = await makeTmpDir();
    try {
      const store = await setUpStore(tmp.root);
      await writeNote(tmp.root, 'raw/inbox/deck.pdf', '%PDF-1.7 bytes\n');
      await writeNote(tmp.root, 'raw/inbox/deck.pdf.md', '---\ncapture_file: deck.pdf\n---\nA description of the deck.\n');
      const env = makeFakeEnv({ cwd: tmp.root });

      const outcome = await executeIngest(env, store, {
        path: 'raw/inbox/deck.pdf.md',
        into: NOTE,
        sourceType: 'file',
        sourceId: 'src-deck',
      });

      expect(outcome.data?.capture).toBe('raw/202601/deck.pdf.md');
      expect(existsSync(path.join(tmp.root, 'raw/202601/deck.pdf'))).toBe(true);
      expect(existsSync(path.join(tmp.root, 'raw/inbox/deck.pdf'))).toBe(false);

      const { contentHashOfBytes } = await import('../../src/core/content/canonicalize.js');
      expect(outcome.data?.sourceHash).toBe(contentHashOfBytes(new TextEncoder().encode('%PDF-1.7 bytes\n')));
    } finally {
      await tmp.cleanup();
    }
  });
});

describe('source check command (via the CLI command layer)', () => {
  it('reports "new" for material matching no existing record', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await writeNote(tmp.root, 'raw/inbox/a.md', '# Fresh\n\nContent.\n');
      const env = makeFakeEnv({ cwd: tmp.root });
      const outcome = await executeSourceCheck(env, store, { path: 'raw/inbox/a.md', sourceId: 'src-1' });
      expect(outcome.exitCode).toBe(ExitCode.Ok);
      expect(outcome.data?.verdict).toBe('new');
    } finally {
      await tmp.cleanup();
    }
  });

  /**
   * The capture tier is a retrieval exclusion, so `listNotes` cannot see the
   * retained capture that holds the identity — this is the check that the
   * dedupe index reads the tier directly.
   */
  it('finds a retained capture even though retrieval excludes the tier', async () => {
    const tmp = await makeTmpDir();
    try {
      const config = makeConfig();
      config.retrieval.exclude_paths = ['raw/'];
      const store: Store = { root: tmp.root, config };
      await writeNote(tmp.root, 'raw/inbox/a.md', '# Fresh\n\nContent.\n');
      await writeNote(tmp.root, 'projects/topic.md', '# Topic\n');
      const env = makeFakeEnv({ cwd: tmp.root });
      await executeIngest(env, store, { path: 'raw/inbox/a.md', into: 'projects/topic.md', sourceType: 'web', sourceId: 'src-1' });

      const retained = 'raw/202601/a.md';
      const before = await readFile(path.join(tmp.root, retained), 'utf8');
      const outcome = await executeSourceCheck(env, store, { path: retained, sourceId: 'src-1' });
      const after = await readFile(path.join(tmp.root, retained), 'utf8');

      expect(outcome.data?.verdict).toBe('already_ingested');
      expect(outcome.data?.matches).toEqual([retained]);
      expect(after).toBe(before); // zero additional writes
    } finally {
      await tmp.cleanup();
    }
  });

  /**
   * retain-captures-as-provenance: a note stamped before the capture tier
   * existed is still an identity record, so migrating a store never loses
   * dedupe coverage.
   */
  it('still finds identity carried by a note from before the capture tier', async () => {
    const tmp = await makeTmpDir();
    try {
      const config = makeConfig();
      config.retrieval.exclude_paths = ['raw/'];
      const store: Store = { root: tmp.root, config };
      await writeNote(tmp.root, 'projects/legacy.md', '---\nsource_id: src-legacy\nsource_hash: abc\n---\n# Legacy\n');
      await writeNote(tmp.root, 'raw/inbox/a.md', '# Fresh\n\nContent.\n');
      const env = makeFakeEnv({ cwd: tmp.root });

      const outcome = await executeSourceCheck(env, store, { path: 'raw/inbox/a.md', sourceId: 'src-legacy' });
      expect(outcome.data?.verdict).toBe('drift');
      expect(outcome.data?.matches).toEqual(['projects/legacy.md']);
    } finally {
      await tmp.cleanup();
    }
  });
});
