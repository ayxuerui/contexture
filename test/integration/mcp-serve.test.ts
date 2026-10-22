import { createHash, randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer, request, type Server } from 'node:http';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeApprovalStore, type ApprovalStore } from '../helpers/approval-store.js';
import { makeTestSigner } from '../helpers/identity-keys.js';
import { runCliBackground, stopCliBackground } from '../helpers/run-cli.js';

const BASE = 'https://ctx-a.example.test';
const ISSUER = 'https://ctx-a.cloudflareaccess.example.test';
const AUDIENCE = 'aud-1';
const HEADER = 'cf-access-jwt-assertion';
const REDIRECT = 'https://client.example/callback';
const MCP_BLOCK = 'mcp:\n  readers: ["@example.com"]\n  capturers: ["a@example.com"]\n';

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

interface Reply {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

/** node:http rather than fetch: fetch refuses to send an Origin header of our choosing. */
function http(url: string, opts: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<Reply> {
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

const assertion = (email: string) => signer.token({ iss: ISSUER, aud: [AUDIENCE], email });

async function withServer(store: ApprovalStore, body: (url: string, stderr: () => string) => Promise<void>): Promise<void> {
  const { child, firstLine } = await runCliBackground(['serve', '--port', '0', '--json'], { cwd: store.root, env: store.env });
  let stderr = '';
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString('utf8');
  });
  try {
    await body((JSON.parse(firstLine) as { data: { url: string } }).data.url, () => stderr);
  } finally {
    await stopCliBackground(child);
  }
}

async function signIn(url: string, email: string): Promise<string> {
  const registration = await http(new URL('/register', url).toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ redirect_uris: [REDIRECT], client_name: 'Test client' }),
  });
  expect(registration.status).toBe(201);
  const clientId = (JSON.parse(registration.body) as { client_id: string }).client_id;
  const verifier = randomBytes(32).toString('base64url');
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: REDIRECT,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
    resource: `${BASE}/mcp`,
  });
  const consent = await http(new URL(`/authorize?${params.toString()}`, url).toString(), { headers: { [HEADER]: assertion(email) } });
  expect(consent.status).toBe(200);
  expect(consent.body).toContain(email);
  params.set('decision', 'allow');
  const confirmed = await http(new URL('/authorize', url).toString(), {
    method: 'POST',
    headers: { [HEADER]: assertion(email), Origin: BASE, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  expect(confirmed.status).toBe(302);
  const code = new URL(confirmed.headers.location as string).searchParams.get('code')!;
  const token = await http(new URL('/token', url).toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: clientId, redirect_uri: REDIRECT, code_verifier: verifier }).toString(),
  });
  expect(token.status).toBe(200);
  return (JSON.parse(token.body) as { access_token: string }).access_token;
}

async function rpc(url: string, token: string, method: string, params?: unknown): Promise<{ status: number; json: { result?: Record<string, unknown>; error?: { code: number } } }> {
  const reply = await http(new URL('/mcp', url).toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, ...(params === undefined ? {} : { params }) }),
  });
  return { status: reply.status, json: reply.body === '' ? {} : JSON.parse(reply.body) };
}

async function approvalStore(withMcp: boolean): Promise<ApprovalStore> {
  const store = await makeApprovalStore({ baseUrl: BASE, identity: { issuer: ISSUER, audience: AUDIENCE, jwksUrl } });
  if (withMcp) {
    await writeFile(path.join(store.root, 'contexture.yaml'), `${await readFile(path.join(store.root, 'contexture.yaml'), 'utf8')}${MCP_BLOCK}`);
    await store.git(['commit', '-qam', 'declare mcp', '--no-verify']);
    await store.git(['push', '-q', '--no-verify', 'origin', 'main']);
  }
  return store;
}

