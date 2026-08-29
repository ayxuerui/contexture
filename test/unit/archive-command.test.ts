import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { execute } from '../../src/commands/archive.js';
import type { StoreConfig } from '../../src/config/schema.js';
import { ArchiveDestinationExistsError, NoteNotFoundError, NoteNotTrackedError } from '../../src/core/errors.js';
import { ExitCode } from '../../src/core/exit-codes.js';
import type { GitResult } from '../../src/core/git/exec.js';
import type { Store } from '../../src/core/store.js';
import { fakeGitRunner, makeFakeEnv } from '../helpers/fake-env.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

function makeConfig(): StoreConfig {
  return {
    schema_version: 1,
    taxonomy: { profile: 'para', layers: [{ name: 'Projects', path: 'projects', description: '' }] },
    fields: { visibility: 'scope' },
    visibility: { default_context: 'private', directory_defaults: {} },
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
    harness: { procedures_path: 'procedures/' },
    adapters: [],
  };
}

async function writeNote(root: string, relPath: string, content: string): Promise<void> {
  const full = path.join(root, relPath);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content);
}

function trackedGitResponses(relativePath: string): Map<string, GitResult> {
  return new Map([
    [`ls-files --error-unmatch -- ${relativePath}`, { exitCode: 0, stdout: '', stderr: '' }],
  ]);
}

describe('archive command', () => {
  it('moves a tracked note into organize.archive_path via a single git mv call', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await writeNote(tmp.root, 'projects/a.md', '---\nscope: shared\n---\nContent.\n');
      const { git, calls } = fakeGitRunner(trackedGitResponses('projects/a.md'));
      const env = makeFakeEnv({ cwd: tmp.root, git });

      const outcome = await execute(env, store, { path: 'projects/a.md' });
      expect(outcome.exitCode).toBe(ExitCode.Ok);
      expect(outcome.data).toEqual({ path: 'projects/a.md', newPath: 'archive/a.md', linkingNotes: [] });
      expect(calls).toContainEqual(['mv', 'projects/a.md', 'archive/a.md']);
    } finally {
      await tmp.cleanup();
    }
  });

  it('reports every other note whose link targets the archived note by stem', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await writeNote(tmp.root, 'projects/a.md', '---\nscope: shared\n---\nContent.\n');
      await writeNote(tmp.root, 'projects/b.md', '---\nscope: shared\n---\nLinks to [[a]].\n');
      await writeNote(tmp.root, 'projects/c.md', '---\nscope: shared\n---\nAlso links to [[a]].\n');
      await writeNote(tmp.root, 'projects/d.md', '---\nscope: shared\n---\nNo relevant link.\n');
      const { git } = fakeGitRunner(trackedGitResponses('projects/a.md'));
      const env = makeFakeEnv({ cwd: tmp.root, git });

      const outcome = await execute(env, store, { path: 'projects/a.md' });
      expect(outcome.data?.linkingNotes).toEqual(['projects/b.md', 'projects/c.md']);
    } finally {
      await tmp.cleanup();
    }
  });

  it('throws NoteNotFoundError for a path that does not exist', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      const env = makeFakeEnv({ cwd: tmp.root });
      await expect(execute(env, store, { path: 'projects/nope.md' })).rejects.toBeInstanceOf(NoteNotFoundError);
    } finally {
      await tmp.cleanup();
    }
  });

  it('throws NoteNotTrackedError when the note is not yet tracked by git', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await writeNote(tmp.root, 'projects/a.md', 'Content.\n');
      const { git } = fakeGitRunner(new Map([['ls-files --error-unmatch -- projects/a.md', { exitCode: 1, stdout: '', stderr: '' }]]));
      const env = makeFakeEnv({ cwd: tmp.root, git });
      await expect(execute(env, store, { path: 'projects/a.md' })).rejects.toBeInstanceOf(NoteNotTrackedError);
    } finally {
      await tmp.cleanup();
    }
  });

  it('throws ArchiveDestinationExistsError rather than overwriting', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await writeNote(tmp.root, 'projects/a.md', 'Content.\n');
      await writeNote(tmp.root, 'archive/a.md', 'Already here.\n');
      const { git } = fakeGitRunner(trackedGitResponses('projects/a.md'));
      const env = makeFakeEnv({ cwd: tmp.root, git });
      await expect(execute(env, store, { path: 'projects/a.md' })).rejects.toBeInstanceOf(ArchiveDestinationExistsError);
    } finally {
      await tmp.cleanup();
    }
  });

  it('leaves the visibility field, and every other frontmatter field, untouched', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await writeNote(tmp.root, 'projects/a.md', '---\nscope: shared\ntitle: Keep Me\n---\nContent.\n');
      const { git } = fakeGitRunner(trackedGitResponses('projects/a.md'));
      const env = makeFakeEnv({ cwd: tmp.root, git });

      await execute(env, store, { path: 'projects/a.md' });

      // movePath is a fake here, so the file doesn't actually relocate on disk;
      // the assertion that matters is that no rewrite touched the file at all —
      // this is not a read+delete+rewrite, so the frontmatter is never even parsed for output.
      const { readFile } = await import('node:fs/promises');
      const original = await readFile(path.join(tmp.root, 'projects/a.md'), 'utf8');
      expect(original).toContain('scope: shared');
      expect(original).toContain('title: Keep Me');
    } finally {
      await tmp.cleanup();
    }
  });
});
