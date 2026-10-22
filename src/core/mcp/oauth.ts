import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { McpConfig } from '../../config/schema.js';
import type { IdentityVerifier } from '../approval/identity.js';
import { BodyTooLargeError, readBody, sendJson, sendText, type Authentication } from './http.js';
import { MCP_SCOPES, scopesFor, type McpScope } from './members.js';

/**
 * serve-the-store-over-mcp design.md D4–D5: `ctxr serve` is the OAuth 2.1
 * authorisation server for its own `/mcp`, and it stores nothing it issues.
 * Client ids, authorisation codes and access tokens are HMAC-signed payloads.
 * Who may sign in is decided by the access proxy's verified identity — the
 * assertion `change_approval.identity` configures, checked on every
 * `/authorize` request exactly as the approval routes check it — and by the
 * `mcp` block the server last loaded, consulted again on every `/mcp`
 * request, so removing someone there refuses their next call.
 */

export const ACCESS_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
export const AUTHORIZATION_CODE_TTL_SECONDS = 10 * 60;
const MAX_FORM_BYTES = 64 * 1024;
const MAX_REDIRECT_URIS = 10;
const MAX_REDIRECT_URI_LENGTH = 2000;

export const PROTECTED_RESOURCE_METADATA_PATH = '/.well-known/oauth-protected-resource';
export const AUTHORIZATION_SERVER_METADATA_PATH = '/.well-known/oauth-authorization-server';
export const OPENID_CONFIGURATION_PATH = '/.well-known/openid-configuration';
export const REGISTER_PATH = '/register';
export const AUTHORIZE_PATH = '/authorize';
export const TOKEN_PATH = '/token';

/** Every path the OAuth side of the MCP surface answers. */
export const OAUTH_PATHS: readonly string[] = [
  PROTECTED_RESOURCE_METADATA_PATH,
  `${PROTECTED_RESOURCE_METADATA_PATH}/mcp`,
  AUTHORIZATION_SERVER_METADATA_PATH,
  OPENID_CONFIGURATION_PATH,
  REGISTER_PATH,
  AUTHORIZE_PATH,
  TOKEN_PATH,
];

/** Who an admitted `/mcp` request acts as. `scopes` is already narrowed to what the email holds right now. */
export interface Principal {
  email: string;
  scopes: McpScope[];
}

function b64url(buffer: Buffer): string {
  return buffer.toString('base64url');
}

/**
 * `kind.payload.mac`, the kind inside the MAC so a client id can never be
 * replayed as a token. Authorisation codes are signed under a key that mixes
 * in a per-process nonce: a restart invalidates outstanding codes instead of
 * forgetting which were spent (design.md D5).
 */
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
  e: string;
  s: McpScope[];
  /** Expiry, seconds since the epoch. */
  x: number;
  /** Single-use nonce. */
  n: string;
}

interface TokenPayload {
  e: string;
  s: McpScope[];
  rs: string;
  x: number;
}

export interface ConsentPageView {
  clientName: string;
  redirectHost: string;
  email: string;
  scopes: McpScope[];
  hiddenFields: Record<string, string>;
}

export interface OAuthOptions {
  /** The origin of `serve.base_url`: the issuer, and the only `Origin` a consent `POST` may carry. */
  issuer: string;
  /** `<issuer>/mcp`: the one resource tokens are bound to. */
  resource: string;
  /** `change_approval.identity.header`. */
  identityHeader: string;
  verifier: IdentityVerifier;
  /** The `mcp` block of the configuration the server last loaded. */
  mcp(): McpConfig | undefined;
  signer: Signer;
  /** Nonces of redeemed codes, kept by the server across configuration reloads. */
  spentCodes: Map<string, number>;
  now(): Date;
  renderConsentPage(view: ConsentPageView): Promise<string>;
  /** One line per registration attempt: what the client asked for and the outcome, never a secret. */
  log?(line: string): void;
}

interface AuthorizeRequest {
  clientId: string;
  clientName: string;
  redirectUri: string;
  state: string | null;
  challenge: string;
  scopes: McpScope[] | null;
}

type AuthorizeVerdict =
  | { kind: 'fatal'; message: string }
  | { kind: 'redirect-error'; redirectUri: string; state: string | null; error: string; description: string }
  | { kind: 'ok'; request: AuthorizeRequest };

