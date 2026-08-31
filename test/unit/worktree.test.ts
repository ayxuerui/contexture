import { describe, expect, it } from 'vitest';
import {
  addWorktree,
  deleteBranch,
  fetchOrigin,
  hasRemote,
  parseWorktreeList,
  pruneWorktrees,
  removeWorktree,
} from '../../src/core/git/worktree.js';
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

describe('addWorktree / removeWorktree / pruneWorktrees / deleteBranch — argv shape', () => {
  it('issues the expected git argv for each operation', async () => {
    const { git, calls } = fakeGitRunner();
    await addWorktree(git, '/repo', '/repo/.worktrees/x', 'session/x', 'origin/main');
    await removeWorktree(git, '/repo', '/repo/.worktrees/x');
    await removeWorktree(git, '/repo', '/repo/.worktrees/y', { force: true });
    await pruneWorktrees(git, '/repo');
    await deleteBranch(git, '/repo', 'session/x');
    await deleteBranch(git, '/repo', 'session/y', { force: true });

    expect(calls).toEqual([
      ['worktree', 'add', '-b', 'session/x', '/repo/.worktrees/x', 'origin/main'],
      ['worktree', 'remove', '/repo/.worktrees/x'],
      ['worktree', 'remove', '/repo/.worktrees/y', '--force'],
      ['worktree', 'prune'],
      ['branch', '-d', 'session/x'],
      ['branch', '-D', 'session/y'],
    ]);
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