describe('the MCP surface of ctxr serve (real CLI, fake forge, real signatures)', () => {
  it('signs a member in through the verified identity, serves find, and turns a capture into a session pull request', async () => {
    const store = await approvalStore(true);
    try {
      await store.advanceMain({ 'projects/kestrel.md': '# Kestrel\n\nThe Kestrel launch moved to March.\n' }, 'add kestrel');
      await withServer(store, async (url, stderr) => {
        const meta = await http(new URL('/.well-known/oauth-authorization-server', url).toString());
        expect(meta.status).toBe(200);
        expect(JSON.parse(meta.body)).toMatchObject({ issuer: BASE, registration_endpoint: `${BASE}/register` });

        const anonymous = await rpc(url, '', 'tools/list');
        expect(anonymous.status).toBe(401);

        const token = await signIn(url, 'a@example.com');
        const init = await rpc(url, token, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
        expect(init.json.result).toMatchObject({ protocolVersion: '2025-06-18', serverInfo: { name: 'contexture' } });

        const tools = (await rpc(url, token, 'tools/list')).json.result as { tools: { name: string; annotations: { readOnlyHint: boolean } }[] };
        expect(tools.tools.map((t) => [t.name, t.annotations.readOnlyHint])).toEqual([
          ['find', true],
          ['gather', true],
          ['Read', true],
          ['Grep', true],
          ['Glob', true],
          ['capture', false],
        ]);

        const found = (await rpc(url, token, 'tools/call', { name: 'find', arguments: { text: 'kestrel' } })).json.result as {
          isError: boolean;
          structuredContent: { notes: { path: string; url: string }[]; store: { head: string } };
        };
        expect(found.isError).toBe(false);
        expect(found.structuredContent.notes.map((n) => n.path)).toEqual(['projects/kestrel.md']);
        expect(found.structuredContent.notes[0]!.url).toBe(`${BASE}/notes/projects/kestrel.md`);
        expect(found.structuredContent.store.head).toBe(await store.git(['rev-parse', 'origin/main']));

        const captured = (await rpc(url, token, 'tools/call', { name: 'capture', arguments: { title: 'Call', body: 'Notes as written.', source_type: 'meeting' } })).json.result as {
          isError: boolean;
          structuredContent: { saved: boolean; path: string; pull_request: { number: number }; approval_url: string };
        };
        expect(captured.isError).toBe(false);
        expect(captured.structuredContent.saved).toBe(true);
        expect(captured.structuredContent.path).toMatch(/^raw\/inbox\/\d{4}-\d{2}-\d{2}-call-[0-9a-f]{6}\.md$/);
        expect(captured.structuredContent.approval_url).toMatch(new RegExp(`^${BASE}/approve/`));
        const pulls = (await store.forge.read()).pulls;
        expect(pulls).toHaveLength(1);
        expect(pulls[0]).toMatchObject({ state: 'open', title: 'Capture: Call' });
        // The capture's session is an ordinary session: the approval index lists it, the default branch is untouched.
        const index = await http(new URL('/approve/', url).toString(), { headers: { [HEADER]: assertion('a@example.com') } });
        expect(index.status).toBe(200);
        expect(index.body).toContain(captured.structuredContent.approval_url.split('/approve/')[1]!);
        const author = await store.git(['log', '-1', '--format=%ae', pulls[0]!.head], store.root);
        expect(author).toBe('a@example.com');
        expect(await store.git(['ls-remote', 'origin', 'refs/heads/main'])).toContain(await store.git(['rev-parse', 'origin/main']));

        const reader = await signIn(url, 'b@example.com');
        const refused = (await rpc(url, reader, 'tools/call', { name: 'capture', arguments: { title: 'x', body: 'y', source_type: 'email' } })).json.result as {
          isError: boolean;
          structuredContent: { error: { code: string } };
        };
        expect(refused).toMatchObject({ isError: true, structuredContent: { error: { code: 'mcp.insufficient_scope' } } });

        const foreign = await http(new URL('/mcp', url).toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, Origin: 'https://evil.example' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
        });
        expect(foreign.status).toBe(403);

        expect((await store.git(['status', '--porcelain'])).trim()).toBe('');
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(stderr()).toContain('mcp a@example.com: tools/list');
        expect(stderr()).toContain('mcp a@example.com: tools/call find');
        expect(stderr()).toContain('per-process key');
      });
    } finally {
      await store.tmp.cleanup();
    }
  });

  it('is absent without the block, and follows the block being added and removed with no restart', async () => {
    const store = await approvalStore(false);
    try {
      await withServer(store, async (url) => {
        const metaUrl = new URL('/.well-known/oauth-authorization-server', url).toString();
        expect((await http(metaUrl)).status).toBe(404);
        expect((await http(new URL('/mcp', url).toString(), { method: 'POST', body: '{}' })).status).toBe(405);

        const configPath = path.join(store.root, 'contexture.yaml');
        const without = await readFile(configPath, 'utf8');
        await writeFile(`${configPath}.next`, `${without}${MCP_BLOCK}`);
        await import('node:fs/promises').then((fs) => fs.rename(`${configPath}.next`, configPath));
        expect((await http(metaUrl)).status).toBe(200);
        expect((await http(new URL('/notes/', url).toString())).status).not.toBe(500);

        await writeFile(`${configPath}.next`, without);
        await import('node:fs/promises').then((fs) => fs.rename(`${configPath}.next`, configPath));
        expect((await http(metaUrl)).status).toBe(404);
      });
    } finally {
      await store.tmp.cleanup();
    }
  });

  it('refuses sign-in without a verified assertion, and for a verified non-member', async () => {
    const store = await approvalStore(true);
    try {
      await withServer(store, async (url) => {
        const registration = await http(new URL('/register', url).toString(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ redirect_uris: [REDIRECT] }) });
        const clientId = (JSON.parse(registration.body) as { client_id: string }).client_id;
        const params = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: REDIRECT, code_challenge: 'a'.repeat(43), code_challenge_method: 'S256' });
        const authorize = new URL(`/authorize?${params.toString()}`, url).toString();
        expect((await http(authorize)).status).toBe(401);
        expect((await http(authorize, { headers: { [HEADER]: assertion('z@elsewhere.example') } })).status).toBe(403);
      });
    } finally {
      await store.tmp.cleanup();
    }
  });
});
