import path from 'node:path';
import { request } from 'node:http';
import { describe, expect, it } from 'vitest';
import { makeApprovalStore, type ApprovalStore } from '../helpers/approval-store.js';
import { runCliBackground, stopCliBackground } from '../helpers/run-cli.js';

function getStatus(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    request(url, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode ?? 0));
    }).on('error', reject).end();
  });
}

async function until(check: () => Promise<boolean>, ms: number): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await check()) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return check();
}

async function withServe(store: ApprovalStore, body: (url: string, stderr: () => string) => Promise<void>): Promise<void> {
  const { child, firstLine } = await runCliBackground(['serve', '--port', '0', '--json'], { cwd: store.root, env: store.env });
  const err: string[] = [];
  child.stderr?.on('data', (c: Buffer) => err.push(c.toString('utf8')));
  try {
    await body((JSON.parse(firstLine) as { data: { url: string } }).data.url, () => err.join(''));
  } finally {
    await stopCliBackground(child);
  }
}

// These wait on the real first store-update run, 10 s after start.
describe('ctxr serve keeps its clone current (real CLI, fake forge)', { timeout: 90_000 }, () => {
  it('serves a change merged on the origin by a sync run, in a store without change approval', async () => {
    const store = await makeApprovalStore({ noApproval: true });
    try {
      await withServe(store, async (url, stderr) => {
        const note = new URL('/notes/projects/merged.md', url).toString();
        expect(await getStatus(note)).toBe(404);
        const merged = await store.advanceMain({ 'projects/merged.md': '# Merged on the forge\n' }, 'merge elsewhere');
        expect(await until(async () => (await getStatus(note)) === 200, 40_000), stderr()).toBe(true);
        expect(await store.git(['rev-parse', 'HEAD'])).toBe(merged);
        expect(await until(async () => stderr().includes('sync: '), 10_000), stderr()).toBe(true);
        expect(stderr()).not.toContain('land: ');
      });
    } finally {
      await store.tmp.cleanup();
    }
  });

  it('runs only landing in a store that lands through the server', async () => {
    const store = await makeApprovalStore();
    try {
      await withServe(store, async (_url, stderr) => {
        const merged = await store.advanceMain({ 'projects/merged.md': '# Merged on the forge\n' }, 'merge elsewhere');
        expect(await until(async () => (await store.git(['rev-parse', 'HEAD'])) === merged, 40_000), stderr()).toBe(true);
        expect(await until(async () => stderr().includes('land: '), 10_000), stderr()).toBe(true);
        expect(stderr()).not.toContain('sync: ');
      });
    } finally {
      await store.tmp.cleanup();
    }
  });

  it('a failing sync run leaves every route answering as before', async () => {
    const store = await makeApprovalStore({ noApproval: true });
    try {
      await store.git(['remote', 'set-url', 'origin', path.join(store.tmp.root, 'no-such-origin.git')]);
      await withServe(store, async (url, stderr) => {
        const before = await getStatus(new URL('/', url).toString());
        expect(await until(async () => stderr().includes('sync: the sync run exited 2'), 40_000), stderr()).toBe(true);
        expect(stderr()).toContain('sync: error: The forge is unreachable');
        expect(await getStatus(new URL('/', url).toString())).toBe(before);
        expect(before).toBe(200);
      });
    } finally {
      await store.tmp.cleanup();
    }
  });
});
