import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createExecFileGitRunner } from '../../src/core/git/exec.js';
import {
  addDetachedWorktree,
  addWorktree,
  fetchOrigin,
  hasRemote,
  listWorktrees,
  mainWorktreePath,
  parseWorktreeList,
  pruneWorktrees,
  removeWorktree,
  resolveHead,
} from '../../src/core/git/worktree.js';
import { makeTmpDir } from '../helpers/tmp-store.js';
import { fakeGitRunner } from '../helpers/fake-env.js';

describe('hasRemote', () => {
  it('returns true when the named remote is listed', async () => {
    const { git } = fakeGitRunner(new Map([['remote', { exitCode: 0, stdout: 'origin\nupstream\n', stderr: '' }]]));
    expect(await hasRemote(git, '/repo')).toBe(true);
  });

  it('returns false when no remotes exist', async () => {
    const { git } = fakeGitRunner(new Map([['remote', { exitCode: 0, stdout: '', stderr: '' }]]));
    expect(await hasRemote(git, '/repo')).toBe(false);
  });
});

describe('fetchOrigin', () => {
  it('returns true on a successful fetch', async () => {
    const { git } = fakeGitRunner(new Map([['fetch origin main', { exitCode: 0, stdout: '', stderr: '' }]]));
    expect(await fetchOrigin(git, '/repo', 'main')).toBe(true);
  });

  it('returns false (does not throw) when the fetch fails — e.g. an empty remote', async () => {
    const { git } = fakeGitRunner(
      new Map([['fetch origin main', { exitCode: 128, stdout: '', stderr: "couldn't find remote ref main" }]]),
    );
    expect(await fetchOrigin(git, '/repo', 'main')).toBe(false);
  });
});

describe('addWorktree — argv shape', () => {
  it('issues the expected git argv', async () => {
    const { git, calls } = fakeGitRunner();
    await addWorktree(git, '/repo', '/repo/.worktrees/x', 'session/x', 'origin/main');

    expect(calls).toEqual([['worktree', 'add', '-b', 'session/x', '/repo/.worktrees/x', 'origin/main']]);
  });
});

describe('parseWorktreeList', () => {
  it('parses a single worktree block with a branch', () => {
    const porcelain = 'worktree /repo\nHEAD abc123\nbranch refs/heads/main\n';
    expect(parseWorktreeList(porcelain)).toEqual([{ path: '/repo', branch: 'main', head: 'abc123', locked: false }]);
  });

  it('parses multiple blocks separated by blank lines', () => {
    const porcelain = [
      'worktree /repo',
      'HEAD abc123',
      'branch refs/heads/main',
      '',
      'worktree /repo/.worktrees/session-x',
      'HEAD def456',
      'branch refs/heads/session/x',
      '',
    ].join('\n');
    const result = parseWorktreeList(porcelain);
    expect(result).toHaveLength(2);
    expect(result[1]).toEqual({
      path: '/repo/.worktrees/session-x',
      branch: 'session/x',
      head: 'def456',
      locked: false,
    });
  });

  it('reports a detached worktree with branch: null', () => {
    const porcelain = 'worktree /repo/.worktrees/detached\nHEAD abc123\ndetached\n';
    expect(parseWorktreeList(porcelain)).toEqual([
      { path: '/repo/.worktrees/detached', branch: null, head: 'abc123', locked: false },
    ]);
  });

  it('reports a locked worktree', () => {
    const porcelain = 'worktree /repo/.worktrees/x\nHEAD abc123\nbranch refs/heads/session/x\nlocked\n';
    const result = parseWorktreeList(porcelain);
    expect(result[0]?.locked).toBe(true);
  });

  it('returns an empty array for empty input', () => {
    expect(parseWorktreeList('')).toEqual([]);
  });
});

