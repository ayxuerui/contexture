import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { hermeticGitEnv } from '../helpers/git-env.js';
import { runCli } from '../helpers/run-cli.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

const execFileAsync = promisify(execFile);

async function writeNote(root: string, relPath: string, content: string): Promise<void> {
  const full = path.join(root, relPath);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content);
}

/**
 * Task 8.8's literal verification. The fourth clause — "the adapter
 * registry accepts a harness-generation and a forge adapter, and rejects a
 * fixture adapter declaring an unsupported interface version" — is covered
 * at the unit level (test/unit/adapters-registry.test.ts), since v1's
 * registry only resolves built-in adapters by (kind, id); there is no
 * real-CLI-reachable way to register a non-built-in fixture adapter to
 * exercise that path end to end.
 */
describe('adapters (real CLI)', () => {
  it('adapters generate run twice in a row produces byte-identical harness files', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });

      const first = await runCli(['adapters', 'generate', '--json'], { cwd: tmp.root, env });
      expect(first.exitCode).toBe(0);
      const claudeMdBefore = await readFile(path.join(tmp.root, 'CLAUDE.md'), 'utf8');
      const settingsBefore = await readFile(path.join(tmp.root, '.claude/settings.json'), 'utf8');

      const second = await runCli(['adapters', 'generate', '--json'], { cwd: tmp.root, env });
      expect(second.exitCode).toBe(0);
      const claudeMdAfter = await readFile(path.join(tmp.root, 'CLAUDE.md'), 'utf8');
      const settingsAfter = await readFile(path.join(tmp.root, '.claude/settings.json'), 'utf8');

      expect(claudeMdAfter).toBe(claudeMdBefore);
      expect(settingsAfter).toBe(settingsBefore);
      expect(JSON.parse(second.stdout).data.files.every((f: { changed: boolean }) => !f.changed)).toBe(true);
    } finally {
      await tmp.cleanup();
    }
  });

  it('verify --portable exits 0 in a freshly cloned worktree with no harness state present', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      // Generate harness state in the main tree, but never commit it — a
      // session worktree only ever carries tracked, committed content.
      await runCli(['adapters', 'generate'], { cwd: tmp.root, env });

      const start = JSON.parse((await runCli(['session', 'start', '--json'], { cwd: tmp.root, env })).stdout);
      const worktree: string = start.data.worktree;

      const { existsSync } = await import('node:fs');
      expect(existsSync(path.join(worktree, 'CLAUDE.md'))).toBe(false);
      expect(existsSync(path.join(worktree, '.claude/settings.json'))).toBe(false);

      const result = await runCli(['verify', '--portable', '--json'], { cwd: worktree, env });
      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout).data.steps.every((s: { status: string }) => s.status === 'pass')).toBe(true);
    } finally {
      await tmp.cleanup();
    }
  });

  it('deleting a managed AGENTS.md section makes verify --portable fail naming it', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });

      const agentsMdPath = path.join(tmp.root, 'AGENTS.md');
      const content = await readFile(agentsMdPath, 'utf8');
      // Strip the whole "Placing a new note" fenced section, markers included.
      const stripped = content.replace(
        /<!-- >>> contexture:placement.*?<!-- <<< contexture:placement <<< -->\n?/s,
        '',
      );
      expect(stripped).not.toBe(content);
      await writeFile(agentsMdPath, stripped);

      const result = await runCli(['verify', '--portable', '--json'], { cwd: tmp.root, env });
      expect(result.exitCode).not.toBe(0);
      const data = JSON.parse(result.stdout);
      expect(data.findings[0].message).toContain('placement');
    } finally {
      await tmp.cleanup();
    }
  });

  it("session submit degrades to manual-PR instructions with the default (github) forge adapter configured but unreachable", async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      const remote = await makeTmpDir();
      await execFileAsync('git', ['init', '--bare'], { cwd: remote.root, env });
      await execFileAsync('git', ['remote', 'add', 'origin', remote.root], { cwd: tmp.root, env });

      const start = JSON.parse((await runCli(['session', 'start', '--json'], { cwd: tmp.root, env })).stdout);
      const worktree: string = start.data.worktree;
      await writeNote(worktree, 'projects/a.md', '---\nlens: private\n---\nContent.\n');
      await runCli(['catalog', 'build'], { cwd: worktree, env });
      await execFileAsync('git', ['add', '.'], { cwd: worktree, env });

      const submit = await runCli(['session', 'submit', '--json'], { cwd: worktree, env });
      expect(submit.exitCode).toBe(0);
      const data = JSON.parse(submit.stdout).data;
      expect(data.pr).toBeNull();
      expect(data.manualPrInstructions).toBeTruthy();
      await remote.cleanup();
    } finally {
      await tmp.cleanup();
    }
  });
});

/** entry-doc-generation task 3.2, updated by inline-conventions-and-mission: conventions are inlined, not indexed; the skill index is gone entirely. */
describe('entry-doc generation (real CLI)', () => {
  it('a convention file is inlined in full on re-init; an operator-authored skill is not indexed at all', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });

      await writeNote(
        tmp.root,
        '.contexture/guidance/house-style.md',
        '---\ntitle: House style\ndescription: How notes are written here.\n---\n\nBullet points, always.\n',
      );
      await writeNote(
        tmp.root,
        '.claude/skills/weekly-review/SKILL.md',
        '---\nname: weekly-review\ndescription: Walk the health checks weekly.\n---\n\nSteps.\n',
      );

      await runCli(['init'], { cwd: tmp.root, env }); // idempotent path regenerates the conventions section
      await runCli(['adapters', 'generate'], { cwd: tmp.root, env });

      const agentsMd = await readFile(path.join(tmp.root, 'AGENTS.md'), 'utf8');
      expect(agentsMd).toContain('### House style');
      expect(agentsMd).toContain('Bullet points, always.'); // now inlined, not referenced
      expect(agentsMd).toContain('_Source: .contexture/guidance/house-style.md_');
      expect(agentsMd).not.toContain('[House style]'); // no more link-style index entry
      expect(agentsMd).not.toContain('weekly-review'); // the skill index is gone; skills are never named in AGENTS.md
      expect(agentsMd).not.toContain('Steps.'); // the skill body is not inlined either — only conventions/mission are

      const verifyResult = await runCli(['verify', '--portable', '--json'], { cwd: tmp.root, env });
      expect(verifyResult.exitCode).toBe(0);
    } finally {
      await tmp.cleanup();
    }
  });

  it('verify --portable fails when a convention file changes without a matching AGENTS.md regeneration', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      await writeNote(tmp.root, '.contexture/guidance/house-style.md', '---\ntitle: House style\n---\n\nOriginal text.\n');
      await runCli(['init'], { cwd: tmp.root, env });

      // Edit the source directly, bypassing `ctxr update` — AGENTS.md now drifts.
      await writeNote(tmp.root, '.contexture/guidance/house-style.md', '---\ntitle: House style\n---\n\nChanged text.\n');

      const result = await runCli(['verify', '--portable', '--json'], { cwd: tmp.root, env });
      expect(result.exitCode).not.toBe(0);
      expect(JSON.parse(result.stdout).findings[0].message).toContain('conventions');

      await runCli(['update'], { cwd: tmp.root, env });
      const after = await runCli(['verify', '--portable', '--json'], { cwd: tmp.root, env });
      expect(after.exitCode).toBe(0);
    } finally {
      await tmp.cleanup();
    }
  });
});
