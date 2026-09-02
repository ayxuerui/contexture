import { describe, expect, it } from 'vitest';
import { addWorktree, fetchOrigin, hasRemote, mainWorktreePath, parseWorktreeList } from '../../src/core/git/worktree.js';
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
