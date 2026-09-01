import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { execute as executeGather } from '../../src/commands/publish-gather.js';
import type { StoreConfig } from '../../src/config/schema.js';
import { ExitCode } from '../../src/core/exit-codes.js';
import {
  NoteNotFoundError,
  PublishAudienceRequiredError,
  PublishSelectorConflictError,
  PublishSelectorRequiredError,
} from '../../src/core/errors.js';
import type { Store } from '../../src/core/store.js';
import { makeFakeEnv } from '../helpers/fake-env.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

function makeConfig(overrides: Partial<StoreConfig['disclosure']> = {}): StoreConfig {
  return {
    schema_version: 1,
    taxonomy: { profile: 'para', layers: [{ name: 'Projects', path: 'projects', description: '' }] },
    fields: { visibility: 'scope' },
    visibility: { default_context: 'private', directory_defaults: {}, contexts: {} },
    derived: { paths: [] },
    retrieval: { exclude_paths: [], relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } },
    git: { default_branch: 'main' },
    session: { branch_prefix: 'session/', worktrees_path: '.worktrees/', workspaces_external: false },
    write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] },
    catalog: { path: 'catalog/', section_max_bytes: 32768 },
    publish: { path: 'publish/' },
    disclosure: { internal_audiences: [], hard_walls: [], leak_markers: {}, ...overrides },
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

describe('publish gather: selector validation', () => {
  it('throws PublishSelectorRequiredError when no selector is given', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      const env = makeFakeEnv({ cwd: tmp.root });
      await expect(executeGather(env, store, { audience: 'external' })).rejects.toBeInstanceOf(PublishSelectorRequiredError);
    } finally {
      await tmp.cleanup();
    }
  });

  it('throws PublishSelectorConflictError when more than one selector is given', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      const env = makeFakeEnv({ cwd: tmp.root });
      await expect(
        executeGather(env, store, { under: 'projects', note: 'projects/a.md', audience: 'external' }),
      ).rejects.toBeInstanceOf(PublishSelectorConflictError);
    } finally {
      await tmp.cleanup();
    }
  });

  it('throws PublishAudienceRequiredError when --audience is missing', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      const env = makeFakeEnv({ cwd: tmp.root });
      await expect(executeGather(env, store, { under: 'projects' })).rejects.toBeInstanceOf(PublishAudienceRequiredError);
    } finally {
      await tmp.cleanup();
    }
  });
});

describe('publish gather: --under resolves a subtree', () => {
  it('resolves every note under the prefix, evaluates each, and exits ALLOW when all allow', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = {
        root: tmp.root,
        config: makeConfig({ hard_walls: [{ audience: '*', verdict: 'allow' }] }),
      };
      await writeNote(tmp.root, 'projects/a.md', '# A\n');
      await writeNote(tmp.root, 'projects/b.md', '# B\n');
      await writeNote(tmp.root, 'areas/c.md', '# C (not under prefix)\n');
      const env = makeFakeEnv({ cwd: tmp.root });

      const outcome = await executeGather(env, store, { under: 'projects', audience: 'external' });
      expect(outcome.exitCode).toBe(ExitCode.Ok);
      expect(outcome.data?.count).toBe(2);
      expect(outcome.data?.notes.map((n) => n.path).sort()).toEqual(['projects/a.md', 'projects/b.md']);
      expect(outcome.data?.verdict).toBe('allow');
    } finally {
      await tmp.cleanup();
    }
  });

  it('a single DENY-walled note dominates the exit code, not the majority-ALLOW notes', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = {
        root: tmp.root,
        config: makeConfig({
          hard_walls: [
            { audience: '*', note_path_prefix: 'projects/secret/', verdict: 'deny' },
            { audience: '*', verdict: 'allow' },
          ],
        }),
      };
      await writeNote(tmp.root, 'projects/a.md', '# A\n');
      await writeNote(tmp.root, 'projects/secret/c.md', '# C secret\n');
      const env = makeFakeEnv({ cwd: tmp.root });

      const outcome = await executeGather(env, store, { under: 'projects', audience: 'external' });
      expect(outcome.exitCode).toBe(ExitCode.DisclosureDeny);
      expect(outcome.data?.verdict).toBe('deny');
      const secret = outcome.data?.notes.find((n) => n.path === 'projects/secret/c.md');
      expect(secret?.verdict).toBe('deny');
    } finally {
      await tmp.cleanup();
    }
  });

  it('an empty resolved set exits ALLOW and reports a count of zero', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      const env = makeFakeEnv({ cwd: tmp.root });

      const outcome = await executeGather(env, store, { under: 'nowhere', audience: 'external' });
      expect(outcome.exitCode).toBe(ExitCode.Ok);
      expect(outcome.data?.count).toBe(0);
      expect(outcome.data?.notes).toEqual([]);
    } finally {
      await tmp.cleanup();
    }
  });
});

describe('publish gather: --note resolves exactly one note', () => {
  it('resolves to a single-entry set', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await writeNote(tmp.root, 'projects/a.md', '# A\n');
      const env = makeFakeEnv({ cwd: tmp.root });

      const outcome = await executeGather(env, store, { note: 'projects/a.md', audience: 'external' });
      expect(outcome.data?.count).toBe(1);
      expect(outcome.data?.notes[0]?.path).toBe('projects/a.md');
    } finally {
      await tmp.cleanup();
    }
  });

  it('throws NoteNotFoundError for a note that does not exist', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      const env = makeFakeEnv({ cwd: tmp.root });
      await expect(executeGather(env, store, { note: 'projects/nope.md', audience: 'external' })).rejects.toBeInstanceOf(
        NoteNotFoundError,
      );
    } finally {
      await tmp.cleanup();
    }
  });
});

describe('publish gather: --entity resolves the same backlinks as rollup gather', () => {
  it('resolves every note linking to the entity by stem', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await writeNote(tmp.root, 'projects/topic.md', 'The topic.\n');
      await writeNote(tmp.root, 'projects/a.md', 'Discusses [[topic]].\n');
      await writeNote(tmp.root, 'projects/b.md', 'No link here.\n');
      const env = makeFakeEnv({ cwd: tmp.root });

      const outcome = await executeGather(env, store, { entity: 'projects/topic.md', audience: 'external' });
      expect(outcome.data?.notes.map((n) => n.path)).toEqual(['projects/a.md']);
    } finally {
      await tmp.cleanup();
    }
  });
});

describe('publish gather: --as resolves everything a named context can see', () => {
  it('resolves notes whose resolved visibility the context admits', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = {
        root: tmp.root,
        config: makeConfig(),
      };
      store.config.visibility.contexts = { 'ctx-a': ['ctx-a', 'ctx-shared'] };
      await writeNote(tmp.root, 'projects/a.md', '---\nscope: ctx-a\n---\n# A\n');
      await writeNote(tmp.root, 'projects/b.md', '---\nscope: ctx-shared\n---\n# B\n');
      await writeNote(tmp.root, 'projects/c.md', '---\nscope: ctx-other\n---\n# C\n');
      const env = makeFakeEnv({ cwd: tmp.root });

      const outcome = await executeGather(env, store, { as: 'ctx-a', audience: 'external' });
      expect(outcome.data?.notes.map((n) => n.path).sort()).toEqual(['projects/a.md', 'projects/b.md']);
    } finally {
      await tmp.cleanup();
    }
  });
});