describe('mainWorktreePath', () => {
  it('returns the first-listed worktree, regardless of which one the command was invoked from', async () => {
    const porcelain = [
      'worktree /repo',
      'HEAD abc123',
      'branch refs/heads/main',
      '',
      'worktree /repo/.worktrees/session-x',
      'HEAD def456',
      'branch refs/heads/session/x',
      '',
    ].join('\n');
    const { git } = fakeGitRunner(new Map([['worktree list --porcelain', { exitCode: 0, stdout: porcelain, stderr: '' }]]));
    expect(await mainWorktreePath(git, '/repo/.worktrees/session-x')).toBe('/repo');
  });

  it('falls back to the passed cwd when there are no linked worktrees', async () => {
    const { git } = fakeGitRunner(new Map([['worktree list --porcelain', { exitCode: 0, stdout: '', stderr: '' }]]));
    expect(await mainWorktreePath(git, '/repo')).toBe('/repo');
  });
});

/**
 * isolate-the-portability-test (task 1.4): these three are what the isolated
 * run stands on, so they are exercised against a real repository rather than
 * an argv-shape fake — the property under test is what git actually does with
 * a detached checkout, not the flags we pass it.
 */
describe('detached worktree helpers, against a real repository', () => {
  async function makeRepo() {
    const tmp = await makeTmpDir();
    const git = createExecFileGitRunner();
    await git.run(['init'], { cwd: tmp.root });
    await git.run(['config', 'user.email', 'test@example.com'], { cwd: tmp.root });
    await git.run(['config', 'user.name', 'Test'], { cwd: tmp.root });
    return { tmp, git };
  }

  async function commitFile(git: ReturnType<typeof createExecFileGitRunner>, root: string, name: string, body: string) {
    await writeFile(path.join(root, name), body);
    await git.run(['add', name], { cwd: root });
    await git.run(['commit', '-m', `add ${name}`], { cwd: root });
    return (await resolveHead(git, root))!;
  }

  it('resolveHead returns null on an unborn HEAD, and the sha once there is a commit', async () => {
    const { tmp, git } = await makeRepo();
    try {
      expect(await resolveHead(git, tmp.root)).toBeNull();
      const sha = await commitFile(git, tmp.root, 'a.md', '# A\n');
      expect(sha).toMatch(/^[0-9a-f]{40}$/);
    } finally {
      await tmp.cleanup();
    }
  });

  it('addDetachedWorktree checks out the named commit, with no branch attached', async () => {
    const { tmp, git } = await makeRepo();
    try {
      const first = await commitFile(git, tmp.root, 'a.md', 'first\n');
      await commitFile(git, tmp.root, 'a.md', 'second\n');

      const checkout = path.join(tmp.root, 'disposable');
      await addDetachedWorktree(git, tmp.root, checkout, first);

      // The content is the OLD commit's, not the working tree's — the property D2 rests on.
      expect(await readFile(path.join(checkout, 'a.md'), 'utf8')).toBe('first\n');
      const listed = (await listWorktrees(git, tmp.root)).find((w) => w.path === checkout);
      expect(listed?.head).toBe(first);
      expect(listed?.branch).toBeNull();
    } finally {
      await tmp.cleanup();
    }
  });

  it('removeWorktree reclaims the checkout, leaving the repository with only its main worktree', async () => {
    const { tmp, git } = await makeRepo();
    try {
      const sha = await commitFile(git, tmp.root, 'a.md', '# A\n');
      const checkout = path.join(tmp.root, 'disposable');
      await addDetachedWorktree(git, tmp.root, checkout, sha);
      expect(await listWorktrees(git, tmp.root)).toHaveLength(2);

      // Dirty it first: a verify run writes derived artifacts into the checkout,
      // so removal has to succeed against a modified tree.
      await writeFile(path.join(checkout, 'a.md'), 'modified\n');
      await removeWorktree(git, tmp.root, checkout);
      await pruneWorktrees(git, tmp.root);

      expect(await listWorktrees(git, tmp.root)).toHaveLength(1);
      expect(existsSync(checkout)).toBe(false);
    } finally {
      await tmp.cleanup();
    }
  });
});
