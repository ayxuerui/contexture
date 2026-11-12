import { describe, expect, it } from 'vitest';
import { createIdentityVerifier } from '../../src/core/approval/identity.js';
import { makeTestSigner } from '../helpers/identity-keys.js';

const IDENTITY = { header: 'Cf-Access-Jwt-Assertion', issuer: 'https://ctx-a.example.test', audience: 'aud-1', jwks_url: 'https://ctx-a.example.test/certs' };
const CLAIMS = { iss: IDENTITY.issuer, aud: [IDENTITY.audience], email: 'a@example.com' };

function verifierFor(jwks: unknown) {
  let fetches = 0;
  const verifier = createIdentityVerifier(IDENTITY, {
    fetch: async () => {
      fetches += 1;
      return { ok: true, status: 200, json: async () => jwks };
    },
  });
  return { verifier, fetches: () => fetches };
}

describe('identity assertion verification', () => {
  const signer = makeTestSigner();

  it('accepts a well-signed assertion and yields its email', async () => {
    const { verifier } = verifierFor(signer.jwks);
    expect(await verifier.verify(signer.token(CLAIMS))).toEqual({ ok: true, email: 'a@example.com' });
  });

  it('refuses a missing header', async () => {
    const { verifier } = verifierFor(signer.jwks);
    expect(await verifier.verify(undefined)).toMatchObject({ ok: false });
    expect(await verifier.verify('')).toMatchObject({ ok: false });
  });

  it('refuses an assertion signed by a key outside the key set', async () => {
    const { verifier } = verifierFor(signer.jwks);
    const forger = makeTestSigner('key-1');
    expect(await verifier.verify(forger.token(CLAIMS))).toEqual({ ok: false, reason: 'signature does not verify' });
    const unknown = makeTestSigner('key-9');
    expect(await verifier.verify(unknown.token(CLAIMS))).toEqual({ ok: false, reason: 'assertion signed by an unknown key' });
  });

  it('refuses the wrong audience, the wrong issuer, an expired token, and a token with no email', async () => {
    const { verifier } = verifierFor(signer.jwks);
    expect(await verifier.verify(signer.token({ ...CLAIMS, aud: ['aud-2'] }))).toEqual({ ok: false, reason: 'wrong audience' });
    expect(await verifier.verify(signer.token({ ...CLAIMS, iss: 'https://other.example.test' }))).toEqual({ ok: false, reason: 'wrong issuer' });
    expect(await verifier.verify(signer.token({ ...CLAIMS, exp: Math.floor(Date.now() / 1000) - 3600 }))).toEqual({ ok: false, reason: 'expired' });
    expect(await verifier.verify(signer.token({ ...CLAIMS, email: undefined }))).toEqual({ ok: false, reason: 'no email claim' });
  });

  it('refuses unsigned and HMAC assertions', async () => {
    const { verifier } = verifierFor(signer.jwks);
    const [, payload] = signer.token(CLAIMS).split('.');
    const none = `${Buffer.from(JSON.stringify({ alg: 'none', kid: 'key-1' })).toString('base64url')}.${payload}.`;
    expect(await verifier.verify(none)).toEqual({ ok: false, reason: 'unsupported signing algorithm' });
    expect(await verifier.verify(signer.token(CLAIMS, { alg: 'HS256' }))).toEqual({ ok: false, reason: 'unsupported signing algorithm' });
  });

  it('fails closed when the key set cannot be fetched', async () => {
    const verifier = createIdentityVerifier(IDENTITY, { fetch: async () => ({ ok: false, status: 503, json: async () => ({}) }) });
    expect(await verifier.verify(signer.token(CLAIMS))).toMatchObject({ ok: false, reason: expect.stringContaining('key set unavailable') });
  });

  it('caches the key set by key id', async () => {
    const { verifier, fetches } = verifierFor(signer.jwks);
    await verifier.verify(signer.token(CLAIMS));
    await verifier.verify(signer.token(CLAIMS));
    expect(fetches()).toBe(1);
  });
});
