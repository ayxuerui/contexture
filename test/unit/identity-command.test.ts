import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { executeAdd, executeRemove, executeReplace } from '../../src/commands/identity.js';
import type { StoreConfig } from '../../src/config/schema.js';
import { UnknownIdentityRoleError } from '../../src/core/errors.js';
import type { Store } from '../../src/core/store.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

function makeConfig(): StoreConfig {
  return {
    schema_version: 1,
    taxonomy: { profile: 'para', layers: [] },
    fields: { visibility: 'scope' },
    visibility: { default_context: 'private', directory_defaults: {}, contexts: {} },
    derived: { paths: [] },
    retrieval: { exclude_paths: ['identity/'], relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } },
    git: { default_branch: 'main' },
    session: { branch_prefix: 'session/', worktrees_path: '.worktrees/' },
    write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] },
    catalog: { path: 'catalog/', section_max_bytes: 32768 },
    disclosure: { internal_audiences: [], hard_walls: [] },
    ingest: { inbox_path: 'inbox/' },
    organize: { archive_path: 'archive/' },
    identity: { path: 'identity/', files: {}, entry_delimiter: '' },
    harness: { procedures_path: 'procedures/', conventions_path: 'conventions/' },
    adapters: [],
  };
}

describe('ctxr identity (session-capture-command)', () => {
  it('add appends an entry and reports the resolved path and count', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      const outcome = await executeAdd(store, { file: 'user-facts', text: 'prefers concise answers' });
      expect(outcome.exitCode).toBe(0);
      expect(outcome.data).toEqual({ path: 'identity/user-facts.md', entries: 1 });
      expect(await readFile(path.join(tmp.root, 'identity/user-facts.md'), 'utf8')).toBe('prefers concise answers\n');
    } finally {
      await tmp.cleanup();
    }
  });

  it('replace and remove operate on the unique matching entry', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await executeAdd(store, { file: 'world-facts', text: 'fact one' });
      await executeAdd(store, { file: 'world-facts', text: 'fact two' });

      const replaced = await executeReplace(store, { file: 'world-facts', match: 'fact one', text: 'fact one, revised' });
      expect(replaced.data?.entries).toBe(2);
      expect(await readFile(path.join(tmp.root, 'identity/world-facts.md'), 'utf8')).toBe('fact one, revised\n\nfact two\n');

      const removed = await executeRemove(store, { file: 'world-facts', match: 'fact two' });
      expect(removed.data?.entries).toBe(1);
      expect(await readFile(path.join(tmp.root, 'identity/world-facts.md'), 'utf8')).toBe('fact one, revised\n');
    } finally {
      await tmp.cleanup();
    }
  });

  it('an unknown --file role is a distinct error', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await expect(executeAdd(store, { file: 'memory', text: 'x' })).rejects.toBeInstanceOf(UnknownIdentityRoleError);
    } finally {
      await tmp.cleanup();
    }
  });

  it('add writes through a role bound outside identity.path', async () => {
    const tmp = await makeTmpDir();
    try {
      const config = makeConfig();
      config.identity.files = { posture: 'twin/SOUL.md' };
      const store: Store = { root: tmp.root, config };
      const outcome = await executeAdd(store, { file: 'posture', text: 'be terse' });
      expect(outcome.data?.path).toBe('twin/SOUL.md');
      expect(await readFile(path.join(tmp.root, 'twin/SOUL.md'), 'utf8')).toBe('be terse\n');
    } finally {
      await tmp.cleanup();
    }
  });
});
