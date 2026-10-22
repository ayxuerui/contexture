import { createHash, randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { McpConfig } from '../../src/config/schema.js';
import { createIdentityVerifier } from '../../src/core/approval/identity.js';
import { handleMcpRequest, MCP_PATH } from '../../src/core/mcp/http.js';
import type { ToolDefinition } from '../../src/core/mcp/jsonrpc.js';
import { scopesFor } from '../../src/core/mcp/members.js';
import { ACCESS_TOKEN_TTL_SECONDS, AuthorizationServer, Signer, type Principal } from '../../src/core/mcp/oauth.js';
import { renderConsentPage } from '../../src/core/mcp/pages.js';
import { makeTestSigner } from '../helpers/identity-keys.js';

const REDIRECT = 'https://client.example/callback';
const ISSUER = 'https://idp.ctx-a.example.test';
const AUDIENCE = 'aud-1';
const HEADER = 'Cf-Access-Jwt-Assertion';
const identity = makeTestSigner();

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

describe('mcp scopes from the configuration', () => {
  it('maps readers and capturers to scopes, with @domain matching that domain only', () => {
    const mcp: McpConfig = { readers: ['@ctx-a.example'], capturers: ['b@ctx-b.example'] };
    expect(scopesFor('a@ctx-a.example', mcp)).toEqual(['read']);
    expect(scopesFor('b@ctx-b.example', mcp)).toEqual(['capture']);
    expect(scopesFor('a@ctx-a.example.evil.test', mcp)).toEqual([]);
    expect(scopesFor('a@ctx-a.example', undefined)).toEqual([]);
  });
});

describe('mcp authorisation server', () => {
  let server: Server;
  let base: string;
  let clock: Date;
  let mcp: McpConfig;

  beforeEach(async () => {
    clock = new Date();
    mcp = { readers: ['@ctx-a.example'], capturers: ['b@ctx-a.example'] };
    const signer = new Signer(randomBytes(32));
    const spentCodes = new Map<string, number>();
    const verifier = createIdentityVerifier(
      { header: HEADER, issuer: ISSUER, audience: AUDIENCE, jwks_url: 'https://idp.ctx-a.example.test/certs' },
      { fetch: async () => ({ ok: true, status: 200, json: async () => identity.jwks }) },
    );
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
              tools: () => TOOLS.filter((t) => (principal.scopes as string[]).includes(t.scope)),
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
      identityHeader: HEADER,
      verifier,
      mcp: () => mcp,
      signer,
      spentCodes,
      now: () => clock,
      renderConsentPage: (view) => renderConsentPage('ctx-store', view),
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const assertion = (email: string) => identity.token({ iss: ISSUER, aud: [AUDIENCE], email });

  async function register(name = 'Test <Client>'): Promise<string> {
    const res = await fetch(`${base}/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ redirect_uris: [REDIRECT], client_name: name }) });
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

  const consent = (params: URLSearchParams, email?: string) =>
    fetch(`${base}/authorize?${params.toString()}`, { redirect: 'manual', headers: email ? { [HEADER]: assertion(email) } : {} });

  async function confirm(params: URLSearchParams, email: string | null, opts: { origin?: string | null; decision?: string } = {}): Promise<Response> {
    const form = new URLSearchParams(params);
    form.set('decision', opts.decision ?? 'allow');
    const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
    if (email !== null) headers[HEADER] = assertion(email);
    if (opts.origin !== null) headers.Origin = opts.origin ?? base;
    return fetch(`${base}/authorize`, { method: 'POST', redirect: 'manual', headers, body: form.toString() });
  }

  async function exchange(clientId: string, code: string, verifier: string): Promise<Response> {
    return fetch(`${base}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: clientId, redirect_uri: REDIRECT, code_verifier: verifier }).toString(),
    });
  }

  async function signIn(email: string, extra: Record<string, string> = {}): Promise<{ token: string; scope: string }> {
    const clientId = await register();
    const { verifier, challenge } = pkce();
    const redirect = await confirm(authorizeParams(clientId, challenge, extra), email);
    expect(redirect.status).toBe(302);
    const res = await exchange(clientId, new URL(redirect.headers.get('location')!).searchParams.get('code')!, verifier);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { access_token: string; scope: string };
    return { token: body.access_token, scope: body.scope };
  }

  const listTools = (token: string) =>
    fetch(`${base}${MCP_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
  const toolNames = async (res: Response) => ((await res.json()) as { result: { tools: { name: string }[] } }).result.tools.map((t) => t.name);

  it('publishes both metadata documents and challenges a request without a token', async () => {
    const prm = (await (await fetch(`${base}/.well-known/oauth-protected-resource/mcp`)).json()) as Record<string, unknown>;
    expect(prm).toMatchObject({ resource: `${base}/mcp`, authorization_servers: [base], scopes_supported: ['read', 'capture'] });
    const asm = (await (await fetch(`${base}/.well-known/oauth-authorization-server`)).json()) as Record<string, unknown>;
    expect(asm).toMatchObject({ issuer: base, code_challenge_methods_supported: ['S256'], grant_types_supported: ['authorization_code'] });
    const res = await listTools('');
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toBe(`Bearer resource_metadata="${base}/.well-known/oauth-protected-resource/mcp"`);
  });

  it('shows a consent page naming the client, the redirect host, the email and the scopes, and issues no code until confirmed', async () => {
    const clientId = await register();
    const page = await consent(authorizeParams(clientId, pkce().challenge), 'b@ctx-a.example');
    expect(page.status).toBe(200);
    expect(page.headers.get('location')).toBeNull();
    // A browser posts the form with `Origin: null` under no-referrer, and the confirmation would refuse it.
    expect(page.headers.get('referrer-policy')).toBe('same-origin');
    const html = await page.text();
    expect(html).toContain('Test &lt;Client&gt;');
    expect(html).not.toContain('<Client>');
    expect(html).toContain('client.example');
    expect(html).toContain('b@ctx-a.example');
    expect(html).toContain('search and read');
    expect(html).toContain('save material');
    expect(html).toContain('name="code_challenge"');
    expect(html).not.toContain('no-referrer');
  });

  it('completes registration → consent → token → tools/list, listing only what the scopes reach', async () => {
    const reader = await signIn('a@ctx-a.example');
    expect(reader.scope).toBe('read');
    expect(await toolNames(await listTools(reader.token))).toEqual(['find']);

    const clientId = await register();
    const { verifier, challenge } = pkce();
    const redirect = await confirm(authorizeParams(clientId, challenge), 'b@ctx-a.example');
    const location = new URL(redirect.headers.get('location')!);
    expect(`${location.origin}${location.pathname}`).toBe(REDIRECT);
    expect(location.searchParams.get('state')).toBe('st-1');
    expect(location.searchParams.get('iss')).toBe(base);
    const token = await exchange(clientId, location.searchParams.get('code')!, verifier);
    const body = (await token.json()) as { access_token: string; expires_in: number; scope: string };
    // b@ is a reader through the @ctx-a.example entry and a capturer by name.
    expect(body).toMatchObject({ expires_in: ACCESS_TOKEN_TTL_SECONDS, scope: 'read capture' });
    expect(await toolNames(await listTools(body.access_token))).toEqual(['find', 'capture']);
  });

  it('refuses without a verified assertion (401) and a verified non-member (403), issuing nothing', async () => {
    const clientId = await register();
    const params = authorizeParams(clientId, pkce().challenge);
    expect((await consent(params)).status).toBe(401);
    expect((await consent(params, 'z@elsewhere.example')).status).toBe(403);
    const forged = await fetch(`${base}/authorize?${params.toString()}`, { headers: { [HEADER]: makeTestSigner().token({ iss: ISSUER, aud: [AUDIENCE], email: 'a@ctx-a.example' }) } });
    expect(forged.status).toBe(401);
    for (const res of [await confirm(params, null), await confirm(params, 'z@elsewhere.example')]) {
      expect(res.headers.get('location')).toBeNull();
      expect([401, 403]).toContain(res.status);
    }
  });

  it('refuses a confirmation from another origin, and redirects a declined one without a code', async () => {
    const clientId = await register();
    const params = authorizeParams(clientId, pkce().challenge);
    for (const origin of ['https://evil.example', null]) {
      const res = await confirm(params, 'a@ctx-a.example', { origin });
      expect(res.status).toBe(403);
      expect(res.headers.get('location')).toBeNull();
    }
    const declined = await confirm(params, 'a@ctx-a.example', { decision: 'deny' });
    const location = new URL(declined.headers.get('location')!);
    expect(location.searchParams.get('error')).toBe('access_denied');
    expect(location.searchParams.get('code')).toBeNull();
  });

  it('refuses plain PKCE, a missing challenge and another resource by redirecting an error', async () => {
    const clientId = await register();
    for (const [extra, error] of [
      [{ code_challenge_method: 'plain' }, 'invalid_request'],
      [{ code_challenge: '' }, 'invalid_request'],
      [{ resource: 'https://other.example/mcp' }, 'invalid_target'],
    ] as [Record<string, string>, string][]) {
      const res = await consent(authorizeParams(clientId, pkce().challenge, extra), 'a@ctx-a.example');
      expect(res.status).toBe(302);
      const location = new URL(res.headers.get('location')!);
      expect(location.searchParams.get('error')).toBe(error);
      expect(location.searchParams.get('code')).toBeNull();
    }
  });

  it('never redirects to an unregistered URI, nor for a client it never issued', async () => {
    const clientId = await register();
    const wrong = await consent(authorizeParams(clientId, pkce().challenge, { redirect_uri: 'https://evil.example/cb' }), 'a@ctx-a.example');
    expect(wrong.status).toBe(400);
    expect(wrong.headers.get('location')).toBeNull();
    const forgedClient = `client.${Buffer.from('{"r":["https://evil.example/cb"]}').toString('base64url')}.AAAA`;
    const forged = await consent(authorizeParams(forgedClient, pkce().challenge, { redirect_uri: 'https://evil.example/cb' }), 'a@ctx-a.example');
    expect(forged.status).toBe(400);
  });

  it('narrows a requested grant to what the member holds', async () => {
    const { token, scope } = await signIn('a@ctx-a.example', { scope: 'read capture' });
    expect(scope).toBe('read');
    expect(await toolNames(await listTools(token))).toEqual(['find']);
  });

  it('removal from the configuration refuses the next call, and a narrowed entry narrows the token', async () => {
    const { token } = await signIn('a@ctx-a.example');
    expect((await listTools(token)).status).toBe(200);
    mcp = { capturers: ['b@ctx-a.example'] };
    expect((await listTools(token)).status).toBe(401);

    mcp = { readers: ['b@ctx-a.example'], capturers: ['b@ctx-a.example'] };
    const both = await signIn('b@ctx-a.example');
    expect(await toolNames(await listTools(both.token))).toEqual(['find', 'capture']);
    mcp = { readers: ['b@ctx-a.example'] };
    expect(await toolNames(await listTools(both.token))).toEqual(['find']);
  });

  it('an access token stops working when it expires', async () => {
    const { token } = await signIn('a@ctx-a.example');
    clock = new Date(clock.getTime() + (ACCESS_TOKEN_TTL_SECONDS + 1) * 1000);
    expect((await listTools(token)).status).toBe(401);
  });

  it('an authorisation code is single use, sequentially and concurrently', async () => {
    for (const concurrent of [false, true]) {
      const clientId = await register();
      const { verifier, challenge } = pkce();
      const redirect = await confirm(authorizeParams(clientId, challenge), 'a@ctx-a.example');
      const code = new URL(redirect.headers.get('location')!).searchParams.get('code')!;
      const statuses = concurrent
        ? (await Promise.all([exchange(clientId, code, verifier), exchange(clientId, code, verifier)])).map((r) => r.status)
        : [(await exchange(clientId, code, verifier)).status, (await exchange(clientId, code, verifier)).status];
      expect(statuses.sort()).toEqual([200, 400]);
    }
  });

  it('refuses a verifier that does not match the challenge', async () => {
    const clientId = await register();
    const redirect = await confirm(authorizeParams(clientId, pkce().challenge), 'a@ctx-a.example');
    const res = await exchange(clientId, new URL(redirect.headers.get('location')!).searchParams.get('code')!, pkce().verifier);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('invalid_grant');
  });
});
