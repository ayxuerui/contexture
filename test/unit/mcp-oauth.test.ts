import { createHash, randomBytes } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as member from '../../src/commands/mcp-member.js';
import { handleMcpRequest, MCP_PATH } from '../../src/core/mcp/http.js';
import type { ToolDefinition } from '../../src/core/mcp/jsonrpc.js';
import { ACCESS_TOKEN_TTL_SECONDS, AuthorizationServer, Signer, type Principal } from '../../src/core/mcp/oauth.js';
import { renderAuthorizePage } from '../../src/core/mcp/pages.js';
import { loadSigningKey, MemberRegistry } from '../../src/core/mcp/state.js';
import type { Store } from '../../src/core/store.js';
import { makeFakeEnv } from '../helpers/fake-env.js';
import { makeTmpDir, type TmpDir } from '../helpers/tmp-store.js';

const REDIRECT = 'https://client.example/callback';

const tool = (name: string, scope: string): ToolDefinition<Principal> => ({
  name,
  title: name,
  description: name,
  inputSchema: { type: 'object' },
  scope,
  readOnly: scope === 'read',
  run: async () => ({ ok: true }),
});
const TOOLS = [tool('find', 'read'), tool('capture', 'capture')];

function pkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

describe('mcp authorisation server', () => {
  let tmp: TmpDir;
  let server: Server;
  let base: string;
  let stateDir: string;
  let store: Store;
  let clock: Date;
  let trustProxy: boolean;

  const env = () => makeFakeEnv({ cwd: tmp.root });

  beforeEach(async () => {
    tmp = await makeTmpDir('contexture-mcp-oauth-');
    store = { root: path.join(tmp.root, 'store'), config: { schema_version: 1 } } as unknown as Store;
    await mkdir(store.root);
    stateDir = path.join(tmp.root, 'state');
    clock = new Date('2026-01-01T00:00:00Z');
    trustProxy = false;
    await mkdir(stateDir, { recursive: true });
    const signer = new Signer(await loadSigningKey(stateDir));
    const members = new MemberRegistry(stateDir);
    let oauth: AuthorizationServer | undefined;

    server = createServer((req, res) => {
      const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
      void (async () => {
        if (await oauth!.handle(req, res, pathname)) return;
        const handled = await handleMcpRequest<Principal>(
          {
            originAllowed: () => true,
            authenticate: (r) => oauth!.authenticate(r),
            contextFor: (principal) => ({
              principal,
              tools: () => TOOLS.filter((t) => principal.scopes.includes(t.scope as never)),
              instructions: '',
              authorizeCall: () => undefined,
              refusalFor: () => undefined,
            }),
          },
          req,
          res,
          pathname,
        );
        if (!handled) {
          res.writeHead(404);
          res.end();
        }
      })();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    oauth = new AuthorizationServer({
      issuer: base,
      resource: `${base}${MCP_PATH}`,
      members,
      signer,
      now: () => clock,
      get trustProxy() {
        return trustProxy;
      },
      renderAuthorizePage: (view) => renderAuthorizePage('ctx-store', base, view),
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await tmp.cleanup();
  });

  async function addMember(name: string, scope: string): Promise<string> {
    return (await member.add(env(), store, { name, scope, stateDir })).data!.code;
  }

  async function register(): Promise<string> {
    const res = await fetch(`${base}/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ redirect_uris: [REDIRECT], client_name: 'Test <Client>' }) });
    expect(res.status).toBe(201);
    return ((await res.json()) as { client_id: string }).client_id;
  }

  function authorizeParams(clientId: string, challenge: string, extra: Record<string, string> = {}): URLSearchParams {
    return new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: REDIRECT,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state: 'st-1',
      resource: `${base}${MCP_PATH}`,
      ...extra,
    });
  }

  async function submitCode(params: URLSearchParams, accessCode: string, headers: Record<string, string> = {}): Promise<Response> {
    const form = new URLSearchParams(params);
    form.set('access_code', accessCode);
    return fetch(`${base}/authorize`, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers }, body: form.toString() });
  }

  async function exchange(clientId: string, code: string, verifier: string): Promise<Response> {
    return fetch(`${base}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: clientId, redirect_uri: REDIRECT, code_verifier: verifier }).toString(),
    });
  }

  async function signIn(accessCode: string, extra: Record<string, string> = {}): Promise<{ token: string; scope: string }> {
    const clientId = await register();
    const { verifier, challenge } = pkce();
    const redirect = await submitCode(authorizeParams(clientId, challenge, extra), accessCode);
    expect(redirect.status).toBe(302);
    const location = new URL(redirect.headers.get('location')!);
    const res = await exchange(clientId, location.searchParams.get('code')!, verifier);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { access_token: string; scope: string };
    return { token: body.access_token, scope: body.scope };
  }

  async function listTools(token: string): Promise<Response> {
    return fetch(`${base}${MCP_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
  }

  const toolNames = async (res: Response) => ((await res.json()) as { result: { tools: { name: string }[] } }).result.tools.map((t) => t.name);

  it('publishes both metadata documents and challenges a request without a token', async () => {
    const prm = (await (await fetch(`${base}/.well-known/oauth-protected-resource/mcp`)).json()) as Record<string, unknown>;
    expect(prm).toMatchObject({ resource: `${base}/mcp`, authorization_servers: [base], scopes_supported: ['read', 'capture'] });
    const asm = (await (await fetch(`${base}/.well-known/oauth-authorization-server`)).json()) as Record<string, unknown>;
    expect(asm).toMatchObject({ issuer: base, code_challenge_methods_supported: ['S256'], grant_types_supported: ['authorization_code'], registration_endpoint: `${base}/register` });

    const res = await listTools('');
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toBe(`Bearer resource_metadata="${base}/.well-known/oauth-protected-resource/mcp"`);
  });

  it('completes registration → authorize → token → tools/list, listing only what the scopes reach', async () => {
    const reader = await addMember('ctx-a', 'read');
    const clientId = await register();
    const { verifier, challenge } = pkce();

    const form = await fetch(`${base}/authorize?${authorizeParams(clientId, challenge).toString()}`);
    expect(form.status).toBe(200);
    const html = await form.text();
    expect(html).toContain('Test &lt;Client&gt;');
    expect(html).not.toContain('<Client>');
    expect(html).toContain('name="code_challenge"');

    const redirect = await submitCode(authorizeParams(clientId, challenge), reader);
    expect(redirect.status).toBe(302);
    const location = new URL(redirect.headers.get('location')!);
    expect(`${location.origin}${location.pathname}`).toBe(REDIRECT);
    expect(location.searchParams.get('state')).toBe('st-1');
    expect(location.searchParams.get('iss')).toBe(base);

    const token = await exchange(clientId, location.searchParams.get('code')!, verifier);
    expect(token.status).toBe(200);
    const body = (await token.json()) as { access_token: string; token_type: string; expires_in: number; scope: string };
    expect(body).toMatchObject({ token_type: 'Bearer', expires_in: ACCESS_TOKEN_TTL_SECONDS, scope: 'read' });

    const listed = await listTools(body.access_token);
    expect(listed.status).toBe(200);
    expect(await toolNames(listed)).toEqual(['find']);

    const both = await addMember('ctx-b', 'read,capture');
    expect(await toolNames(await listTools((await signIn(both)).token))).toEqual(['find', 'capture']);
  });

  it('refuses plain PKCE or a missing challenge by redirecting an error, issuing no code', async () => {
    await addMember('ctx-a', 'read');
    const clientId = await register();
    for (const extra of [{ code_challenge_method: 'plain' }, { code_challenge: '' }] as Record<string, string>[]) {
      const res = await fetch(`${base}/authorize?${authorizeParams(clientId, pkce().challenge, extra).toString()}`, { redirect: 'manual' });
      expect(res.status).toBe(302);
      const location = new URL(res.headers.get('location')!);
      expect(location.searchParams.get('error')).toBe('invalid_request');
      expect(location.searchParams.get('code')).toBeNull();
    }
  });

  it('never redirects to a URI the client did not register, nor for a client it never issued', async () => {
    const code = await addMember('ctx-a', 'read');
    const clientId = await register();
    const res = await submitCode(authorizeParams(clientId, pkce().challenge, { redirect_uri: 'https://evil.example/cb' }), code);
    expect(res.status).toBe(400);
    expect(res.headers.get('location')).toBeNull();
    const forged = await submitCode(authorizeParams(`client.${Buffer.from('{"r":["https://evil.example/cb"]}').toString('base64url')}.AAAA`, pkce().challenge, { redirect_uri: 'https://evil.example/cb' }), code);
    expect(forged.status).toBe(400);
    expect(forged.headers.get('location')).toBeNull();
  });

  it('a wrong access code grants nothing', async () => {
    await addMember('ctx-a', 'read');
    const clientId = await register();
    const res = await submitCode(authorizeParams(clientId, pkce().challenge), 'AAAA-BBBB-CCCC-DDDD-EEEE');
    expect(res.status).toBe(401);
    expect(res.headers.get('location')).toBeNull();
    expect(await res.text()).toContain('not recognised');
  });

  it('a client cannot widen its grant past the member’s scopes', async () => {
    const reader = await addMember('ctx-a', 'read');
    const { token, scope } = await signIn(reader, { scope: 'read capture' });
    expect(scope).toBe('read');
    expect(await toolNames(await listTools(token))).toEqual(['find']);
  });

  it('removal refuses the next call, and re-adding the name does not revive the old token', async () => {
    const code = await addMember('ctx-a', 'read');
    const { token } = await signIn(code);
    expect((await listTools(token)).status).toBe(200);
    await member.remove(env(), store, { name: 'ctx-a', stateDir });
    expect((await listTools(token)).status).toBe(401);
    await addMember('ctx-a', 'read');
    expect((await listTools(token)).status).toBe(401);
  });

  it('an access token stops working when it expires', async () => {
    const { token } = await signIn(await addMember('ctx-a', 'read'));
    clock = new Date(clock.getTime() + (ACCESS_TOKEN_TTL_SECONDS + 1) * 1000);
    expect((await listTools(token)).status).toBe(401);
  });

  it('an authorisation code is single use, sequentially and concurrently', async () => {
    const code = await addMember('ctx-a', 'read');
    for (const concurrent of [false, true]) {
      const clientId = await register();
      const { verifier, challenge } = pkce();
      const redirect = await submitCode(authorizeParams(clientId, challenge), code);
      const authCode = new URL(redirect.headers.get('location')!).searchParams.get('code')!;
      const statuses = concurrent
        ? (await Promise.all([exchange(clientId, authCode, verifier), exchange(clientId, authCode, verifier)])).map((r) => r.status)
        : [(await exchange(clientId, authCode, verifier)).status, (await exchange(clientId, authCode, verifier)).status];
      expect(statuses.sort()).toEqual([200, 400]);
    }
  });

  it('refuses a verifier that does not match the challenge', async () => {
    const code = await addMember('ctx-a', 'read');
    const clientId = await register();
    const { challenge } = pkce();
    const redirect = await submitCode(authorizeParams(clientId, challenge), code);
    const res = await exchange(clientId, new URL(redirect.headers.get('location')!).searchParams.get('code')!, pkce().verifier);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('invalid_grant');
  });

  it('throttles wrong codes per socket address, ignoring X-Forwarded-For without --trust-proxy', async () => {
    const code = await addMember('ctx-a', 'read');
    const clientId = await register();
    const params = authorizeParams(clientId, pkce().challenge);
    for (let i = 0; i < 5; i += 1) {
      expect((await submitCode(params, 'AAAA-BBBB-CCCC-DDDD-EEEE', { 'X-Forwarded-For': `203.0.113.${i}` })).status).toBe(401);
    }
    // Every attempt came from the same socket peer, so the window is shared and now closed — even for the right code.
    expect((await submitCode(params, code, { 'X-Forwarded-For': '198.51.100.7' })).status).toBe(429);
    clock = new Date(clock.getTime() + 15 * 60 * 1000);
    expect((await submitCode(params, code)).status).toBe(302);
  });

  it('with --trust-proxy, throttles per forwarded address when the peer is loopback', async () => {
    trustProxy = true;
    const code = await addMember('ctx-a', 'read');
    const clientId = await register();
    const params = authorizeParams(clientId, pkce().challenge);
    for (let i = 0; i < 5; i += 1) {
      expect((await submitCode(params, 'AAAA-BBBB-CCCC-DDDD-EEEE', { 'X-Forwarded-For': '203.0.113.9' })).status).toBe(401);
    }
    expect((await submitCode(params, code, { 'X-Forwarded-For': '203.0.113.9' })).status).toBe(429);
    expect((await submitCode(params, code, { 'X-Forwarded-For': '198.51.100.7' })).status).toBe(302);
  });
});
