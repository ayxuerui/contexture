import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { StoreConfig } from '../../src/config/schema.js';
import { ensureIdentityFiles, identityFilePaths, IDENTITY_FILES } from '../../src/core/identity.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

function makeConfig(identityPath = 'identity/'): StoreConfig {
  return {
    schema_version: 1,
    taxonomy: { profile: 'para', layers: [] },
    fields: { visibility: 'scope' },
    visibility: { default_context: 'private', directory_defaults: {}, contexts: {} },
    derived: { paths: [] },
    retrieval: { exclude_paths: [identityPath], relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } },
    git: { default_branch: 'main' },
    session: { branch_prefix: 'session/', worktrees_path: '.worktrees/' },
    write_lifecycle: { diff_size_ceiling_lines: 2000 },
    catalog: { path: 'catalog/', section_max_bytes: 32768 },
    disclosure: { internal_audiences: [], hard_walls: [] },
    ingest: { inbox_path: 'inbox/' },
    organize: { archive_path: 'archive/' },
    identity: { path: identityPath },
    harness: { procedures_path: 'procedures/', conventions_path: 'conventions/' },
    adapters: [],
  };
}

describe('identityFilePaths', () => {
  it('joins each canonical filename onto the configured identity path', () => {
    expect(identityFilePaths(makeConfig())).toEqual(IDENTITY_FILES.map((f) => `identity/${f}`));
  });

  it('reflects a non-default identity path', () => {
    expect(identityFilePaths(makeConfig('memory/'))).toEqual(IDENTITY_FILES.map((f) => `memory/${f}`));
  });
});

describe('ensureIdentityFiles', () => {
  it('creates all three canonical files when none exist', async () => {
    const tmp = await makeTmpDir();
    try {
      const created = await ensureIdentityFiles(tmp.root, makeConfig());
      expect(created.sort()).toEqual(identityFilePaths(makeConfig()).sort());
      for (const relPath of created) {
        const content = await readFile(path.join(tmp.root, relPath), 'utf8');
        expect(content.length).toBeGreaterThan(0);
      }
    } finally {
      await tmp.cleanup();
    }
  });

  it('never overwrites an existing identity file', async () => {
    const tmp = await makeTmpDir();
    try {
      const { mkdir, writeFile } = await import('node:fs/promises');
      await mkdir(path.join(tmp.root, 'identity'), { recursive: true });
      await writeFile(path.join(tmp.root, 'identity', 'posture.md'), 'hand-authored content\n');

      const created = await ensureIdentityFiles(tmp.root, makeConfig());
      expect(created).not.toContain('identity/posture.md');

      const content = await readFile(path.join(tmp.root, 'identity/posture.md'), 'utf8');
      expect(content).toBe('hand-authored content\n');
    } finally {
      await tmp.cleanup();
    }
  });
});
