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
    retrieval: { exclude_paths: [], demote_paths: [], gather_max_notes: 50, relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } },
    git: { default_branch: 'main' },
    session: { branch_prefix: 'session/', worktrees_path: '.worktrees/' },
    write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] },
    catalog: { path: 'catalog/', section_max_bytes: 32768 },
    publish: { path: 'publish/' },
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

  it('merges the permission config for a harness that declares one', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig([{ id: 'claude-code', kind: 'harness-generation' }]) };
      await execute(makeFakeEnv(), store);
      const settings = JSON.parse(await readFile(path.join(tmp.root, '.claude/settings.json'), 'utf8'));
      // The write gate is the PreToolUse hook alone. No `Bash(git …)` deny is emitted: `ctxr-submit`
      // instructs `git commit`/`git push` directly, so denying them would forbid the shipped skill.
      expect(settings.permissions?.deny).toBeUndefined();
      expect(settings.permissions?.allow).toBeUndefined();
      expect(settings.hooks.PreToolUse[0]).toMatchObject({
        matcher: 'Edit|Write|NotebookEdit',
        hooks: [{ type: 'command', command: path.join(tmp.root, '.claude/hooks/claude-code-write-gate.sh') }],
      });
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
      expect(settings.hooks.PreToolUse[0].hooks[0].command).toBe(
        path.join(tmp.root, '.claude/hooks/claude-code-write-gate.sh'),
      );
    } finally {
      await tmp.cleanup();
    }
  });

  it('never emits a Write(path) rule, since Claude Code accepts but never enforces one', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig([{ id: 'claude-code', kind: 'harness-generation' }]) };
      await execute(makeFakeEnv(), store);
      // Asserted against the raw file, not a `deny` list that no longer exists on a fresh store — this
      // stays a real check (no Write() rule anywhere) rather than vacuously passing over an absent key.
      const raw = await readFile(path.join(tmp.root, '.claude/settings.json'), 'utf8');
      expect(raw).not.toContain('"Write(');
    } finally {
      await tmp.cleanup();
    }
  });

  it('anchors the hook command at the store root, not the launch cwd, so a session opened directly inside a worktree still resolves it', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig([{ id: 'claude-code', kind: 'harness-generation' }]) };
      await execute(makeFakeEnv(), store);
      const settings = JSON.parse(await readFile(path.join(tmp.root, '.claude/settings.json'), 'utf8'));
      const command = settings.hooks.PreToolUse[0].hooks[0].command as string;
      expect(command).toBe(path.join(tmp.root, '.claude/hooks/claude-code-write-gate.sh'));
      expect(path.isAbsolute(command)).toBe(true);
    } finally {
      await tmp.cleanup();
    }
  });

  it('installs the write-gate hook script, executable, resolving ctxr at run time with no baked-in path', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig([{ id: 'claude-code', kind: 'harness-generation' }]) };
      await execute(makeFakeEnv(), store);
      const scriptPath = path.join(tmp.root, '.claude/hooks/claude-code-write-gate.sh');
      const script = await readFile(scriptPath, 'utf8');
      expect(script).not.toContain('__CONTEXTURE_BIN__');
      expect(script).not.toContain('__RESOLVE_CTXR__');
      expect(script).not.toContain(tmp.root);
      expect(script).toContain('command -v ctxr');
      expect(script).toContain('adapters write-gate');
      const { stat } = await import('node:fs/promises');
      const mode = (await stat(scriptPath)).mode;
      expect(mode & 0o111).not.toBe(0);
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
      expect(settings.hooks.PreToolUse[0].hooks[0].command).toBe(path.join(tmp.root, '.claude/hooks/claude-code-write-gate.sh'));

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
      const settingsBefore = await readFile(path.join(tmp.root, '.claude/settings.json'), 'utf8');

      const second = await execute(makeFakeEnv(), store);
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

  describe('stabilize-write-gate-hook-path', () => {
    it('anchors the hook command at the main worktree, not store.root, when store.root is a linked session worktree', async () => {
      const tmp = await makeTmpDir();
      const main = await makeTmpDir();
      try {
        const worktreeRoot = path.join(tmp.root, '.worktrees', 'session-a');
        await mkdir(worktreeRoot, { recursive: true });
        const store: Store = { root: worktreeRoot, config: makeConfig([{ id: 'claude-code', kind: 'harness-generation' }]) };
        const { git } = fakeGitRunner(
          new Map<string, GitResult>([['worktree list --porcelain', { exitCode: 0, stdout: soleWorktree(main.root), stderr: '' }]]),
        );

        await execute(makeFakeEnv({ git }), store);

        const settings = JSON.parse(await readFile(path.join(worktreeRoot, '.claude/settings.json'), 'utf8'));
        const command = settings.hooks.PreToolUse[0].hooks[0].command as string;
        expect(command).toBe(path.join(main.root, '.claude/hooks/claude-code-write-gate.sh'));
        expect(command).not.toBe(path.join(worktreeRoot, '.claude/hooks/claude-code-write-gate.sh'));
      } finally {
        await tmp.cleanup();
        await main.cleanup();
      }
    });

    it('converges settings.json to exactly one hook entry, anchored at the main worktree, when it already carries entries from two different past worktrees', async () => {
      const tmp = await makeTmpDir();
      try {
        const staleA = path.join(tmp.root, '.worktrees', 'session-a', '.claude/hooks/claude-code-write-gate.sh');
        const staleB = path.join(tmp.root, '.worktrees', 'session-b', '.claude/hooks/claude-code-write-gate.sh');
        await mkdir(path.join(tmp.root, '.claude'), { recursive: true });
        await writeFile(
          path.join(tmp.root, '.claude/settings.json'),
          JSON.stringify(
            {
              hooks: {
                PreToolUse: [
                  { matcher: 'Edit|Write|NotebookEdit', hooks: [{ type: 'command', command: staleA }] },
                  { matcher: 'Edit|Write|NotebookEdit', hooks: [{ type: 'command', command: staleB }] },
                ],
              },
            },
            null,
            2,
          ),
        );

        const store: Store = { root: tmp.root, config: makeConfig([{ id: 'claude-code', kind: 'harness-generation' }]) };
        await execute(makeFakeEnv(), store); // default fake git: mainWorktreePath falls back to store.root

        const settings = JSON.parse(await readFile(path.join(tmp.root, '.claude/settings.json'), 'utf8'));
        expect(settings.hooks.PreToolUse).toHaveLength(1);
        expect(settings.hooks.PreToolUse[0].hooks[0].command).toBe(path.join(tmp.root, '.claude/hooks/claude-code-write-gate.sh'));
      } finally {
        await tmp.cleanup();
      }
    });

    it('generates the same hook path as before this change when the store has no linked worktrees', async () => {
      const tmp = await makeTmpDir();
      try {
        const store: Store = { root: tmp.root, config: makeConfig([{ id: 'claude-code', kind: 'harness-generation' }]) };
        const { git } = fakeGitRunner(
          new Map<string, GitResult>([['worktree list --porcelain', { exitCode: 0, stdout: soleWorktree(tmp.root), stderr: '' }]]),
        );

        await execute(makeFakeEnv({ git }), store);

        const settings = JSON.parse(await readFile(path.join(tmp.root, '.claude/settings.json'), 'utf8'));
        expect(settings.hooks.PreToolUse[0].hooks[0].command).toBe(path.join(tmp.root, '.claude/hooks/claude-code-write-gate.sh'));
      } finally {
        await tmp.cleanup();
      }
    });
  });
});
