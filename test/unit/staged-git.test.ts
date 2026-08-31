import { describe, expect, it } from 'vitest';
import type { GitResult, GitRunner } from '../../src/core/git/exec.js';
import { getStagedFiles } from '../../src/core/git/staged.js';

function makeGit(responses: Record<string, GitResult>): GitRunner {
  return {
    async run(args) {
      const key = args.join(' ');
      return responses[key] ?? { stdout: '', stderr: '', exitCode: 0 };
    },
  };
}

describe('getStagedFiles', () => {
  it('parses an added file, with status, line counts, and fetched content', async () => {
    const git = makeGit({
      'diff --cached --name-status': { exitCode: 0, stdout: 'A\tprojects/new.md\n', stderr: '' },
      'diff --cached --numstat': { exitCode: 0, stdout: '5\t0\tprojects/new.md\n', stderr: '' },
      'show :projects/new.md': { exitCode: 0, stdout: '# New\n', stderr: '' },
    });
    const files = await getStagedFiles(git, '/repo');
    expect(files).toEqual([
      { path: 'projects/new.md', status: 'A', addedLines: 5, removedLines: 0, content: '# New\n' },
    ]);
  });

  it('does not fetch content for a deleted file', async () => {
    const git = makeGit({
      'diff --cached --name-status': { exitCode: 0, stdout: 'D\tprojects/gone.md\n', stderr: '' },
      'diff --cached --numstat': { exitCode: 0, stdout: '0\t5\tprojects/gone.md\n', stderr: '' },
    });
    const files = await getStagedFiles(git, '/repo');
    expect(files).toEqual([
      { path: 'projects/gone.md', status: 'D', addedLines: 0, removedLines: 5, content: undefined },
    ]);
  });

  it('treats a rename\'s new path as the effective path', async () => {
    const git = makeGit({
      'diff --cached --name-status': { exitCode: 0, stdout: 'R100\tprojects/old.md\tprojects/new.md\n', stderr: '' },
      'diff --cached --numstat': { exitCode: 0, stdout: '0\t0\tprojects/new.md\n', stderr: '' },
      'show :projects/new.md': { exitCode: 0, stdout: '# Renamed\n', stderr: '' },
    });
    const files = await getStagedFiles(git, '/repo');
    expect(files[0]?.path).toBe('projects/new.md');
    expect(files[0]?.status).toBe('R');
  });

  it('reports null line counts for a binary file', async () => {
    const git = makeGit({
      'diff --cached --name-status': { exitCode: 0, stdout: 'A\tassets/image.png\n', stderr: '' },
      'diff --cached --numstat': { exitCode: 0, stdout: '-\t-\tassets/image.png\n', stderr: '' },
    });
    const files = await getStagedFiles(git, '/repo');
    expect(files[0]?.addedLines).toBeNull();
    expect(files[0]?.removedLines).toBeNull();
  });

  it('returns an empty array when nothing is staged', async () => {
    const git = makeGit({});
    expect(await getStagedFiles(git, '/repo')).toEqual([]);
  });
});
