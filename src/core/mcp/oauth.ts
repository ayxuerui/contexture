import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { BodyTooLargeError, readBody, sendJson, sendText, type Authentication } from './http.js';
import { MCP_SCOPES, type McpScope, type Member, type MemberRegistry } from './state.js';

/**
 * serve-the-store-over-mcp design.md D3: the server is the OAuth 2.1
 * authorisation server for its own `/mcp` resource, and it stores nothing it
 * issues. Client ids, authorisation codes and access tokens are all
 * HMAC-signed payloads; the only state is the member list the operator writes
 * and the signing key. Authorisation codes are additionally single use: each
 * carries a nonce recorded in memory when redeemed, and codes are signed
 * under a per-process key, so a restart invalidates outstanding codes rather
 * than forgetting which were spent.
 */

export const ACCESS_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
export const AUTHORIZATION_CODE_TTL_SECONDS = 10 * 60;
export const THROTTLE_MAX_FAILURES = 5;
export const THROTTLE_WINDOW_MS = 15 * 60 * 1000;
const MAX_FORM_BYTES = 64 * 1024;
const MAX_REDIRECT_URIS = 10;
const MAX_REDIRECT_URI_LENGTH = 2000;

export const PROTECTED_RESOURCE_METADATA_PATH = '/.well-known/oauth-protected-resource';
export const AUTHORIZATION_SERVER_METADATA_PATH = '/.well-known/oauth-authorization-server';
const OPENID_CONFIGURATION_PATH = '/.well-known/openid-configuration';
export const REGISTER_PATH = '/register';
export const AUTHORIZE_PATH = '/authorize';
export const TOKEN_PATH = '/token';

/** Who an admitted request acts as. `scopes` is already narrowed to what the member holds right now. */
export interface Principal {
  memberId: string;
  name: string;
  email: string | null;
  scopes: McpScope[];
}

function b64url(buffer: Buffer): string {
  return buffer.toString('base64url');
}

/** `kind.payload.mac` — the kind is inside the MAC, so a client id can never be replayed as a token. */
export class Signer {
  private readonly codeKey: Buffer;

  constructor(private readonly key: Buffer) {
    this.codeKey = createHmac('sha256', key).update(`authorization-code:${randomBytes(16).toString('hex')}`).digest();
  }

  private keyFor(kind: string): Buffer {
    return kind === 'code' ? this.codeKey : this.key;
  }

  sign(kind: string, payload: object): string {
    const body = b64url(Buffer.from(JSON.stringify(payload), 'utf8'));
    const mac = createHmac('sha256', this.keyFor(kind)).update(`${kind}.${body}`).digest();
    return `${kind}.${body}.${b64url(mac)}`;
  }

  verify<T>(kind: string, token: string): T | undefined {
    const parts = token.split('.');
    if (parts.length !== 3 || parts[0] !== kind) return undefined;
    const expected = createHmac('sha256', this.keyFor(kind)).update(`${kind}.${parts[1]}`).digest();
    const actual = Buffer.from(parts[2]!, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return undefined;
    try {
      return JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8')) as T;
    } catch {
      return undefined;
    }
  }
}

interface ClientPayload {
  /** Registered redirect URIs. */
  r: string[];
  /** Client name, as the client registered it — display only. */
  n?: string;
}

interface CodePayload {
  /** SHA-256 of the client id the code was issued to. */
  c: string;
  r: string;
  /** PKCE S256 challenge. */
  cc: string;
  rs: string;
  m: string;
  s: McpScope[];
  /** Expiry, seconds since the epoch. */
  x: number;
  /** Single-use nonce. */
  n: string;
}

interface TokenPayload {
  m: string;
  s: McpScope[];
  rs: string;
  x: number;
}

/** Five failures per address per fifteen minutes; an address over the limit is refused for the rest of its window. */
export class FailureThrottle {
  private readonly windows = new Map<string, { start: number; failures: number }>();

  constructor(private readonly now: () => Date) {}

