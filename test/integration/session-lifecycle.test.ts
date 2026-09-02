import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { hermeticGitEnv } from '../helpers/git-env.js';
import { runCli } from '../helpers/run-cli.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

const execFileAsync = promisify(execFile);

describe('session lifecycle (real git, real CLI)', () => {
  it('session start yields an isolated worktree with its own branch', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      const result = await runCli(['session', 'start', '--json'], { cwd: tmp.root, env });
      expect(result.exitCode).toBe(0);
      const data = JSON.parse(result.stdout).data;
      expect(data.worktree).toContain('.worktrees');
      expect(data.branch).toMatch(/^session\//);

      const list = await execFileAsync('git', ['worktree', 'list'], { cwd: tmp.root, env });
      expect(list.stdout).toContain(data.worktree);
    } finally {
      await tmp.cleanup();
    }
  });

  it('two session start invocations in a row both succeed with distinct worktrees', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      const first = await runCli(['session', 'start', '--json'], { cwd: tmp.root, env });
      const second = await runCli(['session', 'start', '--json'], { cwd: tmp.root, env });
      expect(first.exitCode).toBe(0);
      expect(second.exitCode).toBe(0);
      const firstData = JSON.parse(first.stdout).data;
      const secondData = JSON.parse(second.stdout).data;
      expect(firstData.worktree).not.toBe(secondData.worktree);
      expect(firstData.branch).not.toBe(secondData.branch);
    } finally {
      await tmp.cleanup();
    }
  });
});
