import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { execute as executeGather } from '../../src/commands/publish-gather.js';
import { execute as executeNew } from '../../src/commands/publish-new.js';
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
    retrieval: { exclude_paths: [], demote_paths: [], gather_max_notes: 50, graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } },
    git: { default_branch: 'main' },
    session: { branch_prefix: 'session/', worktrees_path: '.worktrees/' },
    write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] },
    catalog: { path: 'catalog/', section_max_bytes: 32768 },
    publish: { path: 'publish/' },
    templates: { path: '.contexture/templates/', installed: [] },
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


describe('publish gather: the derived filing path', () => {
  async function writePage(root: string, publishRelative: string, readme: string): Promise<void> {
    const dir = path.join(root, 'publish', publishRelative);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'index.html'), '<!doctype html><title>x</title>');
    await writeFile(path.join(dir, 'README.md'), readme);
  }

  it('derives a subtree subject from the prefix it names', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await writeNote(tmp.root, 'projects/ctx-a/work/a.md', '# A\n');
      const env = makeFakeEnv({ cwd: tmp.root });

      const outcome = await executeGather(env, store, { under: 'projects/ctx-a/work' });
      expect(outcome.data?.filing.prefix).toBe('projects/ctx-a/work');
      expect(outcome.data?.filing.path).toBe('publish/projects/ctx-a/work');
      expect(outcome.data?.filing.subject_segment).toBeNull();
    } finally {
      await tmp.cleanup();
    }
  });

  it('derives a note subject from the directory holding it, at the store`s own depth', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await writeNote(tmp.root, 'projects/Ctx A/Work Notes/Ctx Note.md', '# Ctx Note\n');
      const env = makeFakeEnv({ cwd: tmp.root });

      const outcome = await executeGather(env, store, { note: 'projects/Ctx A/Work Notes/Ctx Note.md' });
      // Three segments deep, not truncated to two.
      expect(outcome.data?.filing.prefix).toBe('projects/ctx-a/work-notes');
      expect(outcome.humanSummary).toContain('projects/ctx-a/work-notes/<page-name>');
    } finally {
      await tmp.cleanup();
    }
  });

  it('does not let an entity subject`s backlinks change where its page belongs', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await writeNote(tmp.root, 'projects/ctx-a/topic.md', 'The topic.\n');
      await writeNote(tmp.root, 'areas/ctx-b/a.md', 'Discusses [[topic]].\n');
      await writeNote(tmp.root, 'resources/ctx-c/b.md', 'Also [[topic]].\n');
      const env = makeFakeEnv({ cwd: tmp.root });

      const outcome = await executeGather(env, store, { entity: 'projects/ctx-a/topic.md' });
      expect(outcome.data?.count).toBe(2);
      // The backlinks span three top-level folders; the filing path follows the
      // named note, not their (root) common ancestor.
      expect(outcome.data?.filing.prefix).toBe('projects/ctx-a');
    } finally {
      await tmp.cleanup();
    }
  });

  it('inserts the subject segment and reports the move once the subject has a page', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await writeNote(tmp.root, 'projects/ctx-a/Ctx Note.md', '# Ctx Note\n');
      await writePage(tmp.root, 'projects/ctx-a/page-one', '# page-one\n\n## Source notes\n- [[Ctx Note]]\n');
      const env = makeFakeEnv({ cwd: tmp.root });

      const before = await readdir(path.join(tmp.root, 'publish/projects/ctx-a'));
      const outcome = await executeGather(env, store, { note: 'projects/ctx-a/Ctx Note.md' });

      expect(outcome.data?.filing.prefix).toBe('projects/ctx-a/ctx-note');
      expect(outcome.data?.filing.moves).toEqual([
        { from: 'projects/ctx-a/page-one', to: 'projects/ctx-a/ctx-note/page-one', matched_by: 'readme-link' },
      ]);
      expect(outcome.notices?.[0]).toContain('changes a URL already handed out');
      expect(outcome.exitCode).toBe(ExitCode.Ok);
      // D5: the command reports the move and performs nothing.
      expect(await readdir(path.join(tmp.root, 'publish/projects/ctx-a'))).toEqual(before);
    } finally {
      await tmp.cleanup();
    }
  });

  it('reports that no path derives for a subtree subject naming the store root', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await writeNote(tmp.root, 'projects/a.md', '# A\n');
      const env = makeFakeEnv({ cwd: tmp.root });

      const outcome = await executeGather(env, store, { under: '' });
      expect(outcome.data?.filing.prefix).toBeNull();
      expect(outcome.humanSummary).toContain('no folder path names this subject');
      expect(outcome.exitCode).toBe(ExitCode.Ok);
    } finally {
      await tmp.cleanup();
    }
  });

  it('reports a filing path for an empty resolved set, exactly as for a full one', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      const env = makeFakeEnv({ cwd: tmp.root });

      const outcome = await executeGather(env, store, { under: 'projects/ctx-a' });
      expect(outcome.data?.count).toBe(0);
      expect(outcome.data?.filing.prefix).toBe('projects/ctx-a');
    } finally {
      await tmp.cleanup();
    }
  });

  it('hands `publish new` a prefix it accepts, so the two cannot drift apart', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await writeNote(tmp.root, 'projects/Ctx A/Work Notes/Ctx Note.md', '# Ctx Note\n');
      const env = makeFakeEnv({ cwd: tmp.root });

      const gathered = await executeGather(env, store, { note: 'projects/Ctx A/Work Notes/Ctx Note.md' });
      const created = await executeNew(store, { slug: `${gathered.data!.filing.prefix}/page-one` });

      expect(created.exitCode).toBe(ExitCode.Ok);
      expect(created.data?.path).toBe('publish/projects/ctx-a/work-notes/page-one');
    } finally {
      await tmp.cleanup();
    }
  });
});
