import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import type { MigrationStep } from '../../src/config/migrations.js';
import { SUPPORTED_SCHEMA_VERSION } from '../../src/config/schema.js';
import { createExecFileGitRunner } from '../../src/core/git/exec.js';
import { ExitCode } from '../../src/core/exit-codes.js';
import { run } from '../../src/run.js';
import { CLI_VERSION } from '../../src/version.js';
import { makeFakeEnv, readAll } from '../helpers/fake-env.js';
import { hermeticGitEnv } from '../helpers/git-env.js';
import { runCli } from '../helpers/run-cli.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

const execFileAsync = promisify(execFile);
const BRANCH = `session/ctxr-update-${CLI_VERSION}`;
const SKILL = '.agents/skills/ctxr-placement/SKILL.md';

async function git(cwd: string, env: Record<string, string | undefined>, ...args: string[]): Promise<string> {
  return (await execFileAsync('git', args, { cwd, env })).stdout;
}

/**
 * A store with a bare remote, fully current and pushed: `init` (whose
 * bootstrap commit already carries the adapter outputs), then a push to
 * origin. Commits elsewhere skip the hook — this is setup, and the hook's own
 * behavior is tested elsewhere.
 */
async function pushedStore(): Promise<{ root: string; remote: string; env: Record<string, string | undefined>; cleanup: () => Promise<void> }> {
  const tmp = await makeTmpDir();
  const env = hermeticGitEnv();
  const root = path.join(tmp.root, 'store');
  const remote = path.join(tmp.root, 'remote.git');
  await execFileAsync('mkdir', ['-p', root]);
  await git(tmp.root, env, 'init', '--bare', remote);
  await runCli(['init'], { cwd: root, env });
  const branch = (await git(root, env, 'symbolic-ref', '--short', 'HEAD')).trim();
  await git(root, env, 'remote', 'add', 'origin', remote);
  await git(root, env, 'push', '-q', '--no-verify', 'origin', branch);
  return { root, remote, env, cleanup: tmp.cleanup };
}

async function commitAll(root: string, env: Record<string, string | undefined>, message: string): Promise<void> {
  await git(root, env, 'add', '-A');
  await git(root, env, 'commit', '-q', '--no-verify', '-m', message);
}

async function pushHead(root: string, env: Record<string, string | undefined>): Promise<void> {
  const branch = (await git(root, env, 'symbolic-ref', '--short', 'HEAD')).trim();
  await git(root, env, 'push', '-q', '--no-verify', 'origin', branch);
}

async function branchExists(root: string, env: Record<string, string | undefined>, branch: string): Promise<boolean> {
  return execFileAsync('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], { cwd: root, env }).then(
    () => true,
    () => false,
  );
}