  blocked(address: string): boolean {
    const entry = this.windows.get(address);
    if (entry === undefined) return false;
    if (this.now().getTime() - entry.start >= THROTTLE_WINDOW_MS) {
      this.windows.delete(address);
      return false;
    }
    return entry.failures >= THROTTLE_MAX_FAILURES;
  }

  fail(address: string): void {
    const now = this.now().getTime();
    const entry = this.windows.get(address);
    if (entry === undefined || now - entry.start >= THROTTLE_WINDOW_MS) this.windows.set(address, { start: now, failures: 1 });
    else entry.failures += 1;
  }
}

function isLoopbackAddress(address: string | undefined): boolean {
  if (address === undefined) return false;
  return address === '::1' || address.startsWith('127.') || address.startsWith('::ffff:127.');
}

/**
 * design.md D3: the socket's peer, unless the operator declared a proxy in
 * front (`--trust-proxy`) and the peer is loopback — then the rightmost
 * `X-Forwarded-For` entry, the address the proxy itself saw. Without the
 * flag the header is ignored, so no caller can choose its own address.
 */
export function clientAddress(req: IncomingMessage, trustProxy: boolean): string {
  const peer = req.socket.remoteAddress ?? 'unknown';
  if (!trustProxy || !isLoopbackAddress(peer)) return peer;
  const header = req.headers['x-forwarded-for'];
  const value = Array.isArray(header) ? header.join(',') : header;
  const hops = (value ?? '')
    .split(',')
    .map((h) => h.trim())
    .filter((h) => h.length > 0);
  return hops.at(-1) ?? peer;
}

export interface OAuthOptions {
  /** The public origin clients reach, without a trailing slash: the issuer. */
  issuer: string;
  /** The `/mcp` endpoint's absolute URL: the one resource tokens are bound to. */
  resource: string;
  members: MemberRegistry;
  signer: Signer;
  now(): Date;
  trustProxy: boolean;
  /** Renders the authorisation page (templates/mcp/authorize.html). */
  renderAuthorizePage(view: AuthorizePageView): Promise<string>;
}

export interface AuthorizePageView {
  clientName: string;
  hiddenFields: Record<string, string>;
  error: string | null;
}

/** The OAuth endpoints plus the per-process state single-use codes and throttling need. */
export class AuthorizationServer {
  private readonly spentCodes = new Map<string, number>();
  private readonly throttle: FailureThrottle;

  constructor(private readonly options: OAuthOptions) {
    this.throttle = new FailureThrottle(options.now);
  }

  private nowSeconds(): number {
    return Math.floor(this.options.now().getTime() / 1000);
  }

  get protectedResourceMetadataUrl(): string {
    return `${this.options.issuer}${PROTECTED_RESOURCE_METADATA_PATH}/mcp`;
  }

  protectedResourceMetadata(): Record<string, unknown> {
    return {
      resource: this.options.resource,
      authorization_servers: [this.options.issuer],
      scopes_supported: [...MCP_SCOPES],
      bearer_methods_supported: ['header'],
      resource_name: 'contexture store',
    };
  }

  authorizationServerMetadata(): Record<string, unknown> {
    const issuer = this.options.issuer;
    return {
      issuer,
      authorization_endpoint: `${issuer}${AUTHORIZE_PATH}`,
      token_endpoint: `${issuer}${TOKEN_PATH}`,
      registration_endpoint: `${issuer}${REGISTER_PATH}`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: [...MCP_SCOPES],
      authorization_response_iss_parameter_supported: true,
    };
  }

