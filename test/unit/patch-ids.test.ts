import { execFile } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { patchIds } from '../../src/core/git/exec.js';
import { hermeticGitEnv } from '../helpers/git-env.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

const run = promisify(execFile);

describe('patchIds', () => {
  it('matches a clean rebase commit for commit, and tells a changed patch apart', async () => {
    const tmp = await makeTmpDir();
    const env = hermeticGitEnv() as NodeJS.ProcessEnv;
    const git = async (...args: string[]) => (await run('git', args, { cwd: tmp.root, env })).stdout.trim();
    const write = (file: string, text: string) => writeFile(path.join(tmp.root, file), text);
    // patchIds runs git with this process's environment, so the repo needs no global config of its own.
    try {
      await git('init', '-q', '-b', 'main');
      await write('a.md', 'one\n');
      await write('b.md', 'two\n');
      await git('add', '.');
      await git('commit', '-qm', 'base');
      await git('checkout', '-qb', 'work');
      await write('a.md', 'one changed\n');
      await git('commit', '-qam', 'edit a');
      const approved = await git('rev-parse', 'HEAD');
      await git('checkout', '-q', 'main');
      await write('b.md', 'two changed\n');
      await git('commit', '-qam', 'edit b');
      await git('checkout', '-q', 'work');
      await git('rebase', '-q', 'main');
      const rebased = await git('rev-parse', 'HEAD');

      const before = await patchIds(tmp.root, `main~1..${approved}`);
      const after = await patchIds(tmp.root, `main..${rebased}`);
      expect(before).toHaveLength(1);
      expect(after).toEqual(before);

      await write('a.md', 'one changed differently\n');
      await git('commit', '-q', '--amend', '-am', 'edit a');
      expect(await patchIds(tmp.root, `main..HEAD`)).not.toEqual(before);
    } finally {
      await tmp.cleanup();
    }
  });
});