describe('ctxr update --worktree (real git, bare remote)', () => {
  it('lands a due update on its own branch, uncommitted, and leaves the invoking checkout alone', async () => {
    const { root, env, cleanup } = await pushedStore();
    try {
      // Drift an owned skill copy on the default branch, the way an older release would have left it.
      await writeFile(path.join(root, SKILL), 'stale copy from an older contexture\n');
      await commitAll(root, env, 'older skill copy');
      await pushHead(root, env);
      const rootSkillBefore = await readFile(path.join(root, SKILL), 'utf8');
      const headBefore = (await git(root, env, 'rev-parse', 'HEAD')).trim();

      const result = await runCli(['update', '--worktree', '--json'], { cwd: root, env });
      expect(result.exitCode).toBe(ExitCode.Ok);
      const data = JSON.parse(result.stdout).data;
      expect(data.branch).toBe(BRANCH);
      expect(data.existing).toBe(false);
      expect(data.changed).toContain(SKILL);
      expect(data.worktree).toContain('.worktrees');

      // The worktree carries the re-render, uncommitted, on top of the fetched default branch.
      expect(await readFile(path.join(data.worktree, SKILL), 'utf8')).not.toBe(rootSkillBefore);
      expect((await git(data.worktree, env, 'status', '--porcelain')).trim()).not.toBe('');
      expect((await git(data.worktree, env, 'rev-parse', 'HEAD')).trim()).toBe(headBefore);

      // The invoking checkout: same commit, same bytes, nothing tracked changed.
      expect((await git(root, env, 'rev-parse', 'HEAD')).trim()).toBe(headBefore);
      expect(await readFile(path.join(root, SKILL), 'utf8')).toBe(rootSkillBefore);
      expect((await git(root, env, 'status', '--porcelain')).trim()).toBe('');

      // design D3: it is recognizable as a session, so the lifecycle skill can submit and reclaim it.
      const list = await runCli(['session', 'list', '--json'], { cwd: root, env });
      expect(list.exitCode).toBe(ExitCode.Ok);
      expect(JSON.stringify(JSON.parse(list.stdout).data)).toContain(BRANCH);
    } finally {
      await cleanup();
    }
  });

  it('leaves nothing behind when nothing is due', async () => {
    const { root, env, cleanup } = await pushedStore();
    try {
      const result = await runCli(['update', '--worktree', '--json'], { cwd: root, env });
      expect(result.exitCode).toBe(ExitCode.Ok);
      const parsed = JSON.parse(result.stdout);
      expect(parsed.data).toMatchObject({ changed: [], worktree: null, branch: BRANCH, existing: false });
      expect(await branchExists(root, env, BRANCH)).toBe(false);
      expect(existsSync(path.join(root, '.worktrees', BRANCH.replace(/\//g, '-')))).toBe(false);
      expect((await git(root, env, 'worktree', 'list')).trim().split('\n')).toHaveLength(1);
    } finally {
      await cleanup();
    }
  });

  it('does nothing when the branch already exists locally', async () => {
    const { root, env, cleanup } = await pushedStore();
    try {
      await writeFile(path.join(root, SKILL), 'stale copy from an older contexture\n');
      await commitAll(root, env, 'older skill copy');
      await git(root, env, 'branch', BRANCH);

      const result = await runCli(['update', '--worktree', '--json'], { cwd: root, env });
      expect(result.exitCode).toBe(ExitCode.Ok);
      expect(JSON.parse(result.stdout).data).toMatchObject({ changed: [], worktree: null, branch: BRANCH, existing: true });
      expect((await git(root, env, 'worktree', 'list')).trim().split('\n')).toHaveLength(1);
    } finally {
      await cleanup();
    }
  });

  it('does nothing when the branch exists only on the remote', async () => {
    const { root, env, cleanup } = await pushedStore();
    try {
      await writeFile(path.join(root, SKILL), 'stale copy from an older contexture\n');
      await commitAll(root, env, 'older skill copy');
      await git(root, env, 'push', '-q', '--no-verify', 'origin', `HEAD:refs/heads/${BRANCH}`);
      expect(await branchExists(root, env, BRANCH)).toBe(false);

      const result = await runCli(['update', '--worktree', '--json'], { cwd: root, env });
      expect(result.exitCode).toBe(ExitCode.Ok);
      expect(JSON.parse(result.stdout).data).toMatchObject({ existing: true, worktree: null });
      expect(await branchExists(root, env, BRANCH)).toBe(false);
    } finally {
      await cleanup();
    }
  });

  /**
   * The case the option exists for: a store the gate refuses (case B). No real migration step
   * exists yet, so this runs in-process with a test ladder through RunEnv's `migrationSteps`.
   */
  it('brings a store refused at load forward in the worktree, and only there', async () => {
    const { root, env, cleanup } = await pushedStore();
    try {
      const v = SUPPORTED_SCHEMA_VERSION;
      const configPath = path.join(root, 'contexture.yaml');
      const older = (await readFile(configPath, 'utf8')).replace(`schema_version: ${v}`, `schema_version: ${v - 1}`);
      await writeFile(configPath, older);
      await commitAll(root, env, 'store recorded one schema version ago');
      await pushHead(root, env);

      // An ordinary command is refused, naming update as the way forward.
      const refused = await runCli(['doctor', '--json'], { cwd: root, env });
      expect(refused.exitCode).toBe(ExitCode.Usage);
      expect(JSON.parse(refused.stdout).findings[0].code).toBe('config.schema_version.behind');

      const ladder: MigrationStep[] = [{ from: v - 1, retires: [], apply: () => undefined }];
      const fake = makeFakeEnv({ cwd: root, env, git: createExecFileGitRunner(), migrationSteps: ladder });
      const exitCode = await run(['update', '--worktree', '--json'], fake);
      expect(exitCode).toBe(ExitCode.Ok);
      const data = JSON.parse(readAll(fake.io.stdout as never)).data;
      expect(data.migrated).toEqual({ from: v - 1, to: v });
      expect(data.changed).toContain('contexture.yaml');
      expect(data.branch).toBe(BRANCH);

      expect(await readFile(path.join(data.worktree, 'contexture.yaml'), 'utf8')).toContain(`schema_version: ${v}`);
      expect(await readFile(configPath, 'utf8')).toBe(older);
      expect((await git(root, env, 'status', '--porcelain')).trim()).toBe('');
    } finally {
      await cleanup();
    }
  });
});
