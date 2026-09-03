import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { execute as executeGather } from '../../src/commands/publish-gather.js';
import type { StoreConfig } from '../../src/config/schema.js';
import { ExitCode } from '../../src/core/exit-codes.js';
import {
  NoteNotFoundError,
  PublishSelectorConflictError,
  PublishSelectorRequiredError,
} from '../../src/core/errors.js';
import type { Store } from '../../src/core/store.js';
import { makeFakeEnv } from '../helpers/fake-env.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

import { SHIPPED_DEFAULTS } from '../../src/config/defaults.js';
function makeConfig(overrides: Partial<StoreConfig['disclosure']> = {}): StoreConfig {
  return {
    schema_version: 1,
    taxonomy: { profile: 'para', layers: [{ name: 'Projects', path: 'projects', description: '' }] },
    derived: { paths: [] },
    retrieval: { exclude_paths: [], demote_paths: [], gather_max_notes: 50, relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } },
    git: { default_branch: 'main' },
    session: { branch_prefix: 'session/', worktrees_path: '.worktrees/' },
    write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] },
    catalog: { path: 'catalog/', section_max_bytes: 32768 },
    publish: { path: 'publish/' },
    skills: { vendored: [] },
    update_check: SHIPPED_DEFAULTS.update_check,
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

describe('publish gather: selector validation', () => {
  it('throws PublishSelectorRequiredError when no selector is given', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      const env = makeFakeEnv({ cwd: tmp.root });
      await expect(executeGather(env, store, {})).rejects.toBeInstanceOf(PublishSelectorRequiredError);
      // The message names the selectors the command registers and no others:
      // it offered `--as` until retire-the-access-axes removed that flag.
      const error = new PublishSelectorRequiredError();
      expect(error.exitCode).toBe(ExitCode.Usage);
      expect(error.finding.message).toContain('--under, --note, or --entity');
      expect(error.finding.message).not.toContain('--as');
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
        executeGather(env, store, { under: 'projects', note: 'projects/a.md' }),
      ).rejects.toBeInstanceOf(PublishSelectorConflictError);
    } finally {
      await tmp.cleanup();
    }
  });

  it('an empty resolved set exits ALLOW and reports a count of zero', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      const env = makeFakeEnv({ cwd: tmp.root });

      const outcome = await executeGather(env, store, { under: 'nowhere' });
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

      const outcome = await executeGather(env, store, { note: 'projects/a.md' });
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
      await expect(executeGather(env, store, { note: 'projects/nope.md' })).rejects.toBeInstanceOf(
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

      const outcome = await executeGather(env, store, { entity: 'projects/topic.md' });
      expect(outcome.data?.notes.map((n) => n.path)).toEqual(['projects/a.md']);
    } finally {
      await tmp.cleanup();
    }
  });
});

