import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { createMemo } from '../../src/core/browse/memo.js';
import { renderReview } from '../../src/core/browse/review.js';
import { createExecFileGitRunner, type GitRunner } from '../../src/core/git/exec.js';
import { readConfig } from '../../src/config/load.js';
import { hermeticGitEnv } from '../helpers/git-env.js';
import { runCli } from '../helpers/run-cli.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

describe('createMemo', () => {
  it('computes once per key, shares a pending computation, and evicts the least recently used', async () => {
    const memo = createMemo<number>(2);
    let runs = 0;
    const compute = (value: number) => async () => {
      runs += 1;
      return value;
    };
    const [a, b] = await Promise.all([memo.get('a', compute(1)), memo.get('a', compute(99))]);
    expect([a, b, runs]).toEqual([1, 1, 1]);
    await memo.get('b', compute(2));
    await memo.get('a', compute(99)); // a is now most recently used
    await memo.get('c', compute(3)); // evicts b
    expect(memo.size).toBe(2);
    expect(await memo.get('a', compute(99))).toBe(1); // kept
    expect(await memo.get('b', compute(20))).toBe(20); // was evicted, so computed again
  });

  it('forgets a failed computation', async () => {
    const memo = createMemo<number>(4);
    await expect(memo.get('k', async () => Promise.reject(new Error('transient')))).rejects.toThrow('transient');
    expect(await memo.get('k', async () => 7)).toBe(7);
  });
});

describe('renderReview caching', () => {
  it('reads each side of a commit pair once, however many times the change is viewed', async () => {
    const tmp = await makeTmpDir();
    const env = hermeticGitEnv();
    const git = async (args: string[], cwd: string) => (await promisify(execFile)('git', args, { cwd, env: env as NodeJS.ProcessEnv })).stdout.trim();
    try {
      await git(['init', '-q', '-b', 'main'], tmp.root);
      expect((await runCli(['init'], { cwd: tmp.root, env })).exitCode).toBe(0);
      const started = await runCli(['session', 'start', 'ctx-a', '--json'], { cwd: tmp.root, env });
      const worktree = JSON.parse(started.stdout).data.worktree as string;
      await mkdir(path.join(worktree, 'projects'), { recursive: true });
      await writeFile(path.join(worktree, 'projects/a.md'), '# A\n\nSee [[b]].\n');
      await git(['add', '.'], worktree);
      await git(['commit', '-q', '--no-verify', '-m', 'add a'], worktree);

      const real = createExecFileGitRunner();
      const treeReads: string[] = [];
      const counting: GitRunner = {
        run(args, opts) {
          if (args[0] === 'ls-tree') treeReads.push(args.join(' '));
          return real.run(args, opts);
        },
      };
      const store = { root: tmp.root, config: await readConfig(tmp.root) };
      const view = () => renderReview(counting, store, path.basename(worktree), null, () => null, () => ({ reason: 'not_found' }) as never);

      const first = await view();
      const readsAfterFirst = treeReads.length;
      expect(readsAfterFirst).toBeGreaterThan(0);
      const second = await view();
      expect(second.html).toBe(first.html);
      expect(treeReads.length).toBe(readsAfterFirst);
    } finally {
      await tmp.cleanup();
    }
  });
});
