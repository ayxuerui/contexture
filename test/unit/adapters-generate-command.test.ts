import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { execute } from '../../src/commands/adapters-generate.js';
import type { AdapterDeclaration, StoreConfig } from '../../src/config/schema.js';
import type { GitResult } from '../../src/core/git/exec.js';
import { ExitCode } from '../../src/core/exit-codes.js';
import type { Store } from '../../src/core/store.js';
import { fakeGitRunner, makeFakeEnv } from '../helpers/fake-env.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

import { SHIPPED_DEFAULTS } from '../../src/config/defaults.js';
/** `git worktree list --porcelain` output naming a single main worktree at `mainRoot`. */
function soleWorktree(mainRoot: string): string {
  return `worktree ${mainRoot}\nHEAD 0000000000000000000000000000000000000000\nbranch refs/heads/main\n`;
}

function makeConfig(adapters: AdapterDeclaration[]): StoreConfig {
  return {
    schema_version: 1,
    taxonomy: { profile: 'para', layers: [] },
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
    adapters,
  };
}

describe('adapters generate command', () => {
  it('writes a harness entry file whose managed content is the AGENTS.md import and nothing else', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig([{ id: 'claude-code', kind: 'harness-generation' }]) };
      const outcome = await execute(makeFakeEnv(), store);
      expect(outcome.exitCode).toBe(ExitCode.Ok);

      const content = await readFile(path.join(tmp.root, 'CLAUDE.md'), 'utf8');
      const managed = content.split('\n').filter((l) => l.trim() && !l.startsWith('<!--'));
      expect(managed).toEqual(['@AGENTS.md']);
    } finally {
      await tmp.cleanup();
    }
  });

  // retire-the-write-gate: the adapter's permission config is cleanup-only now.
  // A fresh store gets no rules, no hook, and no settings.json conjured out of
  // an empty patch.
  it('writes no permission config for a fresh store, since the adapter emits nothing', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig([{ id: 'claude-code', kind: 'harness-generation' }]) };
      await execute(makeFakeEnv(), store);
      await expect(readFile(path.join(tmp.root, '.claude/settings.json'), 'utf8')).rejects.toMatchObject({
        code: 'ENOENT',
      });
      await expect(readFile(path.join(tmp.root, '.claude/hooks/claude-code-write-gate.sh'), 'utf8')).rejects.toMatchObject(
        { code: 'ENOENT' },
      );
    } finally {
      await tmp.cleanup();
    }
  });

  it('sheds the retired Bash(git \u2026) denies from a store generated before ctxr-submit drove git directly', async () => {
    const tmp = await makeTmpDir();
    try {
      await mkdir(path.join(tmp.root, '.claude'), { recursive: true });
      await writeFile(
        path.join(tmp.root, '.claude/settings.json'),
        JSON.stringify({ permissions: { deny: ['Bash(git push:*)', 'Bash(git commit:*)'] } }, null, 2),
      );

      const store: Store = { root: tmp.root, config: makeConfig([{ id: 'claude-code', kind: 'harness-generation' }]) };
      await execute(makeFakeEnv(), store);

      // The convergence path every existing store takes on its next `ctxr update`: without this, the
      // generated config would forbid the `git commit` / `git push` its own ctxr-submit skill instructs.
      const settings = JSON.parse(await readFile(path.join(tmp.root, '.claude/settings.json'), 'utf8'));
      expect(settings.permissions?.deny).toBeUndefined();
      expect(settings.hooks).toBeUndefined();
    } finally {
      await tmp.cleanup();
    }
  });

  it('never emits a Write(path) rule, since Claude Code accepts but never enforces one', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig([{ id: 'claude-code', kind: 'harness-generation' }]) };
      await execute(makeFakeEnv(), store);
      // Asserted against the raw file where one exists. Since retire-the-write-gate a fresh store gets
      // no settings.json at all, which is a stronger form of the same guarantee, so accept either.
      const raw = await readFile(path.join(tmp.root, '.claude/settings.json'), 'utf8').catch(() => '');
      expect(raw).not.toContain('"Write(');
    } finally {
      await tmp.cleanup();
    }
  });

  // retire-the-write-gate: a store carrying the hook from any earlier release
  // converges — the entry goes, whatever absolute path it was baked with, and
  // the orphaned script goes with it.
  it('removes the write-gate hook entry and its script from a store generated by an earlier release', async () => {
    const tmp = await makeTmpDir();
    try {
      const foreign = '/home/someone-else/workspace/pkm/.claude/hooks/claude-code-write-gate.sh';
      await mkdir(path.join(tmp.root, '.claude/hooks'), { recursive: true });
      await writeFile(path.join(tmp.root, '.claude/hooks/claude-code-write-gate.sh'), '#!/bin/sh\nexit 0\n');
      await writeFile(
        path.join(tmp.root, '.claude/settings.json'),
        JSON.stringify(
          { hooks: { PreToolUse: [{ matcher: 'Edit|Write|NotebookEdit', hooks: [{ type: 'command', command: foreign }] }] } },
          null,
          2,
        ),
      );

      const store: Store = { root: tmp.root, config: makeConfig([{ id: 'claude-code', kind: 'harness-generation' }]) };
      await execute(makeFakeEnv(), store);

      const settings = JSON.parse(await readFile(path.join(tmp.root, '.claude/settings.json'), 'utf8'));
      expect(settings.hooks).toBeUndefined();
      await expect(readFile(path.join(tmp.root, '.claude/hooks/claude-code-write-gate.sh'), 'utf8')).rejects.toMatchObject(
        { code: 'ENOENT' },
      );
    } finally {
      await tmp.cleanup();
    }
  });

  it("leaves an operator's own PreToolUse hook alone while retiring contexture's", async () => {
    const tmp = await makeTmpDir();
    try {
      await mkdir(path.join(tmp.root, '.claude'), { recursive: true });
      await writeFile(
        path.join(tmp.root, '.claude/settings.json'),
        JSON.stringify(
          {
            hooks: {
              PreToolUse: [
                {
                  matcher: 'Edit|Write|NotebookEdit',
                  hooks: [{ type: 'command', command: '/anywhere/.claude/hooks/claude-code-write-gate.sh' }],
                },
                { matcher: 'Bash', hooks: [{ type: 'command', command: '/my/own/audit.sh' }] },
              ],
            },
          },
          null,
          2,
        ),
      );

      const store: Store = { root: tmp.root, config: makeConfig([{ id: 'claude-code', kind: 'harness-generation' }]) };
      await execute(makeFakeEnv(), store);

      const settings = JSON.parse(await readFile(path.join(tmp.root, '.claude/settings.json'), 'utf8'));
      expect(settings.hooks.PreToolUse).toHaveLength(1);
      expect(settings.hooks.PreToolUse[0].hooks[0].command).toBe('/my/own/audit.sh');
    } finally {
      await tmp.cleanup();
    }
  });

  it('repairs a settings.json generated by a previous, defective release: legacy rules removed, a hand-added rule survives', async () => {
    const tmp = await makeTmpDir();
    try {
      const absRoot = tmp.root.replace(/^\/+/, '');
      const legacy = {
        permissions: {
          deny: [
            `Write(//${absRoot}/**)`,
            `Edit(//${absRoot}/**)`,
            'Bash(git push:*)',
            'Bash(git commit:*)',
            'Bash(hand-added-rule:*)',
          ],
          allow: [`Write(//${absRoot}/.worktrees/**)`, `Edit(//${absRoot}/.worktrees/**)`],
        },
      };
      await mkdir(path.join(tmp.root, '.claude'), { recursive: true });
      await writeFile(path.join(tmp.root, '.claude/settings.json'), JSON.stringify(legacy, null, 2));

      const store: Store = { root: tmp.root, config: makeConfig([{ id: 'claude-code', kind: 'harness-generation' }]) };
      await execute(makeFakeEnv(), store);
      const settings = JSON.parse(await readFile(path.join(tmp.root, '.claude/settings.json'), 'utf8'));
      // Both generations of retired rules are gone — the Write/Edit pair the PreToolUse hook replaced,
      // and the `Bash(git …)` pair that used to force commits through `ctxr session submit`. Only the
      // operator's own rule, which the generator never emitted, survives.
      expect(settings.permissions.deny).toEqual(['Bash(hand-added-rule:*)']);
      expect(settings.permissions.allow).toBeUndefined();
      expect(settings.hooks).toBeUndefined();

      const before = await readFile(path.join(tmp.root, '.claude/settings.json'), 'utf8');
      const second = await execute(makeFakeEnv(), store);
      const after = await readFile(path.join(tmp.root, '.claude/settings.json'), 'utf8');
      expect(after).toBe(before);
      expect(second.data?.files.find((f) => f.path === '.claude/settings.json')?.changed).toBe(false);
    } finally {
      await tmp.cleanup();
    }
  });

  it('running generate twice in a row produces byte-identical output (task 8.8)', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig([{ id: 'claude-code', kind: 'harness-generation' }]) };
      await execute(makeFakeEnv(), store);
      const claudeMdBefore = await readFile(path.join(tmp.root, 'CLAUDE.md'), 'utf8');
      // No settings.json on a fresh store since retire-the-write-gate — its absence
      // has to stay stable across runs too, not flip to an empty file on the second.
      const settingsBefore = await readFile(path.join(tmp.root, '.claude/settings.json'), 'utf8').catch(() => null);

      const second = await execute(makeFakeEnv(), store);
      const claudeMdAfter = await readFile(path.join(tmp.root, 'CLAUDE.md'), 'utf8');
      const settingsAfter = await readFile(path.join(tmp.root, '.claude/settings.json'), 'utf8').catch(() => null);

      expect(claudeMdAfter).toBe(claudeMdBefore);
      expect(settingsAfter).toBe(settingsBefore);
      expect(settingsAfter).toBeNull();
      expect(second.data?.files.every((f) => !f.changed)).toBe(true);
    } finally {
      await tmp.cleanup();
    }
  });

  it('produces no output at all when no adapters are configured', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig([]) };
      const outcome = await execute(makeFakeEnv(), store);
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
      await execute(makeFakeEnv(), store);
      const content = await readFile(path.join(tmp.root, 'CLAUDE.md'), 'utf8');
      expect(content).toContain('Some hand-written text.');
      expect(content).toContain('@AGENTS.md');
    } finally {
      await tmp.cleanup();
    }
  });

});
