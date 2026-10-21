import { createPublicKey, verify, type KeyObject } from 'node:crypto';
import type { ChangeApprovalConfig } from '../../config/schema.js';

/**
 * change-approval spec ("Every approval route requires a verified identity
 * assertion", design.md D2): the signed token the access proxy in front of
 * `ctxr serve` forwards on every request, verified here for every request —
 * signature against the configured key set, then issuer, audience, expiry and
 * an email claim. It fails closed: a missing header, an unknown key, a key set
 * that cannot be fetched, or any claim out of line is a refusal, never a pass.
 *
 * Only RS256 and ES256, the algorithms access proxies sign with. `none` and
 * every HMAC algorithm are refused outright, so a token cannot choose to be
 * checked against a secret this server does not hold.
 */
export type IdentityResult = { ok: true; email: string } | { ok: false; reason: string };

export interface IdentityVerifier {
  verify(headerValue: string | string[] | undefined): Promise<IdentityResult>;
}

type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const ALGORITHMS: Readonly<Record<string, { hash: string; dsaEncoding?: 'ieee-p1363' }>> = {
  RS256: { hash: 'sha256' },
  ES256: { hash: 'sha256', dsaEncoding: 'ieee-p1363' },
};

/** Seconds of clock skew allowed on `exp` and `nbf`. */
const SKEW_SECONDS = 30;
/** An unknown key id re-fetches the key set at most this often, so a stream of forged ids cannot turn into a stream of fetches. */
const REFETCH_INTERVAL_MS = 10_000;

function decodeSegment(segment: string): unknown {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
}

export function createIdentityVerifier(
  identity: ChangeApprovalConfig['identity'],
  opts: { fetch?: FetchLike; now?: () => Date } = {},
): IdentityVerifier {
  const fetchImpl: FetchLike = opts.fetch ?? ((url) => fetch(url));
  const now = opts.now ?? (() => new Date());
  let keys = new Map<string, KeyObject>();
  let lastFetch = 0;

  async function refreshKeys(): Promise<void> {
    lastFetch = Date.now();
    const response = await fetchImpl(identity.jwks_url);
    if (!response.ok) throw new Error(`key set fetch answered ${response.status}`);
    const body = (await response.json()) as { keys?: Record<string, unknown>[] };
    const next = new Map<string, KeyObject>();
    for (const jwk of body.keys ?? []) {
      if (typeof jwk.kid !== 'string') continue;
      try {
        next.set(jwk.kid, createPublicKey({ key: jwk as never, format: 'jwk' }));
      } catch {
        // A key this runtime cannot read verifies nothing.
      }
    }
    keys = next;
  }

  async function keyFor(kid: string): Promise<KeyObject | null> {
    const known = keys.get(kid);
    if (known !== undefined) return known;
    if (Date.now() - lastFetch < REFETCH_INTERVAL_MS && keys.size > 0) return null;
    await refreshKeys();
    return keys.get(kid) ?? null;
  }

  return {
    async verify(headerValue) {
      const token = Array.isArray(headerValue) ? headerValue[0] : headerValue;
      if (token === undefined || token === '') return { ok: false, reason: 'no identity assertion' };
      const parts = token.split('.');
      if (parts.length !== 3) return { ok: false, reason: 'malformed assertion' };
      const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];

      let header: { alg?: unknown; kid?: unknown };
      let claims: Record<string, unknown>;
      try {
        header = decodeSegment(headerPart) as typeof header;
        claims = decodeSegment(payloadPart) as Record<string, unknown>;
      } catch {
        return { ok: false, reason: 'malformed assertion' };
      }
      const algorithm = typeof header.alg === 'string' ? ALGORITHMS[header.alg] : undefined;
      if (algorithm === undefined) return { ok: false, reason: 'unsupported signing algorithm' };
      if (typeof header.kid !== 'string') return { ok: false, reason: 'assertion names no key' };

      let key: KeyObject | null;
      try {
        key = await keyFor(header.kid);
      } catch (err) {
        return { ok: false, reason: `key set unavailable: ${err instanceof Error ? err.message : String(err)}` };
      }
      if (key === null) return { ok: false, reason: 'assertion signed by an unknown key' };

      const signed = Buffer.from(`${headerPart}.${payloadPart}`, 'utf8');
      const signature = Buffer.from(signaturePart, 'base64url');
      let valid = false;
      try {
        valid = verify(algorithm.hash, signed, algorithm.dsaEncoding ? { key, dsaEncoding: algorithm.dsaEncoding } : key, signature);
      } catch {
        valid = false;
      }
      if (!valid) return { ok: false, reason: 'signature does not verify' };

      if (claims.iss !== identity.issuer) return { ok: false, reason: 'wrong issuer' };
      const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
      if (!audiences.includes(identity.audience)) return { ok: false, reason: 'wrong audience' };
      const nowSeconds = now().getTime() / 1000;
      if (typeof claims.exp !== 'number' || claims.exp + SKEW_SECONDS < nowSeconds) return { ok: false, reason: 'expired' };
      if (typeof claims.nbf === 'number' && claims.nbf - SKEW_SECONDS > nowSeconds) return { ok: false, reason: 'not yet valid' };
      if (typeof claims.email !== 'string' || !/^[^@\s]+@[^@\s]+$/.test(claims.email)) return { ok: false, reason: 'no email claim' };
      return { ok: true, email: claims.email };
    },
  };
}
