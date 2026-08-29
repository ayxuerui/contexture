import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { execute } from '../../src/commands/check.js';
import type { StoreConfig } from '../../src/config/schema.js';
import { NoteNotFoundError } from '../../src/core/errors.js';
import { ExitCode } from '../../src/core/exit-codes.js';
import type { Store } from '../../src/core/store.js';
import { makeFakeEnv } from '../helpers/fake-env.js';

const FIXTURES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/notes');

function makeStore(root: string, disclosure: StoreConfig['disclosure'] = { internal_audiences: [], hard_walls: [] }): Store {
  const config: StoreConfig = {
    schema_version: 1,
    taxonomy: { profile: 'para', layers: [] },
    fields: { visibility: 'scope' },
    visibility: { default_context: 'private', directory_defaults: {} },
    derived: { paths: [] },
    retrieval: { exclude_paths: [] },
    git: { default_branch: 'main' },
    session: { branch_prefix: 'session/', worktrees_path: '.worktrees/' },
    write_lifecycle: { diff_size_ceiling_lines: 2000 },
    catalog: { path: 'catalog/', section_max_bytes: 32768 },
    disclosure,
    ingest: { inbox_path: 'inbox/' },
  };
  return { root, config };
}

describe('check command', () => {
  it('maps ALLOW to exit code Ok', async () => {
    const store = makeStore(FIXTURES_DIR, {
      internal_audiences: [],
      hard_walls: [{ audience: 'external', verdict: 'allow' }],
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
});
