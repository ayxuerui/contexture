import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer, request, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeApprovalStore, recordApproval, type ApprovalStore } from '../helpers/approval-store.js';
import { makeTestSigner } from '../helpers/identity-keys.js';
import { runCli, runCliBackground, stopCliBackground } from '../helpers/run-cli.js';

const BASE = 'https://ctx-a.example.test';
const ISSUER = 'https://ctx-a.cloudflareaccess.example.test';
const signer = makeTestSigner();
let jwksServer: Server;
let jwksUrl: string;

beforeAll(async () => {
  jwksServer = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(signer.jwks));
  });
  await new Promise<void>((resolve) => jwksServer.listen(0, '127.0.0.1', resolve));
  jwksUrl = `http://127.0.0.1:${(jwksServer.address() as { port: number }).port}/certs`;
});
afterAll(async () => {
  await new Promise<void>((resolve) => jwksServer.close(() => resolve()));
});

function approve(url: string, name: string, head: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request(new URL(`/approve/${name}/decision`, url), {
      method: 'POST',
      headers: {
        'cf-access-jwt-assertion': signer.token({ iss: ISSUER, aud: ['aud-1'], email: 'a@example.com' }),
        Origin: BASE,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode ?? 0));
    });
    req.on('error', reject);
    req.end(`decision=approve&head=${head}`);
  });
}

function getStatus(url: string, email?: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = email === undefined ? {} : { 'cf-access-jwt-assertion': signer.token({ iss: ISSUER, aud: ['aud-1'], email }) };
    request(url, { headers }, (res) => {
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

const merged = (store: ApprovalStore, n: number) => async () => (await store.forge.read()).pulls.find((p) => p.number === n)?.merged === true;
const gone = (dir: string) => async () => access(dir).then(() => false, () => true);

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

const storeWith = (extra = '') => makeApprovalStore({ baseUrl: BASE, identity: { issuer: ISSUER, audience: 'aud-1', jwksUrl }, approvalExtra: extra });

// These wait on real sweeps (the first fires 10 s after start), so the default per-test limit is too tight under load.
describe('ctxr serve lands what was approved (real CLI, fake forge)', { timeout: 90_000 }, () => {
  it('an Approve on the page merges the change and removes its worktree, with no other lander', async () => {
    const store = await storeWith();
    try {
      const s = await store.openSession('ctx-a', 7, { 'projects/a.md': '# A\n' });
      await withServe(store, async (url, stderr) => {
        expect(await approve(url, s.name, s.head)).toBe(303);
        expect(await until(merged(store, 7), 30_000), stderr()).toBe(true);
        expect(await until(gone(s.worktree), 10_000)).toBe(true);
        // The run's own output arrives when the child exits, a moment after the merge it reports.
        expect(await until(async () => stderr().includes('land: '), 10_000), stderr()).toBe(true);
      });
    } finally {
      await store.tmp.cleanup();
    }
  });

  it('lands an approval recorded while it was down, on the sweep after startup', async () => {
    const store = await storeWith();
    try {
      const s = await store.openSession('ctx-a', 7, { 'projects/a.md': '# A\n' });
      await recordApproval(store, 7, s.head);
      await withServe(store, async (_url, stderr) => {
        expect(await until(merged(store, 7), 30_000), stderr()).toBe(true);
      });
    } finally {
      await store.tmp.cleanup();
    }
  });

  it('lands nothing with land: manual', async () => {
    const store = await storeWith('  land: manual\n');
    try {
      const s = await store.openSession('ctx-a', 7, { 'projects/a.md': '# A\n' });
      await withServe(store, async (url, stderr) => {
        expect(await approve(url, s.name, s.head)).toBe(303);
        await new Promise((r) => setTimeout(r, 12_000)); // past the startup sweep
        expect(await merged(store, 7)()).toBe(false);
        expect(stderr()).not.toContain('land: ');
      });
      const list = await runCli(['review', 'list', '--json'], { cwd: store.root, env: store.env });
      expect(JSON.parse(list.stdout).data.sessions[0].state).toBe('approved');
    } finally {
      await store.tmp.cleanup();
    }
  });

  it('a configuration change merged elsewhere reaches the running server within a sweep', async () => {
    const store = await storeWith();
    try {
      const configFile = path.join(store.root, 'contexture.yaml');
      const withNewDecider = (await readFile(configFile, 'utf8')).replace('deciders: ["@example.com"]', 'deciders: ["@example.com", "b@other.example"]');
      await withServe(store, async (url, stderr) => {
        const asB = () => getStatus(new URL('/approve/', url).toString(), 'b@other.example');
        expect(await asB()).toBe(403);
        // Merged on the forge by a person, not by ctxr land: nothing else moves the canonical clone.
        await store.advanceMain({ 'contexture.yaml': withNewDecider }, 'add a decider');
        expect(await until(async () => (await asB()) === 200, 30_000), stderr()).toBe(true);
      });
    } finally {
      await store.tmp.cleanup();
    }
  });

  it('a blocked landing leaves every route answering', async () => {
    const store = await storeWith();
    try {
      const s = await store.openSession('ctx-a', 7, { 'projects/a.md': '# A from the session\n' });
      await store.advanceMain({ 'projects/a.md': '# A from main\n' });
      await withServe(store, async (url, stderr) => {
        expect(await approve(url, s.name, s.head)).toBe(303);
        const blocked = async () => {
          const list = await runCli(['review', 'list', '--json'], { cwd: store.root, env: store.env });
          return JSON.parse(list.stdout).data.sessions[0]?.state === 'blocked';
        };
        expect(await until(blocked, 30_000), stderr()).toBe(true);
        expect(await until(async () => stderr().includes('land: the landing run exited 3'), 10_000), stderr()).toBe(true);
        expect(await getStatus(new URL('/', url).toString())).toBe(200);
        expect(await merged(store, 7)()).toBe(false);
      });
    } finally {
      await store.tmp.cleanup();
    }
  });
});
