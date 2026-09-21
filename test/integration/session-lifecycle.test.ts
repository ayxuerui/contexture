import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
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

  it('a label names the branch and the worktree directory', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      const result = await runCli(['session', 'start', 'Ctx A', '--json'], { cwd: tmp.root, env });
      expect(result.exitCode).toBe(0);
      const data = JSON.parse(result.stdout).data;
      expect(data.label).toBe('ctx-a');
      expect(data.branch).toMatch(/^session\/\d{8}-\d{6}-ctx-a$/);
      expect(data.worktree.endsWith('-ctx-a')).toBe(true);

      const list = await execFileAsync('git', ['worktree', 'list'], { cwd: tmp.root, env });
      expect(list.stdout).toContain(data.worktree);
    } finally {
      await tmp.cleanup();
    }
  });

  it('an unlabelled session reports no label and still gets a unique name', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      const result = await runCli(['session', 'start', '--json'], { cwd: tmp.root, env });
      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout).data.label).toBeNull();
    } finally {
      await tmp.cleanup();
    }
  });

  it('a label that is already taken is refused, and nothing is created', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      const first = await runCli(['session', 'start', 'ctx-a', '--json'], { cwd: tmp.root, env });
      expect(first.exitCode).toBe(0);
      const firstWorktree = JSON.parse(first.stdout).data.worktree;

      const before = await execFileAsync('git', ['worktree', 'list'], { cwd: tmp.root, env });
      const second = await runCli(['session', 'start', 'Ctx A', '--json'], { cwd: tmp.root, env });
      expect(second.exitCode).toBe(2);
      const envelope = JSON.parse(second.stdout);
      expect(envelope.status).toBe('error');
      expect(envelope.findings[0].code).toBe('session.name_exists');
      expect(envelope.findings[0].details.worktree).toBe(firstWorktree);

      const after = await execFileAsync('git', ['worktree', 'list'], { cwd: tmp.root, env });
      expect(after.stdout).toBe(before.stdout);
    } finally {
      await tmp.cleanup();
    }
  });

  it('a label that normalizes to nothing is refused rather than dropped', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      const before = await execFileAsync('git', ['worktree', 'list'], { cwd: tmp.root, env });
      const result = await runCli(['session', 'start', '...', '--json'], { cwd: tmp.root, env });
      expect(result.exitCode).toBe(2);
      expect(JSON.parse(result.stdout).findings[0].code).toBe('session.label_unusable');

      const after = await execFileAsync('git', ['worktree', 'list'], { cwd: tmp.root, env });
      expect(after.stdout).toBe(before.stdout);
    } finally {
      await tmp.cleanup();
    }
  });

  it('a label is free again once the session holding it is gone', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      const first = await runCli(['session', 'start', 'ctx-a', '--json'], { cwd: tmp.root, env });
      const worktree = JSON.parse(first.stdout).data.worktree;
      await execFileAsync('git', ['worktree', 'remove', '--force', worktree], { cwd: tmp.root, env });

      const second = await runCli(['session', 'start', 'ctx-a', '--json'], { cwd: tmp.root, env });
      expect(second.exitCode).toBe(0);
      expect(JSON.parse(second.stdout).data.label).toBe('ctx-a');
    } finally {
      await tmp.cleanup();
    }
  });

  it('a git refusal is a usage error, not an internal error', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });

      // A branch prefix git will not accept as a ref name: the label scan knows
      // nothing about it, so git's own refusal is what has to be reported (D7).
      const configPath = path.join(tmp.root, 'contexture.yaml');
      const config = await readFile(configPath, 'utf8');
      await writeFile(configPath, `${config}\nsession:\n  branch_prefix: bad..prefix/\n`, 'utf8');

      const result = await runCli(['session', 'start', '--json'], { cwd: tmp.root, env });
      expect(result.exitCode).toBe(2);
      const finding = JSON.parse(result.stdout).findings[0];
      expect(finding.code).toBe('session.worktree_refused');
      expect(finding.details.git_stderr.length).toBeGreaterThan(0);
    } finally {
      await tmp.cleanup();
    }
  });
});