type MemberVerdict = { kind: 'member'; email: string; scopes: McpScope[] } | { kind: 'refused'; status: number; message: string } | { kind: 'no-scope' };

/** The OAuth endpoints of the MCP surface. Built per request from the loaded configuration; holds no state of its own. */
export class AuthorizationServer {
  constructor(private readonly options: OAuthOptions) {}

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
    if (!OAUTH_PATHS.includes(pathname)) return false;
    const method = req.method ?? 'GET';

    // Browser-based clients (the MCP inspector) read metadata and call registration and the token
    // endpoint cross-origin; none of them use cookies, so a wildcard origin grants nothing a direct request lacks.
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
        if (method !== 'GET' && method !== 'HEAD') return methodNotAllowed(res, 'GET');
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
        if (method === 'GET' || method === 'HEAD') await this.authorizeForm(req, res);
        else if (method === 'POST') await this.authorizeConfirm(req, res);
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
    const hosts = Array.isArray(uris) ? uris.map((u) => { try { return new URL(String(u)).host || String(u); } catch { return String(u).slice(0, 60); } }) : [];
    this.options.log?.(
      `mcp register "${String(metadata.client_name ?? '').slice(0, 60)}" auth=${String(metadata.token_endpoint_auth_method ?? '-')} ` +
        `grants=${Array.isArray(metadata.grant_types) ? metadata.grant_types.join(',') : '-'} redirects=${hosts.join(',') || '-'}`,
    );
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
    sendJson(
      res,
      201,
      {
        client_id: this.options.signer.sign('client', payload),
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

  // ---- authorization --------------------------------------------------------

  /**
   * Until the client and redirect URI are known good, an error is shown and
   * never redirected — redirecting to an unverified URI is how an open
   * redirector is built.
   */
  private validateAuthorizeRequest(params: URLSearchParams): AuthorizeVerdict {
    const clientId = params.get('client_id') ?? '';
    const client = this.options.signer.verify<ClientPayload>('client', clientId);
    if (client === undefined || !Array.isArray(client.r)) {
      return { kind: 'fatal', message: 'This sign-in link names a client this store never registered. Start connecting again from your app.' };
    }
    const requestedRedirect = params.get('redirect_uri');
    const redirectUri = requestedRedirect ?? (client.r.length === 1 ? client.r[0]! : '');
    if (!client.r.includes(redirectUri)) return { kind: 'fatal', message: 'This sign-in link names a redirect address the client did not register.' };

    const state = params.get('state');
    const fail = (error: string, description: string): AuthorizeVerdict => ({ kind: 'redirect-error', redirectUri, state, error, description });

    if (params.get('response_type') !== 'code') return fail('unsupported_response_type', 'Only response_type=code is supported.');
    const challenge = params.get('code_challenge') ?? '';
    if (params.get('code_challenge_method') !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(challenge)) {
      return fail('invalid_request', 'PKCE with code_challenge_method=S256 is required.');
    }
    const resource = params.get('resource');
    if (resource !== null && !sameResource(resource, this.options.resource)) return fail('invalid_target', `This server issues tokens only for ${this.options.resource}.`);

    let requested: McpScope[] | null = null;
    const scope = params.get('scope');
    if (scope !== null && scope.trim().length > 0) {
      const words = scope.split(/\s+/);
      const known = MCP_SCOPES.filter((s) => words.includes(s));
      if (known.length === 0) return fail('invalid_scope', `Request any of: ${MCP_SCOPES.join(' ')}.`);
      requested = known;
    }
    return { kind: 'ok', request: { clientId, clientName: client.n ?? 'An app', redirectUri, state, challenge, scopes: requested } };
  }

  /** The verified member and the scopes this request would grant, or why there is none. */
  private async member(req: IncomingMessage, request: AuthorizeRequest): Promise<MemberVerdict> {
    const verified = await this.options.verifier.verify(req.headers[this.options.identityHeader.toLowerCase()]);
    if (!verified.ok) return { kind: 'refused', status: 401, message: 'Open this page through the store’s sign-in (its access proxy), then try connecting again.' };
    const held = scopesFor(verified.email, this.options.mcp());
    if (held.length === 0) return { kind: 'refused', status: 403, message: `${verified.email} may not connect apps to this store. Ask whoever runs it to add you.` };
    const requested = request.scopes;
    const scopes = requested === null ? held : held.filter((s) => requested.includes(s));
    return scopes.length === 0 ? { kind: 'no-scope' } : { kind: 'member', email: verified.email, scopes };
  }

  private hiddenFieldsFor(params: URLSearchParams): Record<string, string> {
    const fields: Record<string, string> = {};
    for (const key of ['response_type', 'client_id', 'redirect_uri', 'code_challenge', 'code_challenge_method', 'state', 'scope', 'resource']) {
      const value = params.get(key);
      if (value !== null) fields[key] = value;
    }
    return fields;
  }

  private async authorizeForm(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const params = new URL(req.url ?? '/', 'http://localhost').searchParams;
    const verdict = this.validateAuthorizeRequest(params);
    if (verdict.kind === 'fatal') return sendText(res, 400, `${verdict.message}\n`);
    if (verdict.kind === 'redirect-error') return redirectWithError(res, verdict, this.options.issuer);
    const who = await this.member(req, verdict.request);
    if (who.kind === 'refused') return sendText(res, who.status, `${who.message}\n`);
    if (who.kind === 'no-scope') return redirectWithError(res, { ...verdict.request, error: 'invalid_scope', description: 'You hold none of the requested scopes.' }, this.options.issuer);
    const html = await this.options.renderConsentPage({
      clientName: verdict.request.clientName,
      redirectHost: new URL(verdict.request.redirectUri).host || verdict.request.redirectUri,
      email: who.email,
      scopes: who.scopes,
      hiddenFields: this.hiddenFieldsFor(params),
    });
    sendPage(res, html);
  }

  /** The member's confirmation: only from a page this server rendered (`Origin`), only for a verified member. */
  private async authorizeConfirm(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.headers.origin !== this.options.issuer) return sendText(res, 403, 'This confirmation did not come from this store’s own page.\n');
    const params = new URLSearchParams(await readBody(req, MAX_FORM_BYTES));
    const verdict = this.validateAuthorizeRequest(params);
    if (verdict.kind === 'fatal') return sendText(res, 400, `${verdict.message}\n`);
    if (verdict.kind === 'redirect-error') return redirectWithError(res, verdict, this.options.issuer);
    const request = verdict.request;
    const who = await this.member(req, request);
    if (who.kind === 'refused') return sendText(res, who.status, `${who.message}\n`);
    if (who.kind === 'no-scope') return redirectWithError(res, { ...request, error: 'invalid_scope', description: 'You hold none of the requested scopes.' }, this.options.issuer);
    if (params.get('decision') !== 'allow') {
      return redirectWithError(res, { ...request, error: 'access_denied', description: 'The member declined to connect this app.' }, this.options.issuer);
    }

    const code = this.options.signer.sign('code', {
      c: digest(request.clientId),
      r: request.redirectUri,
      cc: request.challenge,
      rs: this.options.resource,
      e: who.email,
      s: who.scopes,
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

  // ---- token endpoint -------------------------------------------------------

  private async token(req: IncomingMessage, res: ServerResponse, cors: Record<string, string>): Promise<void> {
    const text = await readBody(req, MAX_FORM_BYTES);
    let params: URLSearchParams;
    if ((req.headers['content-type'] ?? '').includes('application/json')) {
      try {
        params = new URLSearchParams(Object.entries(JSON.parse(text) as Record<string, unknown>).map(([k, v]): [string, string] => [k, String(v)]));
      } catch {
        return sendJson(res, 400, { error: 'invalid_request', error_description: 'The token request body is not JSON.' }, cors);
      }
    } else {
      params = new URLSearchParams(text);
    }
    const refuse = (error: string, description: string) => sendJson(res, 400, { error, error_description: description }, cors);

    if (params.get('grant_type') !== 'authorization_code') return refuse('unsupported_grant_type', 'Only grant_type=authorization_code is supported.');
    const code = this.options.signer.verify<CodePayload>('code', params.get('code') ?? '');
    if (code === undefined || code.x <= this.nowSeconds()) return refuse('invalid_grant', 'The authorization code is invalid or has expired.');

    // Spent before any other check and before any await: two redemptions racing for one code cannot both pass.
    this.pruneSpent();
    if (this.options.spentCodes.has(code.n)) return refuse('invalid_grant', 'The authorization code has already been used.');
    this.options.spentCodes.set(code.n, code.x);

    const clientId = params.get('client_id');
    if (clientId === null || digest(clientId) !== code.c) return refuse('invalid_grant', 'The authorization code was issued to another client.');
    if (params.get('redirect_uri') !== null && params.get('redirect_uri') !== code.r) return refuse('invalid_grant', 'redirect_uri does not match the authorization request.');
    const verifier = params.get('code_verifier') ?? '';
    if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) || b64url(createHash('sha256').update(verifier).digest()) !== code.cc) {
      return refuse('invalid_grant', 'The PKCE code_verifier does not match the code_challenge.');
    }
    const resource = params.get('resource');
    if (resource !== null && !sameResource(resource, code.rs)) return refuse('invalid_target', `This server issues tokens only for ${code.rs}.`);

    const held = scopesFor(code.e, this.options.mcp());
    const scopes = code.s.filter((s) => held.includes(s));
    if (scopes.length === 0) return refuse('invalid_grant', 'The member this code was issued to may no longer connect.');

    const accessToken = this.options.signer.sign('token', { e: code.e, s: scopes, rs: code.rs, x: this.nowSeconds() + ACCESS_TOKEN_TTL_SECONDS } satisfies TokenPayload);
    sendJson(res, 200, { access_token: accessToken, token_type: 'Bearer', expires_in: ACCESS_TOKEN_TTL_SECONDS, scope: scopes.join(' ') }, { ...cors, Pragma: 'no-cache' });
  }

  private pruneSpent(): void {
    const now = this.nowSeconds();
    for (const [nonce, expiry] of this.options.spentCodes) if (expiry <= now) this.options.spentCodes.delete(nonce);
  }

  // ---- bearer verification ----------------------------------------------------

  /** remote-access spec: every `/mcp` request carries a token this server issued, narrowed to what its email holds now. */
  async authenticate(req: IncomingMessage): Promise<Authentication<Principal>> {
    const match = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? '');
    const challenge = (error?: string): Record<string, string> => ({
      'WWW-Authenticate': `Bearer resource_metadata="${this.protectedResourceMetadataUrl}"${error ? `, error="${error}"` : ''}`,
    });
    if (match === null) {
      return { kind: 'refused', status: 401, headers: challenge(), body: { error: 'invalid_token', error_description: 'This store needs you to sign in.' } };
    }
    const principal = this.principalFor(match[1]!);
    if (principal === undefined) {
      return { kind: 'refused', status: 401, headers: challenge('invalid_token'), body: { error: 'invalid_token', error_description: 'The token is invalid or expired, or its member may no longer connect.' } };
    }
    return { kind: 'admitted', principal };
  }

  principalFor(token: string): Principal | undefined {
    const payload = this.options.signer.verify<TokenPayload>('token', token);
    if (payload === undefined || payload.x <= this.nowSeconds() || !sameResource(payload.rs, this.options.resource)) return undefined;
    const held = scopesFor(payload.e, this.options.mcp());
    const scopes = payload.s.filter((s) => held.includes(s));
    return scopes.length === 0 ? undefined : { email: payload.e, scopes };
  }
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
  if (parsed.hash !== '' || FORBIDDEN_SCHEMES.has(parsed.protocol)) return false;
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

/** The consent page: never framed, never scripted, never cached. */
function sendPage(res: ServerResponse, html: string): void {
  const buffer = Buffer.from(html, 'utf8');
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': buffer.length,
    'Cache-Control': 'no-store',
    'X-Frame-Options': 'DENY',
    // No form-action: browsers apply it to the redirect that follows the submit, which must reach the client's callback.
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
    'Referrer-Policy': 'no-referrer',
  });
  res.end(buffer);
}

function methodNotAllowed(res: ServerResponse, allow: string): true {
  sendText(res, 405, 'method not allowed\n', { Allow: allow });
  return true;
}
