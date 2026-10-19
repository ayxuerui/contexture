import { createServer, request, type Server } from 'node:http';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseDecision } from '../../src/core/approval/decision.js';
import { makeApprovalStore, recordApproval, RECORDING_LOGIN, type ApprovalStore } from '../helpers/approval-store.js';
import { makeTestSigner } from '../helpers/identity-keys.js';
import { runCli, runCliBackground, stopCliBackground } from '../helpers/run-cli.js';

const BASE = 'https://ctx-a.example.test';
const ISSUER = 'https://ctx-a.cloudflareaccess.example.test';
const AUDIENCE = 'aud-1';
const HEADER = 'cf-access-jwt-assertion';

const signer = makeTestSigner();
let jwksServer: Server;
let jwksUrl: string;

beforeAll(async () => {
  jwksServer = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(signer.jwks));
  });
  await new Promise<void>((resolve) => jwksServer.listen(0, '127.0.0.1', resolve));
  const address = jwksServer.address() as { port: number };
  jwksUrl = `http://127.0.0.1:${address.port}/certs`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => jwksServer.close(() => resolve()));
});

const assertion = (email = 'a@example.com', claims: Record<string, unknown> = {}) =>
  signer.token({ iss: ISSUER, aud: [AUDIENCE], email, ...claims });

