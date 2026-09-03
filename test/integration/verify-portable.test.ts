import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { resolveOnPath } from '../../src/core/environment/probe.js';
import { hermeticGitEnv } from '../helpers/git-env.js';
import { runCli } from '../helpers/run-cli.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

const execFileAsync = promisify(execFile);

async function git(root: string, args: string[], env: NodeJS.ProcessEnv): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd: root, env });
  return stdout;
}

/** An initialized store whose scaffold is committed, so there is a recorded commit to verify. */
async function committedStore(root: string, env: NodeJS.ProcessEnv): Promise<string> {
  await runCli(['init'], { cwd: root, env });
  await git(root, ['add', '-A'], env);
  // init commits its own scaffold; this catches anything it left unstaged.
  await execFileAsync('git', ['commit', '-m', 'store', '--allow-empty'], { cwd: root, env });
  return (await git(root, ['rev-parse', 'HEAD'], env)).trim();
}

async function worktreeCount(root: string, env: NodeJS.ProcessEnv): Promise<number> {
  const out = await git(root, ['worktree', 'list', '--porcelain'], env);
  return out.split('\n').filter((l) => l.startsWith('worktree ')).length;
}

describe('ctxr verify --portable (real CLI)', () => {
  it('verifies the recorded commit, names it, and leaves no worktree behind', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      const head = await committedStore(tmp.root, env);

      const result = await runCli(['verify', '--portable', '--json'], { cwd: tmp.root, env });
      const parsed = JSON.parse(result.stdout);
      expect(parsed.data.commit).toBe(head);
      expect(parsed.data.steps.length).toBeGreaterThan(0);

      // Every operation the store itself owns must pass. The prerequisite step
      // is the one honest exception: it reports the MACHINE's state, so
      // asserting it unconditionally would make this test fail on a developer
      // box without `gh` for a reason that has nothing to do with the store.
      const storeSteps = parsed.data.steps.filter((s: { operation: string }) => !s.operation.startsWith('write-path prerequisite'));
      expect(storeSteps.every((s: { status: string }) => s.status !== 'fail')).toBe(true);
      const hasGh = (await resolveOnPath('gh', process.env)) !== null;
      expect(result.exitCode).toBe(hasGh ? 0 : 3);

      expect(await worktreeCount(tmp.root, env)).toBe(1);
    } finally {
      await tmp.cleanup();
    }
  });

  it('reclaims the disposable checkout even when an operation fails', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      // Commit a store whose managed AGENTS.md section has been removed, so the
      // failure is in the COMMIT — which is what --portable reads.
      const agentsMd = path.join(tmp.root, 'AGENTS.md');
      const stripped = (await readFile(agentsMd, 'utf8')).replace(
        /<!-- >>> contexture:placement.*?<!-- <<< contexture:placement <<< -->\n?/s,
        '',
      );
      await writeFile(agentsMd, stripped);
      await git(tmp.root, ['add', '-A'], env);
      await execFileAsync('git', ['commit', '-m', 'break it'], { cwd: tmp.root, env });

      const result = await runCli(['verify', '--portable', '--json'], { cwd: tmp.root, env });
      expect(result.exitCode).not.toBe(0);
      const parsed = JSON.parse(result.stdout);
      expect(parsed.data.steps.at(-1).status).toBe('fail');

      // Cleanup has to survive a failing child, not just a passing one.
      expect(await worktreeCount(tmp.root, env)).toBe(1);
    } finally {
      await tmp.cleanup();
    }
  });

  it('refuses an unborn HEAD, creating no checkout', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init', '--no-input'], { cwd: tmp.root, env });
      // Reset to an unborn HEAD: the store exists, the repository has no commit.
      await git(tmp.root, ['update-ref', '-d', 'HEAD'], env);

      const result = await runCli(['verify', '--portable', '--json'], { cwd: tmp.root, env });
      expect(result.exitCode).toBe(2);
      expect(JSON.parse(result.stdout).findings[0].code).toBe('verify.no_commit');
      expect(await worktreeCount(tmp.root, env)).toBe(1);
    } finally {
      await tmp.cleanup();
    }
  });

  /** D2, demonstrated as a pair: the flag exists to separate these two answers. */
  it('ignores an uncommitted break that bare verify reports', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      const head = await committedStore(tmp.root, env);

      const agentsMd = path.join(tmp.root, 'AGENTS.md');
      const stripped = (await readFile(agentsMd, 'utf8')).replace(
        /<!-- >>> contexture:placement.*?<!-- <<< contexture:placement <<< -->\n?/s,
        '',
      );
      await writeFile(agentsMd, stripped);

      const bare = await runCli(['verify', '--json'], { cwd: tmp.root, env });
      expect(bare.exitCode).not.toBe(0);

      const portable = await runCli(['verify', '--portable', '--json'], { cwd: tmp.root, env });
      const parsed = JSON.parse(portable.stdout);
      expect(parsed.data.commit).toBe(head);
      // The break is uncommitted, so no store operation may report it.
      const broken = parsed.data.steps.find(
        (s: { operation: string; status: string }) => s.status === 'fail' && !s.operation.startsWith('write-path prerequisite'),
      );
      expect(broken).toBeUndefined();
    } finally {
      await tmp.cleanup();
    }
  });

  it('works when launched from inside a linked worktree', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await committedStore(tmp.root, env);
      const linked = path.join(tmp.root, '.worktrees', 'session');
      await mkdir(path.dirname(linked), { recursive: true });
      await git(tmp.root, ['worktree', 'add', '-b', 'session/x', linked, 'HEAD'], env);

      const result = await runCli(['verify', '--portable', '--json'], { cwd: linked, env });
      const steps = JSON.parse(result.stdout).data.steps as { operation: string; status: string }[];
      expect(steps.filter((s) => !s.operation.startsWith('write-path prerequisite')).every((s) => s.status !== 'fail')).toBe(true);

      // The disposable checkout registered against the MAIN repo and was
      // reclaimed: only the main worktree and the linked session remain.
      expect(await worktreeCount(tmp.root, env)).toBe(2);
    } finally {
      await tmp.cleanup();
    }
  });
});
