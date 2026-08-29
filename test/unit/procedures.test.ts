import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { StoreConfig } from '../../src/config/schema.js';
import { ensureProcedureFiles, procedurePaths, PROCEDURES } from '../../src/core/procedures.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

function makeConfig(): StoreConfig {
  return {
    schema_version: 1,
    taxonomy: { profile: 'para', layers: [] },
    fields: { visibility: 'scope' },
    visibility: { default_context: 'private', directory_defaults: {}, contexts: {} },
    derived: { paths: [] },
    retrieval: { exclude_paths: ['procedures/'] },
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
}

describe('PROCEDURES', () => {
  it('names the four judgment-side operations from the task list', () => {
    expect(PROCEDURES.map((p) => p.name)).toEqual([
      'Ingest orchestration',
      'Placement',
      'Connection finding',
      'Organize audit',
    ]);
  });
});

describe('ensureProcedureFiles', () => {
  it('creates every procedure file with non-empty content', async () => {
    const tmp = await makeTmpDir();
    try {
      const created = await ensureProcedureFiles(tmp.root, makeConfig());
      expect(created.sort()).toEqual(procedurePaths(makeConfig()).sort());
      for (const relPath of created) {
        const content = await readFile(path.join(tmp.root, relPath), 'utf8');
        expect(content.length).toBeGreaterThan(0);
      }
    } finally {
      await tmp.cleanup();
    }
  });

  it('never overwrites an existing (possibly customized) procedure file', async () => {
    const tmp = await makeTmpDir();
    try {
      const { mkdir, writeFile } = await import('node:fs/promises');
      await mkdir(path.join(tmp.root, 'procedures'), { recursive: true });
      await writeFile(path.join(tmp.root, 'procedures', 'placement.md'), 'customized\n');

      const created = await ensureProcedureFiles(tmp.root, makeConfig());
      expect(created).not.toContain('procedures/placement.md');

      const content = await readFile(path.join(tmp.root, 'procedures/placement.md'), 'utf8');
      expect(content).toBe('customized\n');
    } finally {
      await tmp.cleanup();
    }
  });
});
