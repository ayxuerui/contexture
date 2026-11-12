import { createServer, request, type Server } from 'node:http';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeApprovalStore, RECORDING_LOGIN } from '../helpers/approval-store.js';
import { makeTestSigner } from '../helpers/identity-keys.js';
import { runCliBackground, stopCliBackground } from '../helpers/run-cli.js';

const BASE = 'https://ctx-a.example.test';
const ISSUER = 'https://ctx-a.cloudflareaccess.example.test';
const HEADER = 'cf-access-jwt-assertion';
const signer = makeTestSigner();
let jwksServer: Server;
let jwksUrl: string;

beforeAll(async () => {
  jwksServer = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(signer.jwks));
  });
  await new Promise<void>((resolve) => jwksServer.listen(0, '127.0.0.1', resolve));
  jwksUrl = `http://127.0.0.1:${(jwksServer.address() as { port: number }).port}/certs`;
});
afterAll(async () => {
  await new Promise<void>((resolve) => jwksServer.close(() => resolve()));
});

function get(url: string, opts: { email?: string; method?: string } = {}): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = opts.email === undefined ? {} : { [HEADER]: signer.token({ iss: ISSUER, aud: ['aud-1'], email: opts.email }) };
    if (opts.method === 'POST') Object.assign(headers, { Origin: BASE, 'Content-Type': 'application/x-www-form-urlencoded' });
    const req = request(url, { method: opts.method ?? 'GET', headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end(opts.method === 'POST' ? 'decision=approve&head=' + '0'.repeat(40) : undefined);
  });
}

const block = (deciders: string, login = RECORDING_LOGIN) =>
  'change_approval:\n' +
  `  identity: { header: Cf-Access-Jwt-Assertion, issuer: "${ISSUER}", audience: aud-1, jwks_url: "${jwksUrl}" }\n` +
  `  deciders: [${deciders}]\n` +
  `  recording_login: "${login}"\n`;

describe('ctxr serve follows changes to contexture.yaml (real CLI, fake forge)', () => {
  it('turns approval on, admits a new decider, degrades on a bad login, recovers, turns off, and survives a broken file', async () => {
    const store = await makeApprovalStore({ noApproval: true, baseUrl: BASE });
    try {
      const configFile = path.join(store.root, 'contexture.yaml');
      const original = await readFile(configFile, 'utf8');
      await mkdir(path.join(store.root, 'projects'), { recursive: true });
      await writeFile(path.join(store.root, 'projects/a.md'), '# A\n');
      // Replace by rename, as git does when a fast-forward brings a new version.
      let n = 0;
      const replaceConfig = async (text: string): Promise<void> => {
        const temp = `${configFile}.${n++}.tmp`;
        await writeFile(temp, text);
        await rename(temp, configFile);
      };

      const { child, firstLine } = await runCliBackground(['serve', '--port', '0', '--json'], { cwd: store.root, env: store.env });
      const stderr: string[] = [];
      child.stderr?.on('data', (c: Buffer) => stderr.push(c.toString('utf8')));
      const url = (path: string) => new URL(path, (JSON.parse(firstLine) as { data: { url: string } }).data.url).toString();
      try {
        expect((await get(url('/approve/'), { email: 'a@example.com' })).status).toBe(404);

        // Turned on after startup.
        await replaceConfig(original + block('"@example.com"'));
        expect((await get(url('/approve/'), { email: 'a@example.com' })).status).toBe(200);
        expect((await get(url('/approve/'), { email: 'b@other.example' })).status).toBe(403);

        // A decider added after startup.
        await replaceConfig(original + block('"@example.com", "b@other.example"'));
        expect((await get(url('/approve/'), { email: 'b@other.example' })).status).toBe(200);

        // A login the credential is not: the approval routes degrade, browsing does not.
        await replaceConfig(original + block('"@example.com"', 'ctx-someone-else'));
        const degraded = await get(url('/approve/'), { email: 'a@example.com' });
        expect(degraded.status).toBe(503);
        expect(degraded.body).toContain('ctx-someone-else');
        expect(degraded.body).toContain(RECORDING_LOGIN);
        expect((await get(url('/notes/projects/a.md'))).status).toBe(200);
        expect(child.exitCode).toBeNull();

        // Corrected: works again, with no restart.
        await replaceConfig(original + block('"@example.com"'));
        expect((await get(url('/approve/'), { email: 'a@example.com' })).status).toBe(200);

        // Turned off.
        await replaceConfig(original);
        expect((await get(url('/approve/'), { email: 'a@example.com' })).status).toBe(404);
        expect((await get(url('/approve/x/decision'), { email: 'a@example.com', method: 'POST' })).status).toBe(405);

        // A file that does not load: browsing carries on with the last good configuration, and says so once.
        const before = stderr.join('').split('does not load').length;
        await replaceConfig('schema_version: [not a number\n');
        expect((await get(url('/notes/projects/a.md'))).status).toBe(200);
        expect((await get(url('/'))).status).toBe(200);
        const failures = stderr.join('').split('does not load').length - before;
        expect(failures).toBe(1);
      } finally {
        await stopCliBackground(child);
      }
    } finally {
      await store.tmp.cleanup();
    }
  });
});
