import type { ChildProcess } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { git, makeServedStore, writeStoreFile, type ServedStore } from '../helpers/mcp-store.js';
import { runCli, runCliBackground, stopCliBackground } from '../helpers/run-cli.js';

const REDIRECT = 'https://client.example/callback';

interface ServeEnvelope {
  exitCode: number;
  data: { url: string; port: number; auth: boolean; members: number; head: string };
}

describe('ctxr mcp serve (real CLI)', () => {
  let fixture: ServedStore;
  let child: ChildProcess | undefined;
  let stderr = '';

  beforeEach(async () => {
    fixture = await makeServedStore();
    await writeStoreFile(fixture.author, 'work/kestrel.md', '# Kestrel\n\nThe Kestrel launch moved to March.\n');
    await fixture.publish('add kestrel');
    await git(fixture.served, fixture.env, 'pull', '-q', '--ff-only');
    stderr = '';
  });

  afterEach(async () => {
    if (child) await stopCliBackground(child);
    child = undefined;
    await fixture.cleanup();
  });

  async function addMember(name: string, scope: string): Promise<string> {
    const res = await runCli(['mcp', 'member', 'add', name, '--scope', scope, '--state-dir', fixture.stateDir, '--json'], { cwd: fixture.served, env: fixture.env });
    expect(res.exitCode).toBe(0);
    return (JSON.parse(res.stdout) as { data: { code: string } }).data.code;
  }

  async function serve(extra: string[] = []): Promise<ServeEnvelope> {
    const started = await runCliBackground(['mcp', 'serve', '--port', '0', '--state-dir', fixture.stateDir, '--json', ...extra], { cwd: fixture.served, env: fixture.env });
    child = started.child;
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    return JSON.parse(started.firstLine) as ServeEnvelope;
  }

  async function signIn(mcpUrl: string, code: string): Promise<string> {
    const origin = new URL(mcpUrl).origin;
    const registration = (await (await fetch(`${origin}/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ redirect_uris: [REDIRECT] }) })).json()) as { client_id: string };
    const verifier = randomBytes(32).toString('base64url');
    const form = new URLSearchParams({
      response_type: 'code',
      client_id: registration.client_id,
      redirect_uri: REDIRECT,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
      resource: mcpUrl,
      access_code: code,
    });
    const redirect = await fetch(`${origin}/authorize`, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString() });
    expect(redirect.status).toBe(302);
    const authCode = new URL(redirect.headers.get('location')!).searchParams.get('code')!;
    const token = await fetch(`${origin}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code: authCode, client_id: registration.client_id, redirect_uri: REDIRECT, code_verifier: verifier }).toString(),
    });
    expect(token.status).toBe(200);
    return ((await token.json()) as { access_token: string }).access_token;
  }

  async function rpc(mcpUrl: string, token: string, method: string, params?: unknown): Promise<{ result?: Record<string, unknown>; error?: { code: number } }> {
    const res = await fetch(mcpUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, ...(params === undefined ? {} : { params }) }),
    });
    expect(res.status).toBe(200);
    return (await res.json()) as { result?: Record<string, unknown>; error?: { code: number } };
  }

  it('signs a member in and serves find and the capture stub, logging each call', async () => {
    const both = await addMember('ctx-a', 'read,capture');
    const reader = await addMember('ctx-b', 'read');
    const envelope = await serve();
    expect(envelope.data.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
    expect(envelope.data).toMatchObject({ auth: true, members: 2 });

    const unauthenticated = await fetch(envelope.data.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    expect(unauthenticated.status).toBe(401);

    const token = await signIn(envelope.data.url, both);
    const init = await rpc(envelope.data.url, token, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
    expect(init.result).toMatchObject({ protocolVersion: '2025-06-18', serverInfo: { name: 'contexture' } });
    expect(String(init.result!.instructions)).toContain('find');

    const tools = (await rpc(envelope.data.url, token, 'tools/list')).result as { tools: { name: string; annotations: { readOnlyHint: boolean } }[] };
    expect(tools.tools.map((t) => [t.name, t.annotations.readOnlyHint])).toEqual([
      ['find', true],
      ['capture', false],
    ]);

    const found = (await rpc(envelope.data.url, token, 'tools/call', { name: 'find', arguments: { text: 'kestrel' } })).result as {
      isError: boolean;
      structuredContent: { notes: { path: string }[]; store: { head: string } };
    };
    expect(found.isError).toBe(false);
    expect(found.structuredContent.notes.map((n) => n.path)).toEqual(['work/kestrel.md']);
    expect(found.structuredContent.store.head).toBe((await git(fixture.served, fixture.env, 'rev-parse', 'HEAD')).trim());

    const captured = (await rpc(envelope.data.url, token, 'tools/call', { name: 'capture', arguments: { title: 'Call', body: 'Notes as written.', source_type: 'meeting' } })).result as {
      isError: boolean;
      structuredContent: { saved: boolean };
    };
    expect(captured).toMatchObject({ isError: false, structuredContent: { saved: false } });
    expect((await git(fixture.served, fixture.env, 'status', '--porcelain')).trim()).toBe('');

    const readerToken = await signIn(envelope.data.url, reader);
    const refused = (await rpc(envelope.data.url, readerToken, 'tools/call', { name: 'capture', arguments: { title: 'x', body: 'y', source_type: 'email' } })).result as {
      isError: boolean;
      structuredContent: { error: { code: string } };
    };
    expect(refused).toMatchObject({ isError: true, structuredContent: { error: { code: 'mcp.insufficient_scope' } } });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(stderr).toContain('mcp ctx-a: tools/list');
    expect(stderr).toContain('mcp ctx-a: tools/call find');
    expect(stderr).toContain('mcp ctx-a: tools/call capture');
  });

  it('refuses a wide bind without --public-url, and --no-auth off loopback', async () => {
    const wide = await runCli(['mcp', 'serve', '--host', '0.0.0.0', '--port', '0', '--state-dir', fixture.stateDir, '--json'], { cwd: fixture.served, env: fixture.env });
    expect(wide.exitCode).toBe(2);
    expect(JSON.parse(wide.stdout).findings[0].code).toBe('mcp.public_url_required');
    const noAuth = await runCli(['mcp', 'serve', '--host', '0.0.0.0', '--public-url', 'https://store.example', '--no-auth', '--json'], { cwd: fixture.served, env: fixture.env });
    expect(noAuth.exitCode).toBe(2);
    expect(JSON.parse(noAuth.stdout).findings[0].code).toBe('mcp.no_auth_off_loopback');
  });

  it('refuses to start on a checkout with an uncommitted note', async () => {
    await writeStoreFile(fixture.served, 'work/kestrel.md', 'edited on the server\n');
    const res = await runCli(['mcp', 'serve', '--port', '0', '--state-dir', fixture.stateDir, '--json'], { cwd: fixture.served, env: fixture.env });
    expect(res.exitCode).toBe(2);
    expect(JSON.parse(res.stdout).findings[0]).toMatchObject({ code: 'mcp.checkout_dirty' });
  });

  it('under --no-auth on loopback, admits the operator with every tool', async () => {
    const envelope = await serve(['--no-auth', '--pull-interval', '0']);
    expect(envelope.data.auth).toBe(false);
    const tools = (await rpc(envelope.data.url, '', 'tools/list')).result as { tools: { name: string }[] };
    expect(tools.tools.map((t) => t.name)).toEqual(['find', 'capture']);
  });
});
