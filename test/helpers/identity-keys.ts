import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';

export interface TestSigner {
  jwks: { keys: Record<string, unknown>[] };
  /** A signed assertion carrying `claims`, with `exp` an hour out unless given. */
  token(claims: Record<string, unknown>, opts?: { kid?: string; alg?: string }): string;
}

/** An RS256 key pair standing in for an access proxy's signing key, with its key set. */
export function makeTestSigner(kid = 'key-1'): TestSigner {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return signerFor(privateKey, publicKey, kid);
}

function signerFor(privateKey: KeyObject, publicKey: KeyObject, kid: string): TestSigner {
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' };
  return {
    jwks: { keys: [jwk] },
    token(claims, opts = {}) {
      const header = Buffer.from(JSON.stringify({ alg: opts.alg ?? 'RS256', kid: opts.kid ?? kid, typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600, ...claims })).toString('base64url');
      const signature = sign('sha256', Buffer.from(`${header}.${payload}`), privateKey).toString('base64url');
      return `${header}.${payload}.${signature}`;
    },
  };
}
