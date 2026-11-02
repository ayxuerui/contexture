import { execFile } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { makeApprovalStore, type ApprovalStore } from '../helpers/approval-store.js';
import { runCliBackground, stopCliBackground } from '../helpers/run-cli.js';

const execFileAsync = promisify(execFile);
const SECRET = 'ctx-a-webhook-secret';

function post(url: string, body: string, headers: Record<string, string>): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers } }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode ?? 0));
    });
    req.on('error', reject);
    req.end(body);
  });
}

const signature = (secret: string, body: string) => `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

function delivery(url: string, event: string, payload: unknown, sign: string | null): Promise<number> {
  const body = JSON.stringify(payload);
  return post(new URL('/hooks/github', url).toString(), body, { 'X-GitHub-Event': event, ...(sign === null ? {} : { 'X-Hub-Signature-256': signature(sign, body) }) });
}

async function until(check: () => Promise<boolean>, ms: number): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await check()) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return check();
}

async function withServe(store: ApprovalStore, extraEnv: Record<string, string>, body: (url: string, stderr: () => string, startedAt: number) => Promise<void>): Promise<void> {
  const { child, firstLine } = await runCliBackground(['serve', '--port', '0', '--json'], { cwd: store.root, env: { ...store.env, ...extraEnv } });
  const startedAt = Date.now();
  const err: string[] = [];
  child.stderr?.on('data', (c: Buffer) => err.push(c.toString('utf8')));
  try {
    await body((JSON.parse(firstLine) as { data: { url: string } }).data.url, () => err.join(''), startedAt);
  } finally {
    await stopCliBackground(child);
  }
}

/** A branch pushed from another clone, with pull request `number` open for it. */
async function pushBranch(store: ApprovalStore, branch: string, number: number): Promise<string> {
  const clone = path.join(store.tmp.root, `elsewhere-${number}`);
  const git = async (args: string[], cwd = clone) => (await execFileAsync('git', args, { cwd, env: store.env as NodeJS.ProcessEnv })).stdout.trim();
  await git(['clone', '-q', store.origin, clone], store.tmp.root);
  await git(['checkout', '-q', '-b', branch]);
  await mkdir(path.join(clone, '.contexture/publish/ctx-a-page'), { recursive: true });
  await writeFile(path.join(clone, '.contexture/publish/ctx-a-page/index.html'), '<p>page</p>\n');
  await git(['add', '-A']);
  await git(['commit', '-q', '--no-verify', '-m', 'add a page']);
  await git(['push', '-q', '--no-verify', 'origin', branch]);
  await store.forge.update((state) => void state.pulls.push({ number, head: branch, title: 'Add a page' }));
  return git(['rev-parse', 'HEAD']);
}

const previewRef = (store: ApprovalStore, number: number) => async () =>
  execFileAsync('git', ['rev-parse', '--verify', '--quiet', `refs/ctxr-preview/pull/${number}`], { cwd: store.root, env: store.env as NodeJS.ProcessEnv }).then(
    (r) => r.stdout.trim(),
    () => null,
  );

describe('ctxr serve accepts signed GitHub webhook deliveries (real CLI, fake forge)', { timeout: 90_000 }, () => {
  it('a signed push to the default branch starts a store-update run at once, without waiting for the timer', async () => {
    const store = await makeApprovalStore({ noApproval: true });
    try {
      const merged = await store.advanceMain({ 'projects/merged.md': '# Merged\n' }, 'merge elsewhere');
      await withServe(store, { CONTEXTURE_WEBHOOK_SECRET: SECRET }, async (url, stderr, startedAt) => {
        expect(await delivery(url, 'push', { ref: 'refs/heads/main', repository: { full_name: 'example/ctx-a' } }, SECRET)).toBe(202);
        expect(await until(async () => (await store.git(['rev-parse', 'HEAD'])) === merged, 9_000), stderr()).toBe(true);
        // The first timed run starts 10 s after startup; this one came from the delivery.
        expect(Date.now() - startedAt, stderr()).toBeLessThan(10_000);
        expect(stderr()).toContain('serve: webhook: main changed on example/ctx-a; starting a store-update run');
        // The run's own output arrives when the child exits, a moment after the fast-forward it reports.
        expect(await until(async () => stderr().includes('sync: '), 10_000), stderr()).toBe(true);
      });
    } finally {
      await store.tmp.cleanup();
    }
  });

  it('a signed push to another branch fetches it for its pull request preview, from a secret file too', async () => {
    const store = await makeApprovalStore({ noApproval: true });
    try {
      const head = await pushBranch(store, 'session/ctx-a-page', 7);
      const secretFile = path.join(store.tmp.root, 'webhook-secret');
      await writeFile(secretFile, `${SECRET}\n`);
      await withServe(store, { CONTEXTURE_WEBHOOK_SECRET_FILE: secretFile }, async (url, stderr) => {
        expect(await delivery(url, 'push', { ref: 'refs/heads/session/ctx-a-page' }, SECRET)).toBe(202);
        expect(await until(async () => (await previewRef(store, 7)()) === head, 9_000), stderr()).toBe(true);
        expect(await store.git(['rev-parse', 'HEAD'])).not.toBe(head);
      });
    } finally {
      await store.tmp.cleanup();
    }
  });

  it('an unsigned or wrongly signed delivery is refused with 401 and does nothing', async () => {
    const store = await makeApprovalStore({ noApproval: true });
    try {
      await pushBranch(store, 'session/ctx-a-page', 7);
      const before = await store.git(['rev-parse', 'HEAD']);
      await store.advanceMain({ 'projects/merged.md': '# Merged\n' }, 'merge elsewhere');
      await withServe(store, { CONTEXTURE_WEBHOOK_SECRET: SECRET }, async (url, stderr) => {
        expect(await delivery(url, 'push', { ref: 'refs/heads/main' }, null)).toBe(401);
        expect(await delivery(url, 'push', { ref: 'refs/heads/main' }, 'not-the-secret')).toBe(401);
        expect(await delivery(url, 'push', { ref: 'refs/heads/session/ctx-a-page' }, null)).toBe(401);
        expect(await delivery(url, 'push', { ref: 'refs/heads/session/ctx-a-page' }, 'not-the-secret')).toBe(401);
        await new Promise((r) => setTimeout(r, 3_000));
        expect(await store.git(['rev-parse', 'HEAD'])).toBe(before);
        expect(await previewRef(store, 7)()).toBeNull();
        expect(stderr()).not.toContain('sync: ');
        expect(stderr()).not.toContain('starting a store-update run');
      });
    } finally {
      await store.tmp.cleanup();
    }
  });

  it('without a webhook secret, the route answers 405 like any other non-read request', async () => {
    const store = await makeApprovalStore({ noApproval: true });
    try {
      await pushBranch(store, 'session/ctx-a-page', 7);
      await withServe(store, {}, async (url) => {
        expect(await delivery(url, 'push', { ref: 'refs/heads/session/ctx-a-page' }, SECRET)).toBe(405);
        expect(await delivery(url, 'push', { ref: 'refs/heads/main' }, null)).toBe(405);
        await new Promise((r) => setTimeout(r, 1_000));
        expect(await previewRef(store, 7)()).toBeNull();
      });
    } finally {
      await store.tmp.cleanup();
    }
  });
});
