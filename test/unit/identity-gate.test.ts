import { describe, expect, it } from 'vitest';
import type { StoreConfig } from '../../src/config/schema.js';
import type { IdentityVerifier } from '../../src/core/approval/identity.js';
import { IdentityGate, isLoopbackAddress } from '../../src/core/browse/identity-gate.js';

const IDENTITY = { header: 'Cf-Access-Jwt-Assertion', issuer: 'https://ctx-a.example.test', audience: 'aud-1', jwks_url: 'https://ctx-a.example.test/certs' };

/** A config is opaque here; the gate reads only change_approval.identity. */
function config(identity: typeof IDENTITY | null = IDENTITY): StoreConfig {
  return { schema_version: 10, ...(identity === null ? {} : { change_approval: { identity } }) } as unknown as StoreConfig;
}

/** A verifier that admits the token `good`, and records which identity block each one was built from. */
function harness(loopback: boolean) {
  const built: string[] = [];
  const makeVerifier = (identity: typeof IDENTITY): IdentityVerifier => {
    built.push(identity.audience);
    return {
      verify: async (header) => (header === 'good' ? { ok: true, email: 'a@example.com' } : { ok: false, reason: 'no identity assertion' }),
    };
  };
  return { gate: new IdentityGate(() => loopback, makeVerifier), built };
}

describe('isLoopbackAddress', () => {
  it('admits the loopback range in both families', () => {
    for (const address of ['127.0.0.1', '127.1.2.3', '::1', '::ffff:127.0.0.1']) expect(isLoopbackAddress(address)).toBe(true);
  });

  it('refuses every other address', () => {
    for (const address of ['0.0.0.0', '::', '10.0.0.1', '192.168.1.127', '1127.0.0.1', '::ffff:10.0.0.1', 'localhost']) {
      expect(isLoopbackAddress(address)).toBe(false);
    }
  });
});

describe('the browsing identity gate', () => {
  it('asks for nothing when the store declares no change approval', async () => {
    const { gate, built } = harness(false);
    expect(await gate.check(config(null), { headers: {} })).toEqual({ admitted: true });
    expect(built).toEqual([]);
  });

  it('asks for nothing on a loopback bind', async () => {
    const { gate, built } = harness(true);
    expect(await gate.check(config(), { headers: {} })).toEqual({ admitted: true });
    expect(built).toEqual([]);
  });

  it('refuses a request with no assertion on a wider bind, naming why', async () => {
    const { gate } = harness(false);
    expect(await gate.check(config(), { headers: {} })).toEqual({ admitted: false, reason: 'no identity assertion' });
  });

  it('reads the configured header, whatever its case, and admits a verified request', async () => {
    const { gate } = harness(false);
    expect(await gate.check(config(), { headers: { 'cf-access-jwt-assertion': 'good' } })).toEqual({ admitted: true });
    expect(await gate.check(config(), { headers: { 'x-other': 'good' } })).toMatchObject({ admitted: false });
  });

  it('keeps one verifier per identity block, and builds another when the block changes', async () => {
    const { gate, built } = harness(false);
    await gate.check(config(), { headers: {} });
    await gate.check(config({ ...IDENTITY }), { headers: {} });
    expect(built).toEqual(['aud-1']);
    await gate.check(config({ ...IDENTITY, audience: 'aud-2' }), { headers: {} });
    expect(built).toEqual(['aud-1', 'aud-2']);
  });
});
