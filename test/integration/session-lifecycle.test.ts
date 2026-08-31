import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { hermeticGitEnv } from '../helpers/git-env.js';
import { runCli } from '../helpers/run-cli.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

const execFileAsync = promisify(execFile);

async function addRemote(storeRoot: string, env: Record<string, string | undefined>): Promise<string> {
  const remote = await makeTmpDir();
  await execFileAsync('git', ['init', '--bare'], { cwd: remote.root, env });
  await execFileAsync('git', ['remote', 'add', 'origin', remote.root], { cwd: storeRoot, env });
  return remote.root;
}

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

  it('session submit on a valid change pushes and reports the manual-PR fallback with no forge configured', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      await addRemote(tmp.root, env);

      const start = JSON.parse((await runCli(['session', 'start', '--json'], { cwd: tmp.root, env })).stdout);
      const worktree: string = start.data.worktree;
      const branch: string = start.data.branch;

      await mkdir(path.join(worktree, 'projects'), { recursive: true });
      await writeFile(path.join(worktree, 'projects', 'new.md'), '---\nlens: private\n---\n# New note\n');
      // Full validation includes catalog coverage and the fail-closed
      // visibility invariant, so a realistic session gives the note an
      // explicit visibility and updates the catalog before submitting —
      // same as it would commit any other consequence of its change.
      await runCli(['catalog', 'build'], { cwd: worktree, env });
      await execFileAsync('git', ['add', '.'], { cwd: worktree, env });

      const submit = await runCli(['session', 'submit', '--json'], { cwd: worktree, env });
      expect(submit.exitCode).toBe(0);
      const submitData = JSON.parse(submit.stdout).data;
      expect(submitData.pushed).toBe(true);
      expect(submitData.pr).toBeNull();
      expect(submitData.manualPrInstructions).toContain(branch);

      const remoteBranches = await execFileAsync('git', ['ls-remote', '--heads', 'origin'], { cwd: tmp.root, env });
      expect(remoteBranches.stdout).toContain(`refs/heads/${branch}`);
    } finally {
      await tmp.cleanup();
    }
  });

  it('session submit --branch renames before pushing, and session list still recognizes the worktree (session-submit-and-land)', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      await addRemote(tmp.root, env);

      const start = JSON.parse((await runCli(['session', 'start', '--json'], { cwd: tmp.root, env })).stdout);
      const worktree: string = start.data.worktree;
      const generatedBranch: string = start.data.branch;

      await mkdir(path.join(worktree, 'projects'), { recursive: true });
      await writeFile(path.join(worktree, 'projects', 'new.md'), '---\nlens: private\n---\n# New note\n');
      await runCli(['catalog', 'build'], { cwd: worktree, env });
      await execFileAsync('git', ['add', '.'], { cwd: worktree, env });

      const submit = await runCli(['session', 'submit', '--branch', 'topic/x', '--json'], { cwd: worktree, env });
      expect(submit.exitCode).toBe(0);
      const submitData = JSON.parse(submit.stdout).data;
      expect(submitData.branch).toBe('topic/x');
      expect(submitData.manualPrInstructions).toContain('topic/x');

      const remoteBranches = await execFileAsync('git', ['ls-remote', '--heads', 'origin'], { cwd: tmp.root, env });
      expect(remoteBranches.stdout).toContain('refs/heads/topic/x');
      expect(remoteBranches.stdout).not.toContain(`refs/heads/${generatedBranch}`);

      const list = JSON.parse((await runCli(['session', 'list', '--json'], { cwd: tmp.root, env })).stdout);
      expect(list.data.sessions.map((s: { branch: string; worktree: string }) => s.branch)).toContain('topic/x');
      expect(list.data.sessions.map((s: { worktree: string }) => s.worktree)).toContain(worktree);
    } finally {
      await tmp.cleanup();
    }
  });

  it('session submit refuses when full validation fails', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      await addRemote(tmp.root, env);
      const start = JSON.parse((await runCli(['session', 'start', '--json'], { cwd: tmp.root, env })).stdout);
      const worktree: string = start.data.worktree;

      // Break the store: stage a schema-invalid contexture.yaml.
      await writeFile(path.join(worktree, 'contexture.yaml'), 'schema_version: "nope"\n');
      await execFileAsync('git', ['add', 'contexture.yaml'], { cwd: worktree, env }).catch(() => undefined);
      // Bypass the pre-commit hook deliberately, to reach session submit's own validation.
      await execFileAsync('git', ['commit', '--no-verify', '-m', 'break config'], { cwd: worktree, env });

      const submit = await runCli(['session', 'submit', '--json'], { cwd: worktree, env });
      expect(submit.exitCode).not.toBe(0);
    } finally {
      await tmp.cleanup();
    }
  });

  it('session abandon removes the worktree and deletes the branch', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      const start = JSON.parse((await runCli(['session', 'start', '--json'], { cwd: tmp.root, env })).stdout);

      const abandon = await runCli(['session', 'abandon', start.data.branch, '--json'], { cwd: tmp.root, env });
      expect(abandon.exitCode).toBe(0);

      const list = JSON.parse((await runCli(['session', 'list', '--json'], { cwd: tmp.root, env })).stdout);
      expect(list.data.sessions).toEqual([]);
    } finally {
      await tmp.cleanup();
    }
  });

  it('session reap reclaims a merged, clean session but skips an unmerged one', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });

      const mergedStart = JSON.parse((await runCli(['session', 'start', '--json'], { cwd: tmp.root, env })).stdout);
      const mergedWt: string = mergedStart.data.worktree;
      await mkdir(path.join(mergedWt, 'projects'), { recursive: true });
      await writeFile(path.join(mergedWt, 'projects', 'merged.md'), '# Merged\n');
      await execFileAsync('git', ['add', '.'], { cwd: mergedWt, env });
      await execFileAsync('git', ['commit', '-m', 'add merged'], { cwd: mergedWt, env });
      await execFileAsync('git', ['merge', '--no-ff', mergedStart.data.branch, '-m', 'merge it'], { cwd: tmp.root, env });

      const unmergedStart = JSON.parse((await runCli(['session', 'start', '--json'], { cwd: tmp.root, env })).stdout);
      const unmergedWt: string = unmergedStart.data.worktree;
      await mkdir(path.join(unmergedWt, 'projects'), { recursive: true });
      await writeFile(path.join(unmergedWt, 'projects', 'unmerged.md'), '# Unmerged\n');
      await execFileAsync('git', ['add', '.'], { cwd: unmergedWt, env });
      await execFileAsync('git', ['commit', '-m', 'add unmerged'], { cwd: unmergedWt, env });

      const reap = await runCli(['session', 'reap', '--json'], { cwd: tmp.root, env });
      expect(reap.exitCode).toBe(0);
      const reapData = JSON.parse(reap.stdout).data;
      expect(reapData.reaped.map((r: { branch: string }) => r.branch)).toContain(mergedStart.data.branch);
      expect(reapData.skipped.map((r: { branch: string }) => r.branch)).toContain(unmergedStart.data.branch);

      const list = JSON.parse((await runCli(['session', 'list', '--json'], { cwd: tmp.root, env })).stdout);
      expect(list.data.sessions).toHaveLength(1);
      expect(list.data.sessions[0].branch).toBe(unmergedStart.data.branch);
    } finally {
      await tmp.cleanup();
    }
  });
});