  /** Handles every OAuth path; returns false for anything else. */
  async handle(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<boolean> {
    const method = req.method ?? 'GET';
    const isOAuthPath =
      pathname === PROTECTED_RESOURCE_METADATA_PATH ||
      pathname === `${PROTECTED_RESOURCE_METADATA_PATH}/mcp` ||
      pathname === AUTHORIZATION_SERVER_METADATA_PATH ||
      pathname === OPENID_CONFIGURATION_PATH ||
      pathname === REGISTER_PATH ||
      pathname === AUTHORIZE_PATH ||
      pathname === TOKEN_PATH;
    if (!isOAuthPath) return false;

    // Browser-based clients (the MCP inspector) read metadata and call
    // registration and the token endpoint cross-origin; none of these use
    // cookies, so a wildcard origin grants nothing a direct request lacks.
    const cors: Record<string, string> = pathname === AUTHORIZE_PATH ? {} : { 'Access-Control-Allow-Origin': '*' };
    if (method === 'OPTIONS' && pathname !== AUTHORIZE_PATH) {
      res.writeHead(204, {
        ...cors,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, MCP-Protocol-Version',
        'Access-Control-Max-Age': '86400',
      });
      res.end();
      return true;
    }

    try {
      if (pathname.startsWith('/.well-known/')) {
        if (method !== 'GET') return methodNotAllowed(res, 'GET');
        const body = pathname.startsWith(PROTECTED_RESOURCE_METADATA_PATH) ? this.protectedResourceMetadata() : this.authorizationServerMetadata();
        sendJson(res, 200, body, cors);
        return true;
      }
      if (pathname === REGISTER_PATH) {
        if (method !== 'POST') return methodNotAllowed(res, 'POST');
        await this.register(req, res, cors);
        return true;
      }
      if (pathname === AUTHORIZE_PATH) {
        if (method === 'GET') await this.authorizeForm(new URL(req.url ?? '/', 'http://localhost').searchParams, res);
        else if (method === 'POST') await this.authorizeSubmit(req, res);
        else return methodNotAllowed(res, 'GET, POST');
        return true;
      }
      if (method !== 'POST') return methodNotAllowed(res, 'POST');
      await this.token(req, res, cors);
      return true;
    } catch (err) {
      if (err instanceof BodyTooLargeError) {
        sendText(res, 413, `${err.message}\n`);
        return true;
      }
      throw err;
    }
  }

  // ---- registration (RFC 7591), stateless --------------------------------

  private async register(req: IncomingMessage, res: ServerResponse, cors: Record<string, string>): Promise<void> {
    let body: unknown;
    try {
      body = JSON.parse(await readBody(req, MAX_FORM_BYTES));
    } catch (err) {
      if (err instanceof BodyTooLargeError) throw err;
      sendJson(res, 400, { error: 'invalid_client_metadata', error_description: 'The registration body is not JSON.' }, cors);
      return;
    }
    const metadata = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
    const uris = metadata.redirect_uris;
    if (!Array.isArray(uris) || uris.length === 0 || uris.length > MAX_REDIRECT_URIS || !uris.every((u) => typeof u === 'string' && acceptableRedirectUri(u))) {
      sendJson(res, 400, { error: 'invalid_redirect_uri', error_description: `Register 1–${MAX_REDIRECT_URIS} absolute redirect URIs: https, loopback http, or an application scheme.` }, cors);
      return;
    }
    const grantTypes = metadata.grant_types;
    if (Array.isArray(grantTypes) && !grantTypes.includes('authorization_code')) {
      sendJson(res, 400, { error: 'invalid_client_metadata', error_description: 'This server grants authorization_code only.' }, cors);
      return;
    }
    const name = typeof metadata.client_name === 'string' ? metadata.client_name.slice(0, 100) : undefined;
    const payload: ClientPayload = { r: uris as string[], ...(name ? { n: name } : {}) };
    const clientId = this.options.signer.sign('client', payload);
    sendJson(
      res,
      201,
      {
        client_id: clientId,
        client_id_issued_at: this.nowSeconds(),
        redirect_uris: payload.r,
        ...(name ? { client_name: name } : {}),
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code'],
        response_types: ['code'],
      },
      cors,
    );
  }

  // ---- authorization ------------------------------------------------------

  /**
   * Validates an authorisation request. Until the client and redirect URI
   * are known good, an error is shown on the page and never redirected —
   * redirecting to an unverified URI is how an open redirector is built.
   */
  private validateAuthorizeRequest(params: URLSearchParams):
    | { kind: 'fatal'; message: string }
    | { kind: 'redirect-error'; redirectUri: string; state: string | null; error: string; description: string }
    | { kind: 'ok'; request: AuthorizeRequest } {
    const clientId = params.get('client_id') ?? '';
    const client = this.options.signer.verify<ClientPayload>('client', clientId);
    if (client === undefined || !Array.isArray(client.r)) return { kind: 'fatal', message: 'This sign-in link names a client this server never registered. Start the connection again from your app.' };

    const requestedRedirect = params.get('redirect_uri');
    const redirectUri = requestedRedirect ?? (client.r.length === 1 ? client.r[0]! : '');
    if (!client.r.includes(redirectUri)) return { kind: 'fatal', message: 'This sign-in link names a redirect address the client did not register.' };

    const state = params.get('state');
    const fail = (error: string, description: string) => ({ kind: 'redirect-error' as const, redirectUri, state, error, description });

    if (params.get('response_type') !== 'code') return fail('unsupported_response_type', 'Only response_type=code is supported.');
    const challenge = params.get('code_challenge') ?? '';
    if (params.get('code_challenge_method') !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(challenge)) {
      return fail('invalid_request', 'PKCE with code_challenge_method=S256 is required.');
    }
    const resource = params.get('resource');
    if (resource !== null && !sameResource(resource, this.options.resource)) return fail('invalid_target', `This server issues tokens only for ${this.options.resource}.`);

    let requestedScopes: McpScope[] | null = null;
    const scope = params.get('scope');
    if (scope !== null && scope.trim().length > 0) {
      requestedScopes = MCP_SCOPES.filter((s) => scope.split(/\s+/).includes(s));
      if (requestedScopes.length === 0) return fail('invalid_scope', `Request any of: ${MCP_SCOPES.join(' ')}.`);
    }

    return {
      kind: 'ok',
      request: { clientId, clientName: client.n ?? 'Your app', redirectUri, state, challenge, scopes: requestedScopes },
    };
  }

  private hiddenFieldsFor(params: URLSearchParams): Record<string, string> {
    const fields: Record<string, string> = {};
    for (const key of ['response_type', 'client_id', 'redirect_uri', 'code_challenge', 'code_challenge_method', 'state', 'scope', 'resource']) {
      const value = params.get(key);
      if (value !== null) fields[key] = value;
    }
    return fields;
  }

  private async authorizeForm(params: URLSearchParams, res: ServerResponse): Promise<void> {
    const verdict = this.validateAuthorizeRequest(params);
    if (verdict.kind === 'fatal') return sendText(res, 400, `${verdict.message}\n`);
    if (verdict.kind === 'redirect-error') return redirectWithError(res, verdict, this.options.issuer);
    await this.sendPage(res, 200, { clientName: verdict.request.clientName, hiddenFields: this.hiddenFieldsFor(params), error: null });
  }

  private async authorizeSubmit(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const params = new URLSearchParams(await readBody(req, MAX_FORM_BYTES));
    const verdict = this.validateAuthorizeRequest(params);
    if (verdict.kind === 'fatal') return sendText(res, 400, `${verdict.message}\n`);
    if (verdict.kind === 'redirect-error') return redirectWithError(res, verdict, this.options.issuer);
    const request = verdict.request;
    const view = (error: string): AuthorizePageView => ({ clientName: request.clientName, hiddenFields: this.hiddenFieldsFor(params), error });

    const address = clientAddress(req, this.options.trustProxy);
    if (this.throttle.blocked(address)) {
      return this.sendPage(res, 429, view('Too many wrong codes. Wait fifteen minutes, then try again.'));
    }
    const member = await this.options.members.byCode(params.get('access_code') ?? '');
    if (member === undefined) {
      this.throttle.fail(address);
      return this.sendPage(res, 401, view('That access code is not recognised. Check it with whoever runs this store.'));
    }

    const scopes = request.scopes === null ? member.scopes : member.scopes.filter((s) => request.scopes!.includes(s));
    if (scopes.length === 0) {
      return redirectWithError(res, { redirectUri: request.redirectUri, state: request.state, error: 'invalid_scope', description: 'You do not hold any of the requested scopes.' }, this.options.issuer);
    }
    const code = this.options.signer.sign('code', {
      c: digest(request.clientId),
      r: request.redirectUri,
      cc: request.challenge,
      rs: this.options.resource,
      m: member.id,
      s: scopes,
      x: this.nowSeconds() + AUTHORIZATION_CODE_TTL_SECONDS,
      n: randomBytes(16).toString('hex'),
    } satisfies CodePayload);
    const target = new URL(request.redirectUri);
    target.searchParams.set('code', code);
    if (request.state !== null) target.searchParams.set('state', request.state);
    target.searchParams.set('iss', this.options.issuer);
    res.writeHead(302, { Location: target.toString(), 'Cache-Control': 'no-store' });
    res.end();
  }

  private async sendPage(res: ServerResponse, status: number, view: AuthorizePageView): Promise<void> {
    const html = await this.options.renderAuthorizePage(view);
    const buffer = Buffer.from(html, 'utf8');
    res.writeHead(status, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': buffer.length,
      'Cache-Control': 'no-store',
      // The page is the one place a member types a secret: never framed, never scripted.
      'X-Frame-Options': 'DENY',
      // No form-action: browsers apply it to the redirect that follows the submit, which must reach the client's own callback.
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
      'Referrer-Policy': 'no-referrer',
    });
    res.end(buffer);
  }

