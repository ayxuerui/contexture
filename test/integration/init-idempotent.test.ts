import { execFile } from 'node:child_process';
import { readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { hermeticGitEnv } from '../helpers/git-env.js';
import { runCli } from '../helpers/run-cli.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

const execFileAsync = promisify(execFile);

describe('init idempotency', () => {
  it('re-running init is a no-op: identical content, unchanged mtime, exactly one commit', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      const first = await runCli(['init'], { cwd: tmp.root, env });
      expect(first.exitCode).toBe(0);

      const configPath = path.join(tmp.root, 'contexture.yaml');
      const gitignorePath = path.join(tmp.root, '.gitignore');
      const contentBefore = await readFile(configPath, 'utf8');
      const mtimeBefore = (await stat(gitignorePath)).mtimeMs;

      // Ensure a real mtime change would be observable if a rewrite happened.
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const second = await runCli(['init', '--json'], { cwd: tmp.root, env });
      expect(second.exitCode).toBe(0);
      const data = JSON.parse(second.stdout).data;
      expect(data.already_initialized).toBe(true);
      expect(data.created).toEqual([]);

      const contentAfter = await readFile(configPath, 'utf8');
      const mtimeAfter = (await stat(gitignorePath)).mtimeMs;
      expect(contentAfter).toBe(contentBefore);
      expect(mtimeAfter).toBe(mtimeBefore);

      const { stdout: log } = await execFileAsync('git', ['log', '--oneline'], { cwd: tmp.root, env });
      expect(log.trim().split('\n')).toHaveLength(1);
    } finally {
      await tmp.cleanup();
    }
  });

  // init-generates-harness-adapter-output: init on an existing store runs the
  // same reconcile as `ctxr update`, adapter outputs included.
  it('re-running init restores a missing entry file without rewriting config or committing', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      expect((await runCli(['init', '--harness', 'claude-code'], { cwd: tmp.root, env })).exitCode).toBe(0);
      const configPath = path.join(tmp.root, 'contexture.yaml');
      const entryPath = path.join(tmp.root, 'CLAUDE.md');
      const configBefore = await readFile(configPath, 'utf8');
      await rm(entryPath);

      expect((await runCli(['init'], { cwd: tmp.root, env })).exitCode).toBe(0);
      expect(await readFile(entryPath, 'utf8')).toContain('@AGENTS.md');
      expect(await readFile(configPath, 'utf8')).toBe(configBefore);
      const { stdout: log } = await execFileAsync('git', ['log', '--oneline'], { cwd: tmp.root, env });
      expect(log.trim().split('\n')).toHaveLength(1);

      // And a further run writes nothing.
      const mtimeBefore = (await stat(entryPath)).mtimeMs;
      await new Promise((resolve) => setTimeout(resolve, 1100));
      expect((await runCli(['init'], { cwd: tmp.root, env })).exitCode).toBe(0);
      expect((await stat(entryPath)).mtimeMs).toBe(mtimeBefore);
    } finally {
      await tmp.cleanup();
    }
  });
});

