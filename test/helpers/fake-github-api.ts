import { generateKeyPairSync, verify, type KeyObject } from 'node:crypto';
import { createServer, type Server } from 'node:http';

export interface FakeGithubApi {
  url: string;
  /** The PEM private key the App signs with. */
  privateKeyPem: string;
  /** Every installation token minted so far, oldest first. */
  minted: string[];
  close(): Promise<void>;
}

/**
 * The three App-authenticated GitHub endpoints `src/core/forge/credentials.ts`
 * calls, behind a real signature check against the App's public key.
 */
export async function startFakeGithubApi(opts: { appId: number; slug: string; installedOn: string[]; ttlMs?: number }): Promise<FakeGithubApi> {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const minted: string[] = [];
  const server: Server = createServer((req, res) => {
    const reply = (status: number, body: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (!validAssertion(req.headers.authorization, publicKey, opts.appId)) return reply(401, { message: 'A JSON web token could not be decoded' });
    const path = new URL(req.url ?? '/', 'http://x').pathname;
    if (req.method === 'GET' && path === '/app') return reply(200, { id: opts.appId, slug: opts.slug });
    const install = /^\/repos\/([^/]+\/[^/]+)\/installation$/.exec(path);
    if (req.method === 'GET' && install !== null) {
      const index = opts.installedOn.indexOf(install[1]!);
      return index === -1 ? reply(404, { message: 'Not Found' }) : reply(200, { id: 1000 + index });
    }
    if (req.method === 'POST' && /^\/app\/installations\/\d+\/access_tokens$/.test(path)) {
      const token = `ghs_test_${minted.length + 1}_${Math.random().toString(36).slice(2)}`;
      minted.push(token);
      return reply(201, { token, expires_at: new Date(Date.now() + (opts.ttlMs ?? 3_600_000)).toISOString() });
    }
    return reply(404, { message: 'Not Found' });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  return {
    url: `http://127.0.0.1:${port}`,
    privateKeyPem: privateKey.export({ type: 'pkcs1', format: 'pem' }).toString(),
    minted,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function validAssertion(header: string | undefined, publicKey: KeyObject, appId: number): boolean {
  const jwt = header?.replace(/^Bearer /, '');
  if (jwt === undefined) return false;
  const [h, p, s] = jwt.split('.');
  if (h === undefined || p === undefined || s === undefined) return false;
  if (!verify('sha256', Buffer.from(`${h}.${p}`), publicKey, Buffer.from(s, 'base64url'))) return false;
  const claims = JSON.parse(Buffer.from(p, 'base64url').toString()) as { iss: unknown; exp: number };
  return claims.iss === appId && claims.exp * 1000 > Date.now();
}