  // ---- token endpoint -----------------------------------------------------

  private async token(req: IncomingMessage, res: ServerResponse, cors: Record<string, string>): Promise<void> {
    const text = await readBody(req, MAX_FORM_BYTES);
    const contentType = req.headers['content-type'] ?? '';
    let params: URLSearchParams;
    if (contentType.includes('application/json')) {
      try {
        params = new URLSearchParams(Object.entries(JSON.parse(text) as Record<string, unknown>).map(([k, v]): [string, string] => [k, String(v)]));
      } catch {
        return sendJson(res, 400, { error: 'invalid_request', error_description: 'The token request body is not JSON.' }, cors);
      }
    } else {
      params = new URLSearchParams(text);
    }
    const refuse = (error: string, description: string, status = 400) => sendJson(res, status, { error, error_description: description }, cors);

    if (params.get('grant_type') !== 'authorization_code') return refuse('unsupported_grant_type', 'Only grant_type=authorization_code is supported.');
    const code = this.options.signer.verify<CodePayload>('code', params.get('code') ?? '');
    if (code === undefined || code.x <= this.nowSeconds()) return refuse('invalid_grant', 'The authorization code is invalid or has expired.');

    // Spent before any other check and before any await: two redemptions
    // racing for one code cannot both get past this line.
    this.pruneSpent();
    if (this.spentCodes.has(code.n)) return refuse('invalid_grant', 'The authorization code has already been used.');
    this.spentCodes.set(code.n, code.x);

    const clientId = params.get('client_id');
    if (clientId === null || digest(clientId) !== code.c) return refuse('invalid_grant', 'The authorization code was issued to another client.');
    if (params.get('redirect_uri') !== null && params.get('redirect_uri') !== code.r) return refuse('invalid_grant', 'redirect_uri does not match the authorization request.');
    const verifier = params.get('code_verifier') ?? '';
    if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) || b64url(createHash('sha256').update(verifier).digest()) !== code.cc) {
      return refuse('invalid_grant', 'The PKCE code_verifier does not match the code_challenge.');
    }
    const resource = params.get('resource');
    if (resource !== null && !sameResource(resource, code.rs)) return refuse('invalid_target', `This server issues tokens only for ${code.rs}.`);

