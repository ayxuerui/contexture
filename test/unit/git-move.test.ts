import { describe, expect, it } from 'vitest';
import { movePath } from '../../src/core/git/repo.js';
import { fakeGitRunner } from '../helpers/fake-env.js';

describe('movePath', () => {
  it('issues exactly `git mv <from> <to>`, a single tracked rename', async () => {
    const { git, calls } = fakeGitRunner();
    await movePath(git, '/repo', 'projects/old.md', 'archives/projects/old.md');
    expect(calls).toEqual([['mv', 'projects/old.md', 'archives/projects/old.md']]);
  });
});
