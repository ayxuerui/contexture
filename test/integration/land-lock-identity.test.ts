import { readFile, writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeApprovalStore, recordApproval, RECORDING_LOGIN } from '../helpers/approval-store.js';
import { runCli } from '../helpers/run-cli.js';

const lockFile = (root: string) => path.join(root, '.git', 'ctxr-land.lock');

describe('ctxr land: one lander per repository, and a committer on a bare host', () => {
  it('a sweep steps aside without touching the forge while another landing holds the lock, and a named landing refuses', async () => {
    const store = await makeApprovalStore();
    try {
      // A live holder: this test process.
      await writeFile(lockFile(store.root), JSON.stringify({ pid: process.pid, host: hostname() }));
      // Any forge read would now fail the command, so exit 0 proves it read nothing.
      await store.forge.update((state) => {
        state.fail = { pulls: 500, user: 500 };
      });
      const sweep = await runCli(['land', '--pending', '--json'], { cwd: store.root, env: store.env });
      expect(sweep.exitCode, sweep.stdout + sweep.stderr).toBe(0);
      expect(sweep.stderr).toContain(`process ${process.pid}`);
      const named = await runCli(['land', '7', '--confirm', '--json'], { cwd: store.root, env: store.env });
      expect(named.exitCode).toBe(3);
      expect(JSON.parse(named.stdout).findings[0].code).toBe('land.busy');
      // The holder's lock is left alone.
      expect(JSON.parse(await readFile(lockFile(store.root), 'utf8')).pid).toBe(process.pid);
    } finally {
      await store.tmp.cleanup();
    }
  });

  it('takes over a lock whose process is gone, and releases its own', async () => {
    const store = await makeApprovalStore();
    try {
      const s = await store.openSession('ctx-a', 7, { 'projects/a.md': '# A\n' });
      await recordApproval(store, 7, s.head);
      await writeFile(lockFile(store.root), JSON.stringify({ pid: 2 ** 22 + 12345, host: hostname() }));
      const result = await runCli(['land', '--pending', '--json'], { cwd: store.root, env: store.env, timeoutMs: 60_000 });
      expect(result.exitCode, result.stdout + result.stderr).toBe(0);
      expect(JSON.parse(result.stdout).data.results[0].outcome).toBe('merged');
      await expect(readFile(lockFile(store.root), 'utf8')).rejects.toThrow();
    } finally {
      await store.tmp.cleanup();
    }
  });

  it('commits a catch-up rebase as the recording login when no identity is configured, and writes no config', async () => {
    const store = await makeApprovalStore();
    try {
      const s = await store.openSession('ctx-a', 7, { 'projects/a.md': '# A\n' });
      await recordApproval(store, 7, s.head);
      await store.advanceMain({ 'projects/other.md': '# Other\n' });
      const configBefore = await readFile(path.join(store.root, '.git', 'config'), 'utf8');
      const bare = {
        ...store.env,
        GIT_AUTHOR_NAME: undefined,
        GIT_AUTHOR_EMAIL: undefined,
        GIT_COMMITTER_NAME: undefined,
        GIT_COMMITTER_EMAIL: undefined,
        EMAIL: undefined,
      };
      // Land 7 without merging it, so the rebased commit can be inspected: the forge refuses the merge.
      await store.forge.update((state) => {
        state.fail = { merge: 405 };
      });
      const result = await runCli(['land', '7', '--json'], { cwd: store.root, env: bare, timeoutMs: 60_000 });
      expect(JSON.parse(result.stdout).data.results[0], result.stdout + result.stderr).toMatchObject({ catch_up: 'carried-over', outcome: 'merge-refused' });
      const committer = await store.git(['--git-dir', store.origin, 'log', '-1', '--format=%cn <%ce> / %an', s.branch], store.tmp.root);
      expect(committer).toBe(`${RECORDING_LOGIN} <${RECORDING_LOGIN}@users.noreply.github.com> / Test`);
      expect(await readFile(path.join(store.root, '.git', 'config'), 'utf8')).toBe(configBefore);
    } finally {
      await store.tmp.cleanup();
    }
  });
});