    const member = await this.options.members.byId(code.m);
    if (member === undefined) return refuse('invalid_grant', 'The member this code was issued to no longer exists.');
    const scopes = code.s.filter((s) => member.scopes.includes(s));
    if (scopes.length === 0) return refuse('invalid_scope', 'The member no longer holds any of the granted scopes.');

    const accessToken = this.options.signer.sign('token', { m: member.id, s: scopes, rs: code.rs, x: this.nowSeconds() + ACCESS_TOKEN_TTL_SECONDS } satisfies TokenPayload);
    sendJson(res, 200, { access_token: accessToken, token_type: 'Bearer', expires_in: ACCESS_TOKEN_TTL_SECONDS, scope: scopes.join(' ') }, { ...cors, Pragma: 'no-cache' });
  }

  private pruneSpent(): void {
    const now = this.nowSeconds();
    for (const [nonce, expiry] of this.spentCodes) if (expiry <= now) this.spentCodes.delete(nonce);
  }

  // ---- bearer verification --------------------------------------------------

  /** remote-access spec, *Admission is decided by the operator and denied by default*. */
  async authenticate(req: IncomingMessage): Promise<Authentication<Principal>> {
    const header = req.headers.authorization ?? '';
    const match = /^Bearer\s+(\S+)$/i.exec(header);
    const challenge = (error?: string): Record<string, string> => ({
      'WWW-Authenticate': `Bearer resource_metadata="${this.protectedResourceMetadataUrl}"${error ? `, error="${error}"` : ''}`,
    });
    if (match === null) {
      return { kind: 'refused', status: 401, headers: challenge(), body: { error: 'invalid_token', error_description: 'This store needs you to sign in.' } };
    }
    const principal = await this.principalFor(match[1]!);
    if (principal === undefined) {
      return { kind: 'refused', status: 401, headers: challenge('invalid_token'), body: { error: 'invalid_token', error_description: 'The token is invalid, expired, or its member was removed.' } };
    }
    return { kind: 'admitted', principal };
  }

  /** Verifies a token and narrows its scopes to what the member holds now; undefined when it no longer admits anyone. */
  async principalFor(token: string): Promise<Principal | undefined> {
    const payload = this.options.signer.verify<TokenPayload>('token', token);
    if (payload === undefined || payload.x <= this.nowSeconds() || !sameResource(payload.rs, this.options.resource)) return undefined;
    const member = await this.options.members.byId(payload.m);
    if (member === undefined) return undefined;
    return principalOf(member, payload.s);
  }
}

