import { execFile } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { DIST_BIN } from '../helpers/dist-bin.js';
import { hermeticGitEnv } from '../helpers/git-env.js';
import { runCli } from '../helpers/run-cli.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

const execFileAsync = promisify(execFile);

async function gitCommit(cwd: string, env: Record<string, string | undefined>, message: string) {
  return execFileAsync('git', ['commit', '-m', message], { cwd, env }).catch((err) => err);
}

describe('installed hooks (real dist/bin.js, real git)', () => {
  it('init installs hooks that name no path from the generating machine', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });

      const preCommit = await readFile(path.join(tmp.root, '.githooks', 'pre-commit'), 'utf8');
      expect(preCommit).not.toContain(DIST_BIN);
      expect(preCommit).toContain('command -v ctxr');

      const mode = (await stat(path.join(tmp.root, '.githooks', 'pre-commit'))).mode;
      expect(mode & 0o111).not.toBe(0);
    } finally {
      await tmp.cleanup();
    }
  });

  it('pre-push refuses a push targeting the default branch', async () => {
    const tmp = await makeTmpDir();
    const remote = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      await execFileAsync('git', ['init', '--bare'], { cwd: remote.root, env });
      await execFileAsync('git', ['remote', 'add', 'origin', remote.root], { cwd: tmp.root, env });

      const branch = (await execFileAsync('git', ['symbolic-ref', '--short', 'HEAD'], { cwd: tmp.root, env })).stdout.trim();
      const pushResult = await execFileAsync('git', ['push', 'origin', `HEAD:refs/heads/${branch}`], {
        cwd: tmp.root,
        env,
      }).catch((err) => err);

      expect(pushResult.code).not.toBe(0);
      expect(String(pushResult.stderr)).toContain('push refused');
    } finally {
      await tmp.cleanup();
      await remote.cleanup();
    }
  });

  it('pre-push allows a push to a non-default branch', async () => {
    const tmp = await makeTmpDir();
    const remote = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      await execFileAsync('git', ['init', '--bare'], { cwd: remote.root, env });
      await execFileAsync('git', ['remote', 'add', 'origin', remote.root], { cwd: tmp.root, env });
      await execFileAsync('git', ['checkout', '-b', 'session/test'], { cwd: tmp.root, env });

      await execFileAsync('git', ['push', 'origin', 'session/test'], { cwd: tmp.root, env }); // throws on failure
      const remoteBranches = await execFileAsync('git', ['ls-remote', '--heads', remote.root], { cwd: tmp.root, env });
      expect(remoteBranches.stdout).toContain('refs/heads/session/test');
    } finally {
      await tmp.cleanup();
      await remote.cleanup();
    }
  });

  it('the emergency override bypasses the pre-push block', async () => {
    const tmp = await makeTmpDir();
    const remote = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      await execFileAsync('git', ['init', '--bare'], { cwd: remote.root, env });
      await execFileAsync('git', ['remote', 'add', 'origin', remote.root], { cwd: tmp.root, env });
      const branch = (await execFileAsync('git', ['symbolic-ref', '--short', 'HEAD'], { cwd: tmp.root, env })).stdout.trim();

      await execFileAsync(
        'git',
        ['push', 'origin', `HEAD:refs/heads/${branch}`],
        { cwd: tmp.root, env: { ...env, CONTEXTURE_ALLOW_DEFAULT_BRANCH_PUSH: '1' } },
      );
      // No throw = success.
    } finally {
      await tmp.cleanup();
      await remote.cleanup();
    }
  });

  it('pre-commit refuses a commit whose staged content matches a secret pattern', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      await mkdir(path.join(tmp.root, 'projects'), { recursive: true });
      await writeFile(path.join(tmp.root, 'projects', 'secret.md'), 'AKIAABCDEFGHIJKLMNOP\n');
      await execFileAsync('git', ['add', 'projects/secret.md'], { cwd: tmp.root, env });

      const result = await gitCommit(tmp.root, env, 'test secret');
      expect(result.code).not.toBe(0);
      expect(String(result.stderr)).toContain("failed 'doctor --staged'");
    } finally {
      await tmp.cleanup();
    }
  });

  it('pre-commit refuses a commit whose staged config fails schema validation', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      await writeFile(path.join(tmp.root, 'contexture.yaml'), 'schema_version: "not a number"\n');
      await execFileAsync('git', ['add', 'contexture.yaml'], { cwd: tmp.root, env });

      const result = await gitCommit(tmp.root, env, 'break config');
      expect(result.code).not.toBe(0);
    } finally {
      await tmp.cleanup();
    }
  });

  it('pre-commit allows a clean commit through', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      await mkdir(path.join(tmp.root, 'projects'), { recursive: true });
      await writeFile(path.join(tmp.root, 'projects', 'clean.md'), '# Clean note\n\nNothing wrong here.\n');
      await execFileAsync('git', ['add', 'projects/clean.md'], { cwd: tmp.root, env });

      await execFileAsync('git', ['commit', '-m', 'add a clean note'], { cwd: tmp.root, env }); // throws on failure
      const log = await execFileAsync('git', ['log', '--oneline'], { cwd: tmp.root, env });
      expect(log.stdout.trim().split('\n')).toHaveLength(2); // init's commit + this one
    } finally {
      await tmp.cleanup();
    }
  });
});
