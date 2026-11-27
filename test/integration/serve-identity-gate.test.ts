import { createServer, type Server } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeApprovalStore, type ApprovalStore } from '../helpers/approval-store.js';
import { makeTestSigner } from '../helpers/identity-keys.js';
import { runCli, runCliBackground, stopCliBackground } from '../helpers/run-cli.js';

/**
 * context-browsing spec ("A widened bind admits only verified requests when
 * the store declares an identity"; serve-browsing-requires-identity, issue
 * #268): a real server bound to every interface, reached the way a request
 * that came around the access proxy reaches it.
 */
const BASE = 'https://ctx-a.example.test';
const ISSUER = 'https://ctx-a.cloudflareaccess.example.test';
const AUDIENCE = 'aud-1';
const HEADER = 'cf-access-jwt-assertion';
const NOTE = '/notes/projects/secret.md';
const NOTE_TEXT = 'the-note-body-nobody-unverified-reads';

const signer = makeTestSigner();
const stranger = makeTestSigner();
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

const claims = (extra: Record<string, unknown> = {}) => ({ iss: ISSUER, aud: [AUDIENCE], email: 'reader@elsewhere.example', ...extra });

async function storeWithContent(opts: { noApproval?: boolean } = {}): Promise<ApprovalStore> {
  const store = await makeApprovalStore({ baseUrl: BASE, identity: { issuer: ISSUER, audience: AUDIENCE, jwksUrl }, ...opts });
  await mkdir(path.join(store.root, 'projects'), { recursive: true });
  await writeFile(path.join(store.root, 'projects/secret.md'), `# Secret\n\n${NOTE_TEXT}\n`);
  const page = path.join(store.root, '.contexture/publish/my-page');
  await mkdir(page, { recursive: true });
  await writeFile(path.join(page, 'index.html'), `<!doctype html><html><body>${NOTE_TEXT}</body></html>`);
  expect((await runCli(['catalog', 'build'], { cwd: store.root, env: store.env })).exitCode).toBe(0);
  return store;
}

/** Serves `store` on `host` and hands back an address on loopback, which a bind to every interface accepts too. */
async function withServer(store: ApprovalStore, host: string | null, body: (url: string) => Promise<void>): Promise<void> {
  const args = ['serve', '--port', '0', '--json', ...(host === null ? [] : ['--host', host])];
  const { child, firstLine } = await runCliBackground(args, { cwd: store.root, env: store.env });
  try {
    await body(`http://127.0.0.1:${(JSON.parse(firstLine) as { data: { port: number } }).data.port}`);
  } finally {
    await stopCliBackground(child);
  }
}

describe('browsing a store that declares an identity (real CLI, real signatures)', () => {
  it('refuses every browsing route on a wider bind without an assertion, and reads nothing', async () => {
    const store = await storeWithContent();
    try {
      await withServer(store, '0.0.0.0', async (url) => {
        const index = await (await fetch(`${url}/`, { headers: { [HEADER]: signer.token(claims()) } })).text();
        const catalog = /href="(\/catalog\/[^"]+)"/.exec(index)?.[1];
        expect(catalog).toBeDefined();

        const routes = ['/', '/graph', NOTE, catalog!, '/publish/my-page/index.html', '/preview/none/x/index.html', '/review/none', '/assets/style.css', '/assets/diagram.js', '/nowhere'];
        for (const route of routes) {
          const res = await fetch(`${url}${route}`);
          expect(`${route} ${res.status}`).toBe(`${route} 401`);
          expect(res.headers.get('cache-control')).toBe('no-store');
          expect(await res.text()).toBe('a verified identity assertion is required\n');
        }
        expect((await fetch(`${url}${NOTE}`, { method: 'HEAD' })).status).toBe(401);
      });
    } finally {
      await store.tmp.cleanup();
    }
  }, 60_000);

  it('admits a verified assertion from an email no list names', async () => {
    const store = await storeWithContent();
    try {
      await withServer(store, '0.0.0.0', async (url) => {
        const headers = { [HEADER]: signer.token(claims()) };
        const note = await fetch(`${url}${NOTE}`, { headers });
        expect(note.status).toBe(200);
        expect(await note.text()).toContain(NOTE_TEXT);
        expect((await fetch(`${url}/publish/my-page/index.html`, { headers })).status).toBe(200);
        expect((await fetch(`${url}/assets/style.css`, { headers })).status).toBe(200);
        // The approval page keeps its own list: verified is not enough there.
        expect((await fetch(`${url}/approve/`, { headers })).status).toBe(403);
      });
    } finally {
      await store.tmp.cleanup();
    }
  }, 60_000);

  it('refuses a forged, foreign or expired assertion', async () => {
    const store = await storeWithContent();
    try {
      await withServer(store, '0.0.0.0', async (url) => {
        const refused = [
          stranger.token(claims()),
          signer.token(claims({ aud: ['another-application'] })),
          signer.token(claims({ iss: 'https://elsewhere.example.test' })),
          signer.token(claims({ exp: Math.floor(Date.now() / 1000) - 3600 })),
          'not-a-token',
        ];
        for (const token of refused) {
          const res = await fetch(`${url}${NOTE}`, { headers: { [HEADER]: token } });
          expect(res.status).toBe(401);
          expect(await res.text()).not.toContain(NOTE_TEXT);
        }
      });
    } finally {
      await store.tmp.cleanup();
    }
  }, 60_000);

  it('leaves the routes with a control of their own to their handlers', async () => {
    const store = await storeWithContent();
    try {
      await withServer(store, '0.0.0.0', async (url) => {
        // No mcp block and no webhook secret here: the answers are those handlers' own, not the gate's 401.
        expect((await fetch(`${url}/.well-known/oauth-authorization-server`)).status).toBe(404);
        expect((await fetch(`${url}/hooks/github`, { method: 'POST' })).status).toBe(405);
        expect((await fetch(`${url}/approve/`)).status).toBe(401);
      });
    } finally {
      await store.tmp.cleanup();
    }
  }, 60_000);

  it('asks for nothing on the loopback default', async () => {
    const store = await storeWithContent();
    try {
      await withServer(store, null, async (url) => {
        const note = await fetch(`${url}${NOTE}`);
        expect(note.status).toBe(200);
        expect(await note.text()).toContain(NOTE_TEXT);
      });
    } finally {
      await store.tmp.cleanup();
    }
  }, 60_000);

  it('asks for nothing in a store that declares no change approval, whatever the bind', async () => {
    const store = await storeWithContent({ noApproval: true });
    try {
      await withServer(store, '0.0.0.0', async (url) => {
        const note = await fetch(`${url}${NOTE}`);
        expect(note.status).toBe(200);
        expect(await note.text()).toContain(NOTE_TEXT);
      });
    } finally {
      await store.tmp.cleanup();
    }
  }, 60_000);
});
