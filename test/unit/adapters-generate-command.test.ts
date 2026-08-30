import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { execute } from '../../src/commands/adapters-generate.js';
import type { AdapterDeclaration, StoreConfig } from '../../src/config/schema.js';
import { ExitCode } from '../../src/core/exit-codes.js';
import type { Store } from '../../src/core/store.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

function makeConfig(adapters: AdapterDeclaration[]): StoreConfig {
  return {
    schema_version: 1,
    taxonomy: { profile: 'para', layers: [] },
    fields: { visibility: 'scope' },
    visibility: { default_context: 'private', directory_defaults: {}, contexts: {} },
    derived: { paths: [] },
    retrieval: { exclude_paths: [], relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } },
    git: { default_branch: 'main' },
    session: { branch_prefix: 'session/', worktrees_path: '.worktrees/' },
    write_lifecycle: { diff_size_ceiling_lines: 2000 },
    catalog: { path: 'catalog/', section_max_bytes: 32768 },
    disclosure: { internal_audiences: [], hard_walls: [] },
    ingest: { inbox_path: 'inbox/' },
    organize: { archive_path: 'archive/' },
    identity: { path: 'identity/' },
    harness: { procedures_path: 'procedures/', conventions_path: 'conventions/' },
    adapters,
  };
}

describe('adapters generate command', () => {
  it('writes a harness entry file whose managed content is the AGENTS.md import and nothing else', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig([{ id: 'claude-code', kind: 'harness-generation' }]) };
      const outcome = await execute(store);
      expect(outcome.exitCode).toBe(ExitCode.Ok);

      const content = await readFile(path.join(tmp.root, 'CLAUDE.md'), 'utf8');
      const managed = content.split('\n').filter((l) => l.trim() && !l.startsWith('<!--'));
      expect(managed).toEqual(['@AGENTS.md']);
      expect(content).not.toContain('identity/');
    } finally {
      await tmp.cleanup();
    }
  });

  it('merges the permission config for a harness that declares one', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig([{ id: 'claude-code', kind: 'harness-generation' }]) };
      await execute(store);
      const settings = JSON.parse(await readFile(path.join(tmp.root, '.claude/settings.json'), 'utf8'));
      expect(settings.permissions.deny).toContain('Bash(git push:*)');
      expect(settings.permissions.allow).toContain('Write(./.worktrees/**)');
    } finally {
      await tmp.cleanup();
    }
  });

  it('running generate twice in a row produces byte-identical output (task 8.8)', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig([{ id: 'claude-code', kind: 'harness-generation' }]) };
      await execute(store);
      const claudeMdBefore = await readFile(path.join(tmp.root, 'CLAUDE.md'), 'utf8');
      const settingsBefore = await readFile(path.join(tmp.root, '.claude/settings.json'), 'utf8');

      const second = await execute(store);
      const claudeMdAfter = await readFile(path.join(tmp.root, 'CLAUDE.md'), 'utf8');
      const settingsAfter = await readFile(path.join(tmp.root, '.claude/settings.json'), 'utf8');

      expect(claudeMdAfter).toBe(claudeMdBefore);
      expect(settingsAfter).toBe(settingsBefore);
      expect(second.data?.files.every((f) => !f.changed)).toBe(true);
    } finally {
      await tmp.cleanup();
    }
  });

  it('produces no output at all when no adapters are configured', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig([]) };
      const outcome = await execute(store);
      expect(outcome.data?.files).toEqual([]);
      const { existsSync } = await import('node:fs');
      expect(existsSync(path.join(tmp.root, 'CLAUDE.md'))).toBe(false);
    } finally {
      await tmp.cleanup();
    }
  });

  it('preserves a hand-authored preamble outside the managed fence', async () => {
    const tmp = await makeTmpDir();
    try {
      await mkdir(tmp.root, { recursive: true });
      await writeFile(path.join(tmp.root, 'CLAUDE.md'), '# My notes\n\nSome hand-written text.\n');
      const store: Store = { root: tmp.root, config: makeConfig([{ id: 'claude-code', kind: 'harness-generation' }]) };
      await execute(store);
      const content = await readFile(path.join(tmp.root, 'CLAUDE.md'), 'utf8');
      expect(content).toContain('Some hand-written text.');
      expect(content).toContain('@AGENTS.md');
    } finally {
      await tmp.cleanup();
    }
  });
});