interface Response {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

function http(url: string, opts: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<Response> {
  return new Promise((resolve, reject) => {
    const req = request(url, { method: opts.method ?? 'GET', headers: opts.headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end(opts.body);
  });
}

async function withServer(store: ApprovalStore, body: (url: string) => Promise<void>): Promise<void> {
  const { child, firstLine } = await runCliBackground(['serve', '--port', '0', '--json'], { cwd: store.root, env: store.env });
  try {
    await body((JSON.parse(firstLine) as { data: { url: string } }).data.url);
  } finally {
    await stopCliBackground(child);
  }
}

function decisionPost(url: string, name: string, fields: Record<string, string>, opts: { origin?: string; email?: string } = {}): Promise<Response> {
  return http(new URL(`/approve/${name}/decision`, url).toString(), {
    method: 'POST',
    headers: {
      [HEADER]: assertion(opts.email),
      Origin: opts.origin ?? BASE,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(fields).toString(),
  });
}

async function approvalStore(): Promise<ApprovalStore> {
  return makeApprovalStore({ baseUrl: BASE, identity: { issuer: ISSUER, audience: AUDIENCE, jwksUrl } });
}

describe('the approval page (real CLI, fake forge, real signatures)', () => {
  it('requires a verified decider before reading anything', async () => {
    const store = await approvalStore();
    try {
      const s = await store.openSession('ctx-a', 7, { 'projects/a.md': '# A\n' });
      await withServer(store, async (url) => {
        const index = new URL('/approve/', url).toString();
        const none = await http(index);
        expect(none.status).toBe(401);
        expect(none.body).not.toContain(s.name);

        const forged = await http(index, { headers: { [HEADER]: makeTestSigner().token({ iss: ISSUER, aud: [AUDIENCE], email: 'a@example.com' }) } });
        expect(forged.status).toBe(401);
        expect((await http(index, { headers: { [HEADER]: assertion('a@example.com', { aud: ['aud-2'] }) } })).status).toBe(401);
        expect((await http(index, { headers: { [HEADER]: assertion('someone@other.example') } })).status).toBe(403);
        expect((await http(index, { headers: { [HEADER]: assertion('a@example.com.evil.test') } })).status).toBe(403);

        const ok = await http(index, { headers: { [HEADER]: assertion() } });
        expect(ok.status).toBe(200);
        expect(ok.body).toContain(`href="/approve/${s.name}/"`);
      });
    } finally {
      await store.tmp.cleanup();
    }
  });

  it('lists only sessions with an open pull request', async () => {
    const store = await approvalStore();
    try {
      const s = await store.openSession('ctx-a', 7, { 'projects/a.md': '# A\n' });
      await runCli(['session', 'start', 'ctx-b'], { cwd: store.root, env: store.env });
      await withServer(store, async (url) => {
        const page = await http(new URL('/approve/', url).toString(), { headers: { [HEADER]: assertion() } });
        expect(page.body).toContain(s.name);
        expect(page.body).toContain('#7');
        expect(page.body).toContain(s.head.slice(0, 7));
        expect(page.body).toContain('awaiting a decision');
        expect(page.body).not.toContain('-ctx-b');
      });
    } finally {
      await store.tmp.cleanup();
    }
  });

  it("shows the author's account, the knowledge changes, the pages and every changed line, without script", async () => {
    const store = await approvalStore();
    try {
      const s = await store.openSession(
        'ctx-a',
        7,
        {
          'projects/a.md': '# A\n\nA new line about ctx-a.\n',
          '.contexture/publish/ctx-a-page/index.html': '<!doctype html><title>Page</title>',
          '.contexture/publish/ctx-a-page/README.md': '# ctx-a-page\n',
        },
        { title: 'Add the ctx-a note', body: 'What: a note.\n\n**Why**: ctx-a needs one.\n\n<script>alert(1)</script>' },
      );
      await writeFile(path.join(s.worktree, 'projects/a.md'), '# A\n\nUncommitted words.\n');
      const statusBefore = await store.git(['status', '--porcelain'], s.worktree);

      await withServer(store, async (url) => {
        const page = await http(new URL(`/approve/${s.name}/`, url).toString(), { headers: { [HEADER]: assertion() } });
        expect(page.status).toBe(200);
        const html = page.body;
        // The author's account, labelled and apart.
        expect(html).toContain('class="ctxr-author-account"');
        expect(html).toContain("The author's account");
        expect(html).toContain('<h3>Add the ctx-a note</h3>');
        expect(html).toContain('<strong>Why</strong>');
        expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
        expect(html).not.toContain('<script>alert(1)</script>');
        expect(html).toContain('add ctx-a');
        // The derived facts, the pages and the lines.
        expect(html).toContain('class="ctxr-derived"');
        expect(html).toContain('projects/a.md');
        expect(html).toContain(`/preview/${s.name}/ctx-a-page/index.html`);
        expect(html).toContain('class="ctxr-diff-add"');
        expect(html).toContain('A new line about ctx-a.');
        expect(html).not.toContain('Uncommitted words.');
        // Plain forms, no script needed.
        expect(html.match(/<form method="post" action="\/approve\/[^"]+\/decision">/g)).toHaveLength(2);
        expect(html).toContain(`name="head" value="${s.head}"`);
        expect(html).not.toContain('<script');
      });
      expect(await store.git(['status', '--porcelain'], s.worktree)).toBe(statusBefore);
    } finally {
      await store.tmp.cleanup();
    }
  });

  it('records an approval on the forge in the decider’s name, and reads it back', async () => {
    const store = await approvalStore();
    try {
      const s = await store.openSession('ctx-a', 7, { 'projects/a.md': '# A\n' });
      await withServer(store, async (url) => {
        const posted = await decisionPost(url, s.name, { decision: 'approve', head: s.head });
        expect(posted.status).toBe(303);
        expect(posted.headers.location).toBe(`/approve/${s.name}/`);

        const reviews = (await store.forge.read()).reviews!['7']!;
        expect(reviews).toHaveLength(1);
        expect(reviews[0]).toMatchObject({ user: { login: RECORDING_LOGIN }, state: 'APPROVED', commit_id: s.head });
        expect(reviews[0]!.body).toMatch(/^Approved by a@example\.com on the review page/);
        expect(parseDecision(reviews[0]!.body)).toMatchObject({ decision: 'approve', head: s.head, by: 'a@example.com' });

        const page = await http(new URL(`/approve/${s.name}/`, url).toString(), { headers: { [HEADER]: assertion() } });
        expect(page.body).toContain('approved, landing shortly');
      });
    } finally {
      await store.tmp.cleanup();
    }
  });

  it('refuses a cross-site post, a stale head and an empty request for changes, recording nothing', async () => {
    const store = await approvalStore();
    try {
      const s = await store.openSession('ctx-a', 7, { 'projects/a.md': '# A\n' });
      await withServer(store, async (url) => {
        expect((await decisionPost(url, s.name, { decision: 'approve', head: s.head }, { origin: 'https://evil.example.test' })).status).toBe(403);
        expect((await decisionPost(url, s.name, { decision: 'approve', head: s.head }, { email: 'someone@other.example' })).status).toBe(403);

        const stale = await store.commitInWorktree(s.worktree, { 'projects/a.md': '# A, again\n' }, 'again');
        await store.git(['push', '-q', 'origin', s.branch], s.worktree);
        const moved = await decisionPost(url, s.name, { decision: 'approve', head: s.head });
        expect(moved.status).toBe(409);
        expect(moved.body).toContain(s.head);
        expect(moved.body).toContain(stale);

        const empty = await decisionPost(url, s.name, { decision: 'request-changes', head: stale, comment: '  ' });
        expect(empty.status).toBe(400);
        expect((await store.forge.read()).reviews?.['7'] ?? []).toEqual([]);

        const changes = await decisionPost(url, s.name, { decision: 'request-changes', head: stale, comment: 'The second section contradicts the policy note.' });
        expect(changes.status).toBe(303);
        const reviews = (await store.forge.read()).reviews!['7']!;
        expect(reviews).toHaveLength(1);
        expect(reviews[0]!.state).toBe('CHANGES_REQUESTED');
        expect(parseDecision(reviews[0]!.body)).toMatchObject({ decision: 'request-changes', comment: 'The second section contradicts the policy note.' });
      });
    } finally {
      await store.tmp.cleanup();
    }
  });

  it('says a landed change landed after its worktree is gone', async () => {
    const store = await approvalStore();
    try {
      const s = await store.openSession('ctx-a', 7, { 'projects/a.md': '# A\n' });
      await recordApproval(store, 7, s.head);
      expect((await runCli(['land', '7'], { cwd: store.root, env: store.env, timeoutMs: 60_000 })).exitCode).toBe(0);
      await withServer(store, async (url) => {
        const page = await http(new URL(`/approve/${s.name}/`, url).toString(), { headers: { [HEADER]: assertion() } });
        expect(page.status).toBe(200);
        expect(page.body).toContain('This change landed as pull request #7');
      });
    } finally {
      await store.tmp.cleanup();
    }
  });

  it('refuses to start when its forge credential is not the recording login', async () => {
    const store = await approvalStore();
    try {
      await store.forge.update((state) => {
        state.login = 'ctx-agent';
      });
      const result = await runCli(['serve', '--port', '0', '--json'], { cwd: store.root, env: store.env });
      expect(result.exitCode).toBe(2);
      const finding = JSON.parse(result.stdout).findings[0];
      expect(finding.code).toBe('change_approval.recording_login_mismatch');
      expect(finding.message).toContain(RECORDING_LOGIN);
      expect(finding.message).toContain('ctx-agent');
    } finally {
      await store.tmp.cleanup();
    }
  });

  it('has no approval surface without the block: 404 for the pages, 405 for a decision', async () => {
    const store = await makeApprovalStore({ noApproval: true });
    try {
      const s = await store.openSession('ctx-a', 7, { 'projects/a.md': '# A\n' });
      await withServer(store, async (url) => {
        expect((await http(new URL('/approve/', url).toString(), { headers: { [HEADER]: assertion() } })).status).toBe(404);
        expect((await decisionPost(url, s.name, { decision: 'approve', head: s.head })).status).toBe(405);
      });
    } finally {
      await store.tmp.cleanup();
    }
  });
});
