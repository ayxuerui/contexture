import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { execute } from '../../src/commands/adapters-generate.js';
import { ensureProcedureFiles } from '../../src/core/procedures.js';
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
    adapters,
  };
}

describe('adapters generate command', () => {
  it('writes the harness entry file and identity-injection region when both are configured', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = {
        root: tmp.root,
        config: makeConfig([
          { id: 'claude-code', kind: 'harness-generation' },
          { id: 'claude-code', kind: 'identity-injection' },
        ]),
      };
      const outcome = await execute(store);
      expect(outcome.exitCode).toBe(ExitCode.Ok);

      const content = await readFile(path.join(tmp.root, 'CLAUDE.md'), 'utf8');
      expect(content).toContain('@AGENTS.md');
      expect(content).toContain('@identity/posture.md');
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
      const store: Store = {
        root: tmp.root,
        config: makeConfig([
          { id: 'claude-code', kind: 'harness-generation' },
          { id: 'claude-code', kind: 'identity-injection' },
        ]),
      };
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

describe('skill generation (contexture-home-layout)', () => {
  it('generates one SKILL.md per canonical procedure, pointing at (not copying) the procedure file', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig([{ id: 'claude-code', kind: 'harness-generation' }]) };
      await ensureProcedureFiles(tmp.root, store.config);
      await execute(store);

      const skill = await readFile(
        path.join(tmp.root, '.claude/skills/contexture-placement/SKILL.md'),
        'utf8',
      );
      expect(skill).toContain('name: contexture-placement');
      expect(skill).toContain('description:');
      expect(skill).toContain('procedures/placement.md');
      // pointer, not a copy: none of the procedure's own step text appears
      expect(skill).not.toContain('taxonomy layers');
    } finally {
      await tmp.cleanup();
    }
  });

  it('skill generation is byte-stable across two runs', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig([{ id: 'claude-code', kind: 'harness-generation' }]) };
      await ensureProcedureFiles(tmp.root, store.config);
      await execute(store);
      const skillPath = path.join(tmp.root, '.claude/skills/contexture-organize-audit/SKILL.md');
      const before = await readFile(skillPath, 'utf8');

      const second = await execute(store);
      const after = await readFile(skillPath, 'utf8');
      expect(after).toBe(before);
      expect(second.data?.files.filter((f) => f.path.includes('skills/')).every((f) => !f.changed)).toBe(true);
    } finally {
      await tmp.cleanup();
    }
  });

  it('no skills are generated when no harness-generation adapter is configured', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig([{ id: 'claude-code', kind: 'identity-injection' }]) };
      await execute(store);
      const { existsSync } = await import('node:fs');
      expect(existsSync(path.join(tmp.root, '.claude/skills'))).toBe(false);
    } finally {
      await tmp.cleanup();
    }
  });
});

describe('scan-based skill generation (entry-doc-generation)', () => {
  it('an operator-added procedure gains a skill wrapper identically to a shipped one', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig([{ id: 'claude-code', kind: 'harness-generation' }]) };
      await ensureProcedureFiles(tmp.root, store.config);
      const { mkdir, writeFile } = await import('node:fs/promises');
      await mkdir(path.join(tmp.root, 'procedures'), { recursive: true });
      await writeFile(
        path.join(tmp.root, 'procedures/weekly-review.md'),
        '---\ntitle: Weekly review\ndescription: Walk the store health checks weekly.\n---\n\nSteps here.\n',
      );

      await execute(store);
      const skill = await readFile(path.join(tmp.root, '.claude/skills/contexture-weekly-review/SKILL.md'), 'utf8');
      expect(skill).toContain('name: contexture-weekly-review');
      expect(skill).toContain('description: Walk the store health checks weekly.');
      expect(skill).toContain('procedures/weekly-review.md');
      expect(skill).not.toContain('Steps here');
    } finally {
      await tmp.cleanup();
    }
  });
});
