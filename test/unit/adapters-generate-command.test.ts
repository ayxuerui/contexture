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

/** `git worktree list --porcelain` output naming a single main worktree at `mainRoot`. */
function soleWorktree(mainRoot: string): string {
  return `worktree ${mainRoot}\nHEAD 0000000000000000000000000000000000000000\nbranch refs/heads/main\n`;
}

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
    write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] },
    catalog: { path: 'catalog/', section_max_bytes: 32768 },
    publish: { path: 'publish/' },
    skills: { vendored: [] },
    disclosure: { internal_audiences: [], hard_walls: [], leak_markers: {} },
    ingest: { inbox_path: 'inbox/', tracking_params: [] },
    organize: { archive_path: 'archive/', rollup_stale_days: 7 },
    harness: { skills_path: 'skills/', guidance_path: 'guidance/' },
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
      expect(settings.permissions.deny).toEqual(['Bash(git push:*)', 'Bash(git commit:*)']);
      expect(settings.permissions.allow).toBeUndefined();
      expect(settings.hooks.PreToolUse[0]).toMatchObject({
        matcher: 'Edit|Write|NotebookEdit',
        hooks: [{ type: 'command', command: path.join(tmp.root, '.claude/hooks/claude-code-write-gate.sh') }],
      });
    } finally {
      await tmp.cleanup();
    }
  });

  it('never emits a Write(path) rule, since Claude Code accepts but never enforces one', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig([{ id: 'claude-code', kind: 'harness-generation' }]) };
      await execute(makeFakeEnv(), store);
      const settings = JSON.parse(await readFile(path.join(tmp.root, '.claude/settings.json'), 'utf8'));
      expect((settings.permissions.deny as string[]).some((r) => r.startsWith('Write('))).toBe(false);
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

  it('installs the write-gate hook script, executable, with the bin path substituted', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig([{ id: 'claude-code', kind: 'harness-generation' }]) };
      await execute(makeFakeEnv(), store);
      const scriptPath = path.join(tmp.root, '.claude/hooks/claude-code-write-gate.sh');
      const script = await readFile(scriptPath, 'utf8');
      expect(script).not.toContain('__CONTEXTURE_BIN__');
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
      expect(settings.permissions.deny).toEqual(['Bash(git push:*)', 'Bash(git commit:*)', 'Bash(hand-added-rule:*)']);
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
