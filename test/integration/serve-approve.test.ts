import { createServer, request, type Server } from 'node:http';
import { chmod, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseDecision } from '../../src/core/approval/decision.js';
import { makeApprovalStore, recordApproval, RECORDING_LOGIN, type ApprovalStore } from '../helpers/approval-store.js';
import { makeSessionPair, recordSessionDecision, type Part, type SessionPair } from '../helpers/session-stores.js';
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

/**
 * approve-sessions-across-stores, change-approval: one session with a part in
 * `ctx-a` and a part in its mount `ctx-b`, listed, shown and decided once on
 * `ctx-a`'s page.
 */
describe('the approval page for a session across stores (real CLI, two fake forges)', () => {
  const pairStore = (opts: { bDeciders?: string } = {}) =>
    makeSessionPair({ identity: { issuer: ISSUER, audience: AUDIENCE, jwksUrl }, ...opts });

  async function withPairServer(pair: SessionPair, cwd: string, body: (url: string) => Promise<void>): Promise<void> {
    const { child, firstLine } = await runCliBackground(['serve', '--port', '0', '--json'], { cwd, env: pair.env });
    try {
      await body((JSON.parse(firstLine) as { data: { url: string } }).data.url);
    } finally {
      await stopCliBackground(child);
    }
  }

  const page = async (url: string, route: string, email = 'a@example.com') => http(new URL(route, url).toString(), { headers: { [HEADER]: assertion(email) } });
  const partField = (part: Part) => `${part.store.slug}#${part.number}@${part.head}`;
  function sessionPost(url: string, name: string, fields: [string, string][], email = 'a@example.com'): Promise<Response> {
    return http(new URL(`/approve/${name}/decision`, url).toString(), {
      method: 'POST',
      headers: { [HEADER]: assertion(email), Origin: BASE, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields).toString(),
    });
  }
  const reviewsOf = async (part: Part) => ((await part.store.forge.read()).reviews ?? {})[part.number] ?? [];

  it('lists a session with parts in two stores once, and shows each part under its store, mounted part first', async () => {
    const pair = await pairStore();
    try {
      const home = await pair.openHome('ctx-move', 7, { 'projects/gone.md': '# Gone\n' });
      const joined = await pair.openJoined(home, 5, { 'projects/moved.md': '# Moved\n' });
      // As if the part had been written from another person's clone: this clone of ctx-b does not hold its commits.
      await pair.git(['worktree', 'remove', '--force', joined.worktree], pair.mount);
      await pair.git(['branch', '-D', joined.branch], pair.mount);
      await pair.git(['update-ref', '-d', `refs/remotes/origin/${joined.branch}`], pair.mount);
      await pair.git(['reflog', 'expire', '--expire=now', '--all'], pair.mount);
      await pair.git(['gc', '--quiet', '--prune=now'], pair.mount);
      expect(await pair.git(['cat-file', '-t', joined.head], pair.mount).catch(() => 'missing')).toBe('missing');
      const mountBranches = await pair.git(['for-each-ref', '--format=%(refname)', 'refs/heads'], pair.mount);
      await withPairServer(pair, pair.a.root, async (url) => {
        const index = await page(url, '/approve/');
        expect(index.status).toBe(200);
        expect(index.body.split(`href="/approve/${home.name}/"`).length - 1).toBe(1);
        expect(index.body).toContain('ctx-b #5');
        expect(index.body).toContain('example/ctx-a #7');

        const shown = await page(url, `/approve/${home.name}/`);
        expect(shown.status).toBe(200);
        const b = shown.body.indexOf('ctx-b: pull request');
        const a = shown.body.indexOf('example/ctx-a: pull request');
        expect(b).toBeGreaterThan(-1);
        expect(a).toBeGreaterThan(b);
        expect(shown.body).toContain('projects/moved.md');
        expect(shown.body).toContain('projects/gone.md');
        expect(shown.body).toContain(`value="${partField(joined)}"`);
        expect(shown.body).toContain(`value="${partField(home)}"`);
      });
      // The mounted part's head was fetched under the server's own namespace; the mount's branches are as they were.
      expect(await pair.git(['for-each-ref', '--format=%(refname)', 'refs/heads'], pair.mount)).toBe(mountBranches);
      expect(await pair.git(['rev-parse', 'refs/ctxr-approve/5'], pair.mount)).toBe(joined.head);
    } finally {
      await pair.tmp.cleanup();
    }
  });

  it('records the decision on every part: the record on the home part, a copy on the mounted part, one decision id', async () => {
    const pair = await pairStore();
    try {
      const home = await pair.openHome('ctx-move', 7, { 'projects/gone.md': '# Gone\n' });
      const joined = await pair.openJoined(home, 5, { 'projects/moved.md': '# Moved\n' });
      await withPairServer(pair, pair.a.root, async (url) => {
        const res = await sessionPost(url, home.name, [['decision', 'approve'], ['part', partField(joined)], ['part', partField(home)]]);
        expect(res.status, res.body).toBe(303);
      });
      const [record] = await reviewsOf(home);
      const [copy] = await reviewsOf(joined);
      const r = parseDecision(record!.body)!;
      const c = parseDecision(copy!.body)!;
      expect(record!.user.login).toBe(RECORDING_LOGIN);
      expect(copy!.user.login).toBe(RECORDING_LOGIN);
      expect(r.session!.id).toBe(c.session!.id);
      expect(r.session!.session).toEqual({ home: 'example/ctx-a', branch: home.branch });
      expect(r.session!.parts).toEqual([
        { store: 'example/ctx-b', number: 5, head: joined.head },
        { store: 'example/ctx-a', number: 7, head: home.head },
      ]);
      expect(r).toMatchObject({ decision: 'approve', head: home.head, by: 'a@example.com' });
      expect(c).toMatchObject({ decision: 'approve', head: joined.head, by: 'a@example.com' });
      // The record is posted first.
      expect(Date.parse(record!.submitted_at)).toBeLessThanOrEqual(Date.parse(copy!.submitted_at));
    } finally {
      await pair.tmp.cleanup();
    }
  });

  it('says which copy is missing when posting it fails, and the decision stands', async () => {
    const pair = await pairStore();
    try {
      const home = await pair.openHome('ctx-move', 7, { 'projects/gone.md': '# Gone\n' });
      const joined = await pair.openJoined(home, 5, { 'projects/moved.md': '# Moved\n' });
      await pair.b.forge.update((state) => {
        state.fail = { 'pulls/5/reviews': 502 };
      });
      await withPairServer(pair, pair.a.root, async (url) => {
        const res = await sessionPost(url, home.name, [['decision', 'approve'], ['part', partField(joined)], ['part', partField(home)]]);
        expect(res.status).toBe(200);
        expect(res.body).toContain('example/ctx-b#5');
        expect(res.body).toContain('Landing posts each missing copy');
      });
      expect(await reviewsOf(home)).toHaveLength(1);
      expect(await reviewsOf(joined)).toHaveLength(0);
    } finally {
      await pair.tmp.cleanup();
    }
  });

  it('records on the first part when the session has no part in its home store', async () => {
    const pair = await pairStore();
    try {
      const home = await pair.openHome('ctx-move', 7, { 'projects/gone.md': '# Gone\n' });
      const joined = await pair.openJoined(home, 5, { 'projects/moved.md': '# Moved\n' });
      await pair.a.forge.update((state) => {
        state.pulls = [];
      });
      await withPairServer(pair, pair.a.root, async (url) => {
        expect((await page(url, '/approve/')).body).toContain(`href="/approve/${home.name}/"`);
        const res = await sessionPost(url, home.name, [['decision', 'approve'], ['part', partField(joined)]]);
        expect(res.status, res.body).toBe(303);
      });
      const [record] = await reviewsOf(joined);
      expect(parseDecision(record!.body)!.session!.parts).toEqual([{ store: 'example/ctx-b', number: 5, head: joined.head }]);
    } finally {
      await pair.tmp.cleanup();
    }
  });

  it('refuses a decider of one store only, naming the other, and records nothing', async () => {
    const pair = await pairStore({ bDeciders: '"a@example.com"' });
    try {
      const home = await pair.openHome('ctx-move', 7, { 'projects/gone.md': '# Gone\n' });
      const joined = await pair.openJoined(home, 5, { 'projects/moved.md': '# Moved\n' });
      await withPairServer(pair, pair.a.root, async (url) => {
        const res = await sessionPost(url, home.name, [['decision', 'approve'], ['part', partField(joined)], ['part', partField(home)]], 'b@example.com');
        expect(res.status).toBe(403);
        expect(res.body).toContain('ctx-b');
      });
      expect(await reviewsOf(home)).toHaveLength(0);
      expect(await reviewsOf(joined)).toHaveLength(0);
    } finally {
      await pair.tmp.cleanup();
    }
  });

  it('refuses a decision on heads or parts the page did not show, recording nothing', async () => {
    const pair = await pairStore();
    try {
      const home = await pair.openHome('ctx-move', 7, { 'projects/gone.md': '# Gone\n' });
      const joined = await pair.openJoined(home, 5, { 'projects/moved.md': '# Moved\n' });
      await withPairServer(pair, pair.a.root, async (url) => {
        const missingPart = await sessionPost(url, home.name, [['decision', 'approve'], ['part', partField(home)]]);
        expect(missingPart.status).toBe(409);
        const moved = await sessionPost(url, home.name, [['decision', 'approve'], ['part', partField({ ...joined, head: 'f'.repeat(40) })], ['part', partField(home)]]);
        expect(moved.status).toBe(409);
      });
      expect(await reviewsOf(home)).toHaveLength(0);
      expect(await reviewsOf(joined)).toHaveLength(0);
    } finally {
      await pair.tmp.cleanup();
    }
  });

  it('records a request for changes, with its comment, on every part', async () => {
    const pair = await pairStore();
    try {
      const home = await pair.openHome('ctx-move', 7, { 'projects/gone.md': '# Gone\n' });
      const joined = await pair.openJoined(home, 5, { 'projects/moved.md': '# Moved\n' });
      await withPairServer(pair, pair.a.root, async (url) => {
        const res = await sessionPost(url, home.name, [['decision', 'request-changes'], ['comment', 'Keep the original title.'], ['part', partField(joined)], ['part', partField(home)]]);
        expect(res.status, res.body).toBe(303);
      });
      for (const part of [home, joined]) {
        const [review] = await reviewsOf(part);
        expect(review!.state).toBe('CHANGES_REQUESTED');
        expect(parseDecision(review!.body)!.comment).toBe('Keep the original title.');
      }
    } finally {
      await pair.tmp.cleanup();
    }
  });

  it('reports an unreachable mount, offers no decision on its sessions, and still decides sessions only on the home store', async () => {
    const pair = await pairStore();
    try {
      const both = await pair.openHome('ctx-move', 7, { 'projects/gone.md': '# Gone\n' });
      const joined = await pair.openJoined(both, 5, { 'projects/moved.md': '# Moved\n' });
      const alone = await pair.openHome('ctx-alone', 8, { 'projects/alone.md': '# Alone\n' });
      // An earlier decision named the ctx-b part; ctx-b then becomes unreadable.
      await recordSessionDecision(
        { store: pair.a, number: 7, head: both.head },
        [
          { store: pair.b, number: 5, head: joined.head },
          { store: pair.a, number: 7, head: both.head },
        ],
        { home: 'example/ctx-a', branch: both.branch },
        { kind: 'request-changes', comment: 'later' },
      );
      await pair.b.forge.update((state) => {
        state.fail = { pulls: 502 };
      });
      await withPairServer(pair, pair.a.root, async (url) => {
        const index = await page(url, '/approve/');
        expect(index.status).toBe(200);
        expect(index.body).toContain('The forge could not be read for ctx-b');
        const withPart = await page(url, `/approve/${both.name}/`);
        expect(withPart.status).toBe(200);
        expect(withPart.body).not.toContain('name="part"');
        const onlyHome = await page(url, `/approve/${alone.name}/`);
        expect(onlyHome.body).toContain(`value="${partField(alone)}"`);
        const decided = await sessionPost(url, alone.name, [['decision', 'approve'], ['part', partField(alone)]]);
        expect(decided.status, decided.body).toBe(303);
      });
    } finally {
      await pair.tmp.cleanup();
    }
  });

  it('end to end: a note moved from ctx-a into its mount ctx-b is one session, approved once on ctx-a, landing ctx-b first', async () => {
    const pair = await pairStore();
    try {
      await pair.advance(pair.a, { 'projects/note.md': '# Note\n\nA note to move.\n' });
      const build = async (cwd: string) => expect((await runCli(['catalog', 'build'], { cwd, env: pair.env, timeoutMs: 60_000 })).exitCode).toBe(0);
      const submit = async (cwd: string, name: string, branch: string) => {
        const r = await pair.cli(['session', 'submit', name, '--branch', branch, '--message', 'Move the note', '--title', 'Move the note', '--body', 'Why: the note belongs in ctx-b.'], cwd);
        expect(r.exitCode, r.stdout + r.stderr).toBe(0);
        return r.json.data as { approval_url: string; pull_request: { number: number } };
      };

      // The home part: the original removed in ctx-a's session.
      const started = await pair.cli(['session', 'start', 'move-note'], pair.a.root);
      const homeWorktree = started.json.data.worktree as string;
      const homeName = path.basename(homeWorktree);
      await pair.git(['rm', '-q', 'projects/note.md'], homeWorktree);
      await build(homeWorktree);
      const homeSubmit = await submit(pair.a.root, homeName, 'notes/move-out');

      // The mounted part: the note added in a session inside ctx-b that joins it.
      const joinedStart = await pair.cli(['session', 'start', '--joins', homeName], pair.mount);
      const joinedWorktree = joinedStart.json.data.worktree as string;
      await writeFile(path.join(joinedWorktree, 'projects', 'note.md'), '# Note\n\nA note to move.\n');
      await build(joinedWorktree);
      const joinedSubmit = await submit(pair.mount, path.basename(joinedWorktree), 'notes/move-in');
      // One approval link for both parts.
      expect(joinedSubmit.approval_url).toBe(homeSubmit.approval_url);
      // The agent opened them with its own account, which is not the recording login.
      for (const forge of [pair.a.forge, pair.b.forge]) {
        await forge.update((state) => {
          for (const p of state.pulls) p.user = 'ctx-agent';
        });
      }

      // Record, as ctx-a's main moves, whether ctx-b's main already holds the note.
      const log = path.join(pair.tmp.root, 'order.log');
      const hook = path.join(pair.a.origin, 'hooks', 'post-receive');
      await writeFile(
        hook,
        `#!/bin/sh\nwhile read old new ref; do\n  if [ "$ref" = "refs/heads/main" ]; then\n    if git --git-dir="${pair.b.origin}" cat-file -e main:projects/note.md 2>/dev/null; then echo mount-first >> "${log}"; else echo home-first >> "${log}"; fi\n  fi\ndone\n`,
      );
      await chmod(hook, 0o755);

      await withPairServer(pair, pair.a.root, async (url) => {
        const route = new URL(homeSubmit.approval_url).pathname;
        const shown = await page(url, route);
        expect(shown.status).toBe(200);
        const fields = [...shown.body.matchAll(/name="part" value="([^"]+)"/g)].map((m) => m[1]!);
        expect(new Set(fields).size).toBe(2);
        const res = await http(new URL(`${route}decision`, url).toString(), {
          method: 'POST',
          headers: { [HEADER]: assertion(), Origin: BASE, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams([['decision', 'approve'], ...[...new Set(fields)].map((f) => ['part', f] as [string, string])]).toString(),
        });
        expect(res.status, res.body).toBe(303);

        // The server lands what was approved.
        const deadline = Date.now() + 90_000;
        const merged = async () => {
          const a = (await pair.a.forge.read()).pulls.find((p) => p.number === homeSubmit.pull_request.number);
          const b = (await pair.b.forge.read()).pulls.find((p) => p.number === joinedSubmit.pull_request.number);
          return Boolean(a?.merged) && Boolean(b?.merged);
        };
        while (!(await merged())) {
          if (Date.now() > deadline) throw new Error('the session did not land');
          await new Promise((r) => setTimeout(r, 250));
        }
      });
      expect((await readFile(log, 'utf8')).trim()).toBe('mount-first');
      const onMain = async (origin: string) => (await pair.git(['--git-dir', origin, 'ls-tree', '-r', '--name-only', 'main'], pair.tmp.root)).split('\n');
      expect(await onMain(pair.b.origin)).toContain('projects/note.md');
      expect(await onMain(pair.a.origin)).not.toContain('projects/note.md');
    } finally {
      await pair.tmp.cleanup();
    }
  }, 240_000);

  it("shows a session homed elsewhere apart from this store's own, naming its home, with no decision", async () => {
    const pair = await pairStore();
    try {
      const home = await pair.openHome('ctx-move', 7, { 'projects/gone.md': '# Gone\n' });
      await pair.openJoined(home, 5, { 'projects/moved.md': '# Moved\n' });
      await withPairServer(pair, pair.b.root, async (url) => {
        const index = await page(url, '/approve/');
        expect(index.status).toBe(200);
        expect(index.body).toContain('Sessions that began in another store');
        expect(index.body).toContain('example/ctx-a');
        expect(index.body).not.toContain('href="/approve/');
      });
    } finally {
      await pair.tmp.cleanup();
    }
  });
});