export function principalOf(member: Member, granted: readonly McpScope[]): Principal {
  return { memberId: member.id, name: member.name, email: member.email ?? null, scopes: member.scopes.filter((s) => granted.includes(s)) };
}

interface AuthorizeRequest {
  clientId: string;
  clientName: string;
  redirectUri: string;
  state: string | null;
  challenge: string;
  scopes: McpScope[] | null;
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 32);
}

function sameResource(a: string, b: string): boolean {
  return a.replace(/\/+$/, '') === b.replace(/\/+$/, '');
}

const FORBIDDEN_SCHEMES = new Set(['javascript:', 'data:', 'file:', 'vbscript:', 'blob:']);

function acceptableRedirectUri(uri: string): boolean {
  if (uri.length > MAX_REDIRECT_URI_LENGTH) return false;
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return false;
  }
  if (parsed.hash !== '') return false;
  if (FORBIDDEN_SCHEMES.has(parsed.protocol)) return false;
  if (parsed.protocol === 'http:') return ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  return true;
}

function redirectWithError(
  res: ServerResponse,
  verdict: { redirectUri: string; state: string | null; error: string; description: string },
  issuer: string,
): void {
  const target = new URL(verdict.redirectUri);
  target.searchParams.set('error', verdict.error);
  target.searchParams.set('error_description', verdict.description);
  if (verdict.state !== null) target.searchParams.set('state', verdict.state);
  target.searchParams.set('iss', issuer);
  res.writeHead(302, { Location: target.toString(), 'Cache-Control': 'no-store' });
  res.end();
}

function methodNotAllowed(res: ServerResponse, allow: string): true {
  sendText(res, 405, 'method not allowed\n', { Allow: allow });
  return true;
}
