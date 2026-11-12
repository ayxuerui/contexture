import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { createExecFileGitRunner, type GitResult, type GitRunner } from '../../src/core/git/exec.js';
import { getStagedFiles } from '../../src/core/git/staged.js';
import { hermeticGitEnv } from '../helpers/git-env.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

function makeGit(responses: Record<string, GitResult>): GitRunner {
  return {
    async run(args) {
      const key = args.join(' ');
      return responses[key] ?? { stdout: '', stderr: '', exitCode: 0 };
    },
  };
}

const STATUS = 'diff --cached --name-status -z';
const NUMSTAT = 'diff --cached --numstat -z';
const ok = (stdout: string): GitResult => ({ exitCode: 0, stdout, stderr: '' });

describe('getStagedFiles', () => {
  it('parses an added file, with status, line counts, and fetched content', async () => {
    const git = makeGit({
      [STATUS]: ok('A\0projects/new.md\0'),
      [NUMSTAT]: ok('5\t0\tprojects/new.md\0'),
      'show :projects/new.md': ok('# New\n'),
    });
    const files = await getStagedFiles(git, '/repo');
    expect(files).toEqual([{ path: 'projects/new.md', status: 'A', addedLines: 5, removedLines: 0, content: '# New\n' }]);
  });

  it('does not fetch content for a deleted file', async () => {
    const git = makeGit({
      [STATUS]: ok('D\0projects/gone.md\0'),
      [NUMSTAT]: ok('0\t5\tprojects/gone.md\0'),
    });
    const files = await getStagedFiles(git, '/repo');
    expect(files).toEqual([{ path: 'projects/gone.md', status: 'D', addedLines: 0, removedLines: 5, content: undefined }]);
  });

  it("treats a rename's new path as the effective path and keeps its score", async () => {
    const git = makeGit({
      [STATUS]: ok('R100\0projects/old.md\0projects/new.md\0'),
      [NUMSTAT]: ok('0\t0\t\0projects/old.md\0projects/new.md\0'),
      'show :projects/new.md': ok('# Renamed\n'),
    });
    const files = await getStagedFiles(git, '/repo');
    expect(files[0]?.path).toBe('projects/new.md');
    expect(files[0]?.status).toBe('R');
    expect(files[0]?.renameScore).toBe(100);
  });

  it('keeps a lower rename score, and none for other statuses', async () => {
    const git = makeGit({
      [STATUS]: ok('R087\0a/old.pdf\0b/new.pdf\0M\0notes/n.md\0'),
      [NUMSTAT]: ok('-\t-\t\0a/old.pdf\0b/new.pdf\0' + '1\t0\tnotes/n.md\0'),
    });
    const files = await getStagedFiles(git, '/repo');
    expect(files.map((f) => [f.path, f.status, f.renameScore])).toEqual([
      ['b/new.pdf', 'R', 87],
      ['notes/n.md', 'M', undefined],
    ]);
  });

  it('reports null line counts for a binary file', async () => {
    const git = makeGit({
      [STATUS]: ok('A\0assets/image.png\0'),
      [NUMSTAT]: ok('-\t-\tassets/image.png\0'),
    });
    const files = await getStagedFiles(git, '/repo');
    expect(files[0]?.addedLines).toBeNull();
    expect(files[0]?.removedLines).toBeNull();
  });

  it('returns an empty array when nothing is staged', async () => {
    const git = makeGit({});
    expect(await getStagedFiles(git, '/repo')).toEqual([]);
  });

  // The fakes above are what real git prints with `-z`; this holds them to it. Without `-z`, `--numstat`
  // prints a rename as "p/{a => b}/f.pdf", which is how renames once reached the checks with no usable path.
  it('reads a real rename, a modification and an addition from git itself', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      const git = (args: string[]) => promisify(execFile)('git', args, { cwd: tmp.root, env: env as NodeJS.ProcessEnv });
      await git(['init', '-q']);
      await mkdir(path.join(tmp.root, 'p/a'), { recursive: true });
      await writeFile(path.join(tmp.root, 'p/a/f.pdf'), 'x'.repeat(300));
      await writeFile(path.join(tmp.root, 'n.md'), 'line\n'.repeat(20));
      await git(['add', '-A']);
      await git(['commit', '-q', '--no-verify', '-m', 'init']);
      await mkdir(path.join(tmp.root, 'p/b'), { recursive: true });
      await git(['mv', 'p/a/f.pdf', 'p/b/f.pdf']);
      await writeFile(path.join(tmp.root, 'n.md'), 'line\n'.repeat(21));
      await writeFile(path.join(tmp.root, 'z.md'), 'new\n');
      await git(['add', '-A']);

      const runner = createExecFileGitRunner();
      const files = await getStagedFiles({ run: (args, options) => runner.run(args, { ...options, env }) }, tmp.root);
      const byPath = Object.fromEntries(files.map((f) => [f.path, f]));
      expect(byPath['p/b/f.pdf']?.status).toBe('R');
      expect(byPath['p/b/f.pdf']?.renameScore).toBe(100);
      expect(byPath['n.md']?.status).toBe('M');
      expect(byPath['z.md']?.status).toBe('A');
      expect(files.some((f) => f.path.includes('=>'))).toBe(false);
    } finally {
      await tmp.cleanup();
    }
  });
});
