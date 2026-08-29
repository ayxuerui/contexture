import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { execute } from '../../src/commands/note-resolve.js';
import type { StoreConfig } from '../../src/config/schema.js';
import type { Store } from '../../src/core/store.js';
import { makeFakeEnv } from '../helpers/fake-env.js';

const FIXTURES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/notes');

function makeStore(root: string): Store {
  const config: StoreConfig = {
    schema_version: 1,
    taxonomy: { profile: 'para', layers: [] },
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
  return { root, config };
}

describe('note resolve command', () => {
  it('reports the fail-closed default for a note with no frontmatter', async () => {
    const store = makeStore(FIXTURES_DIR);
    const env = makeFakeEnv({ cwd: FIXTURES_DIR });
    const outcome = await execute(env, store, { path: 'no-frontmatter.md' });
    expect(outcome.data).toEqual({ path: 'no-frontmatter.md', visibility: 'private', reason: 'fail-closed default' });
  });

  it('reports "explicit" for a note with an explicit visibility field', async () => {
    const store = makeStore(FIXTURES_DIR);
    const env = makeFakeEnv({ cwd: FIXTURES_DIR });
    const outcome = await execute(env, store, { path: 'explicit-visibility.md' });
    expect(outcome.data).toEqual({ path: 'explicit-visibility.md', visibility: 'shared', reason: 'explicit' });
  });

  it('accepts an absolute path and normalizes it to store-relative', async () => {
    const store = makeStore(FIXTURES_DIR);
    const env = makeFakeEnv({ cwd: '/somewhere/else' });
    const outcome = await execute(env, store, { path: path.join(FIXTURES_DIR, 'explicit-visibility.md') });
    expect(outcome.data?.path).toBe('explicit-visibility.md');
  });
});
