import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { execute } from '../../src/commands/entry-append.js';
import type { StoreConfig } from '../../src/config/schema.js';
import { MarkerMismatchError, NoteNotFoundError } from '../../src/core/errors.js';
import { htmlCommentFence } from '../../src/core/markers.js';
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

const LEDGER_FENCE = htmlCommentFence('ledger');

describe('ctxr entry append (context-store D1)', () => {
  it('appends into an existing region, growing the count, leaving the rest byte-identical', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await writeNote(
        tmp.root,
        'projects/x.md',
        `---\nscope: shared\n---\n# X\n\nprose before.\n\n${LEDGER_FENCE.start}\nline one\nline two\n${LEDGER_FENCE.end}\n\nprose after.\n`,
      );
      const env = makeFakeEnv({ cwd: tmp.root });

      const outcome = await execute(env, store, { path: 'projects/x.md', region: 'ledger', text: 'line three' });

      expect(outcome.exitCode).toBe(0);
      expect(outcome.data).toEqual({ path: 'projects/x.md', region: 'ledger', lines: 3 });
      const text = await readFile(path.join(tmp.root, 'projects/x.md'), 'utf8');
      expect(text).toBe(
        `---\nscope: shared\n---\n# X\n\nprose before.\n\n${LEDGER_FENCE.start}\nline one\nline two\nline three\n${LEDGER_FENCE.end}\n\nprose after.\n`,
      );
    } finally {
      await tmp.cleanup();
    }
  });

  it('creates the region at the end of the body when absent', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await writeNote(tmp.root, 'projects/x.md', '---\nscope: shared\n---\n# X\n\nprose.\n');
      const env = makeFakeEnv({ cwd: tmp.root });

      const outcome = await execute(env, store, { path: 'projects/x.md', region: 'ledger', text: 'first line' });

      expect(outcome.data).toEqual({ path: 'projects/x.md', region: 'ledger', lines: 1 });
      const text = await readFile(path.join(tmp.root, 'projects/x.md'), 'utf8');
      expect(text).toBe(`---\nscope: shared\n---\n# X\n\nprose.\n\n${LEDGER_FENCE.start}\nfirst line\n${LEDGER_FENCE.end}\n`);
    } finally {
      await tmp.cleanup();
    }
  });

  it('leaves frontmatter and every byte outside the region untouched', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      const before = `---\nscope: shared\ntags: [a, b]\n---\n# X\n\n${LEDGER_FENCE.start}\nold\n${LEDGER_FENCE.end}\n`;
      await writeNote(tmp.root, 'projects/x.md', before);
      const env = makeFakeEnv({ cwd: tmp.root });

      await execute(env, store, { path: 'projects/x.md', region: 'ledger', text: 'new' });

      const text = await readFile(path.join(tmp.root, 'projects/x.md'), 'utf8');
      expect(text.startsWith('---\nscope: shared\ntags: [a, b]\n---\n# X\n\n')).toBe(true);
      expect(text).toContain(`${LEDGER_FENCE.start}\nold\nnew\n${LEDGER_FENCE.end}`);
    } finally {
      await tmp.cleanup();
    }
  });

  it('a mismatched fence marker aborts with zero bytes written', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      const before = `# X\n\n${LEDGER_FENCE.start}\nstray unmatched start\n`;
      await writeNote(tmp.root, 'projects/x.md', before);
      const env = makeFakeEnv({ cwd: tmp.root });

      await expect(execute(env, store, { path: 'projects/x.md', region: 'ledger', text: 'x' })).rejects.toBeInstanceOf(
        MarkerMismatchError,
      );
      expect(await readFile(path.join(tmp.root, 'projects/x.md'), 'utf8')).toBe(before);
    } finally {
      await tmp.cleanup();
    }
  });

  it('throws NoteNotFoundError for a path that does not exist', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      const env = makeFakeEnv({ cwd: tmp.root });
      await expect(execute(env, store, { path: 'projects/nope.md', region: 'ledger', text: 'x' })).rejects.toBeInstanceOf(
        NoteNotFoundError,
      );
    } finally {
      await tmp.cleanup();
    }
  });

  it('a different region on the same note is independent', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await writeNote(tmp.root, 'projects/x.md', '# X\n');
      const env = makeFakeEnv({ cwd: tmp.root });

      await execute(env, store, { path: 'projects/x.md', region: 'bookings', text: 'booked 1' });
      const outcome = await execute(env, store, { path: 'projects/x.md', region: 'expenses', text: 'spent 1' });

      expect(outcome.data?.lines).toBe(1);
      const text = await readFile(path.join(tmp.root, 'projects/x.md'), 'utf8');
      expect(text).toContain('booked 1');
      expect(text).toContain('spent 1');
    } finally {
      await tmp.cleanup();
    }
  });
});
