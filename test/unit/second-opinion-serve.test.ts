import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { createServer, request, type Server } from 'node:http';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SHIPPED_DEFAULTS } from '../../src/config/defaults.js';
import { ExitCode } from '../../src/core/exit-codes.js';
import { SECOND_OPINION_TOOL_NAMES } from '../../src/core/mcp/tool-map.js';
import { loadServeConfig } from '../../src/core/second-opinion/serve-config.js';
import { SIGNING_KEY_FILE, signingKey, stateDirectory } from '../../src/core/second-opinion/serve-state.js';
import { CLI_VERSION } from '../../src/version.js';
import { makeTestSigner } from '../helpers/identity-keys.js';
import { startOpenRouterStub, STUB_KEY, type OpenRouterStub } from '../helpers/openrouter-stub.js';
import { runCli, runCliBackground, stopCliBackground } from '../helpers/run-cli.js';
import { installSecondOpinionStubs } from '../helpers/second-opinion-stubs.js';
import { makeTmpDir, type TmpDir } from '../helpers/tmp-store.js';

/**
 * offer-the-second-opinion-on-its-own tasks 6.1–6.8 (remote-access
 * requirements "A server can offer a second opinion and nothing else", "The
 * second-opinion server reads no store, forge credential or approval key",
 * "The second-opinion server follows its file and uses its lineup", "The
 * second-opinion server's sign-in survives a restart" and "The second-opinion
 * server's connect page names its plugin and connector"; cli-contract
 * requirements "`ctxr second-opinion serve` starts a server without a store"
 * and "The second-opinion server's file is strict and holds no secret"): the
 * real CLI, a real signed identity, stub model CLIs and a stub endpoint.
 */
const BASE = 'https://opinion.example.test';
const ISSUER = 'https://opinion.cloudflareaccess.example.test';
const AUDIENCE = 'aud-1';
const HEADER = 'cf-access-jwt-assertion';
const REDIRECT = 'https://client.example/callback';
const MEMBER = 'a@example.com';
const PLAN = '# Plan: rename the thing\n\n## Steps\nS1. Rename the module and update its callers.\nS2. Delete the old module once nothing imports it.\n';
const ROLE_OF: Record<string, string> = { claude: 'architect', codex: 'skeptic', agy: 'pragmatist' };
const critique = (role: string): string =>
  `## Role: ${role}\n\n## Verdict: APPROVE_WITH_CHANGES\n\n## Findings\n\n### F1 [major] confidence=0.7\nEvidence: S1\nIssue: ${role} sees a gap.\nChange: reword S1.\n\n## Suggested changes\n- reword\n\n## What you would NOT change\n- S2\n`;

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

interface Reply {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
}

/** node:http rather than fetch: fetch refuses to send an Origin header of our choosing. */
function http(url: string, opts: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = request(url, { method: opts.method ?? 'GET', headers: opts.headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end(opts.body);
  });
}

const assertion = (email: string) => signer.token({ iss: ISSUER, aud: [AUDIENCE], email });

const fileText = (extra = '', members = `["${MEMBER}", "@members.example"]`): string =>
  `base_url: ${BASE}\nidentity:\n  header: ${HEADER}\n  issuer: ${ISSUER}\n  audience: ${AUDIENCE}\n  jwks_url: ${jwksUrl}\nmembers: ${members}\n${extra}`;

async function authorize(url: string, email: string): Promise<{ status: number; token?: string }> {
  const registration = await http(new URL('/register', url).toString(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ redirect_uris: [REDIRECT], client_name: 'Test client' }) });
  expect(registration.status).toBe(201);
  const clientId = (JSON.parse(registration.body.toString('utf8')) as { client_id: string }).client_id;
  const verifier = randomBytes(32).toString('base64url');
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: REDIRECT,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
    resource: `${BASE}/mcp`,
  });
  const consent = await http(new URL(`/authorize?${params.toString()}`, url).toString(), { headers: { [HEADER]: assertion(email) } });
  if (consent.status !== 200) return { status: consent.status };
  // The consent page names the one scope this server grants.
  expect(consent.body.toString('utf8')).toContain('several AI models');
  expect(consent.body.toString('utf8')).not.toContain('search and read');
  params.set('decision', 'allow');
  const confirmed = await http(new URL('/authorize', url).toString(), {
    method: 'POST',
    headers: { [HEADER]: assertion(email), Origin: BASE, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  expect(confirmed.status).toBe(302);
  const code = new URL(confirmed.headers.location as string).searchParams.get('code')!;
  const token = await http(new URL('/token', url).toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: clientId, redirect_uri: REDIRECT, code_verifier: verifier }).toString(),
  });
  expect(token.status).toBe(200);
  const body = JSON.parse(token.body.toString('utf8')) as { access_token: string; scope: string };
  expect(body.scope).toBe('second-opinion');
  return { status: 200, token: body.access_token };
}

async function rpc(url: string, token: string, method: string, params?: unknown): Promise<{ status: number; result?: Record<string, unknown> }> {
  const reply = await http(new URL('/mcp', url).toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, ...(params === undefined ? {} : { params }) }),
  });
  const text = reply.body.toString('utf8');
  return { status: reply.status, result: text === '' ? undefined : (JSON.parse(text) as { result?: Record<string, unknown> }).result };
}

interface ToolReply {
  isError?: boolean;
  content: { text: string }[];
  structuredContent?: { exit_code: number | null; stdout: string; stderr: string; command: string };
}
const callTool = async (url: string, token: string, name: string, args: Record<string, unknown> = {}): Promise<ToolReply> =>
  (await rpc(url, token, 'tools/call', { name, arguments: args })).result as unknown as ToolReply;

describe('the second-opinion server\'s file', () => {
  let tmp: TmpDir;
  beforeEach(async () => {
    tmp = await makeTmpDir('ctxr-so-serve-file-');
  });
  afterEach(() => tmp.cleanup());
  const load = (text: string) => {
    const file = path.join(tmp.root, 'second-opinion.yaml');
    writeFileSync(file, text);
    return loadServeConfig(file);
  };

  it('loads a minimal file, with the shipped lineup', async () => {
    const config = await load(fileText());
    expect(config).toMatchObject({ base_url: BASE, members: [MEMBER, '@members.example'], identity: { header: HEADER, issuer: ISSUER } });
    expect(config.second_opinion).toEqual(SHIPPED_DEFAULTS.second_opinion);
  });

  it('takes a store\'s lineup block', async () => {
    const config = await load(fileText('second_opinion: { gemini: { via: openrouter, strong: vendor/model-x } }\n'));
    expect(config.second_opinion.gemini).toEqual({ via: 'openrouter', strong: 'vendor/model-x' });
    expect(config.second_opinion.claude).toEqual({});
  });

  it.each([
    ['a key at the top level', fileText('openrouter_api_key: sk-or-x\n'), 'openrouter_api_key: unknown key'],
    ['a key inside identity', fileText().replace('  audience:', '  client_secret: x\n  audience:'), 'identity.client_secret: unknown key'],
    ['a store key', fileText('mcp: { readers: ["@example.com"] }\n'), 'mcp: unknown key'],
    ['an address with a path', fileText().replace(BASE, 'https://ctx-a.example/opinion'), 'base_url: must be an http(s) origin with no path'],
    ['no member', fileText('', '[]'), 'members: name at least one member'],
    ['a member that is not an email', fileText('', '["everyone"]'), 'members.0: must be an email address or an @domain entry'],
    ['a route with an address', fileText('second_opinion: { gemini: { via: openrouter, url: "http://127.0.0.1:9" } }\n'), 'url'],
  ])('refuses %s, naming it', async (_name, text, named) => {
    const error = await load(text).catch((err: unknown) => err as Error);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain(named);
    expect((error as { exitCode?: number }).exitCode).toBe(ExitCode.Usage);
  });
});

describe('the second-opinion server\'s signing key', () => {
  let tmp: TmpDir;
  beforeEach(async () => {
    tmp = await makeTmpDir('ctxr-so-serve-key-');
  });
  afterEach(() => tmp.cleanup());

  it('is made on first start for its user alone, and read back on the next', () => {
    const dir = path.join(tmp.root, 'state', 'nested');
    const key = signingKey(dir);
    expect(key).toHaveLength(32);
    expect(statSync(dir).mode & 0o777).toBe(0o700);
    expect(statSync(path.join(dir, SIGNING_KEY_FILE)).mode & 0o777).toBe(0o600);
    expect(signingKey(dir).equals(key)).toBe(true);
  });

  it('is refused when another user could read the file or its directory, naming it', () => {
    const dir = path.join(tmp.root, 'state');
    signingKey(dir);
    const file = path.join(dir, SIGNING_KEY_FILE);
    chmodSync(file, 0o644);
    expect(() => signingKey(dir)).toThrow(new RegExp(`${file.replace(/[.]/g, '\\.')} can be read by other users`));
    chmodSync(file, 0o600);
    chmodSync(dir, 0o750);
    expect(() => signingKey(dir)).toThrow(/state can be read by other users/);
    chmodSync(dir, 0o700);
    writeFileSync(file, 'short');
    expect(() => signingKey(dir)).toThrow(/does not hold a 32-byte key/);
  });

  it('defaults to the user\'s state directory', () => {
    expect(stateDirectory(undefined, { XDG_STATE_HOME: '/var/state', HOME: '/home/x' }, '/cwd')).toBe('/var/state/ctxr/second-opinion-serve');
    expect(stateDirectory(undefined, { HOME: '/home/x' }, '/cwd')).toBe('/home/x/.local/state/ctxr/second-opinion-serve');
    expect(stateDirectory('keys', { HOME: '/home/x' }, '/cwd')).toBe('/cwd/keys');
  });
});

describe('ctxr second-opinion serve (real CLI, real signatures, stub model CLIs)', () => {
  let tmp: TmpDir;
  let cwd: string;
  let binDir: string;
  let logDir: string;
  let home: string;
  let runsTmp: string;
  let stateDir: string;
  let configFile: string;
  let stub: OpenRouterStub;
  let running: Awaited<ReturnType<typeof runCliBackground>>['child'][] = [];

  /**
   * No `git` and no `gh`: the search path holds node, the stub model CLIs and
   * the stub `setpriv`, and nothing else. The App key and the webhook secret
   * are named and do not exist, which stops `ctxr serve` at startup.
   */
  const serverEnv = (extra: Record<string, string> = {}): Record<string, string> => {
    const env: Record<string, string> = {
      PATH: binDir,
      HOME: home,
      TMPDIR: runsTmp,
      CTXR_SECOND_OPINION_STUB_DIR: logDir,
      CTXR_SECOND_OPINION_STUB_SETPRIV: 'landlock',
      CONTEXTURE_GITHUB_APP_ID: '1',
      CONTEXTURE_GITHUB_APP_PRIVATE_KEY_FILE: path.join(tmp.root, 'no-such-app-key.pem'),
      CONTEXTURE_WEBHOOK_SECRET_FILE: path.join(tmp.root, 'no-such-webhook-secret'),
      GH_TOKEN: 'ghp-forge-secret',
      ...extra,
    };
    for (const cli of ['claude', 'codex', 'agy']) env[`CTXR_SECOND_OPINION_STUB_${cli.toUpperCase()}`] = JSON.stringify({ kind: 'ok', text: critique(ROLE_OF[cli]!) });
    return env;
  };
  const calls = (cli: string): { args: string[]; stdin: string; env: Record<string, string> }[] => {
    const file = path.join(logDir, `${cli}.json`);
    return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
  };
  const setprivCalls = (): string[][] =>
    readdirSync(logDir)
      .filter((f) => f.startsWith('setpriv-'))
      .map((f) => JSON.parse(readFileSync(path.join(logDir, f), 'utf8')) as string[]);

  async function start(env: Record<string, string> = serverEnv(), dir = cwd): Promise<{ url: string; stderr: () => string; stop: () => Promise<void> }> {
    const { child, firstLine } = await runCliBackground(['second-opinion', 'serve', '--config', configFile, '--state-dir', stateDir, '--port', '0', '--json'], { cwd: dir, env });
    running.push(child);
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    const envelope = JSON.parse(firstLine) as { command: string; store: { root: string | null }; data: { url: string; config: string; state_dir: string; base_url: string } };
    expect(envelope).toMatchObject({ command: 'second-opinion.serve', store: { root: null }, data: { config: configFile, state_dir: stateDir, base_url: BASE } });
    return {
      url: envelope.data.url,
      stderr: () => stderr,
      stop: async () => {
        running = running.filter((c) => c !== child);
        await stopCliBackground(child);
      },
    };
  }

  beforeEach(async () => {
    tmp = await makeTmpDir('ctxr-so-serve-');
    cwd = path.join(tmp.root, 'empty');
    // Two levels down: a CLI may read its install, which is counted up from its binary's directory.
    binDir = path.join(tmp.root, 'tools', 'opt', 'bin');
    logDir = path.join(tmp.root, 'stub-log');
    home = path.join(tmp.root, 'home');
    runsTmp = path.join(tmp.root, 'tmp');
    stateDir = path.join(tmp.root, 'state');
    for (const dir of [cwd, binDir, logDir, home, runsTmp]) mkdirSync(dir, { recursive: true });
    installSecondOpinionStubs(binDir);
    symlinkSync(process.execPath, path.join(binDir, 'node'));
    configFile = path.join(tmp.root, 'second-opinion.yaml');
    writeFileSync(configFile, fileText());
    stub = await startOpenRouterStub(logDir);
    stub.behave({ kind: 'ok', text: critique('pragmatist') });
  });

  afterEach(async () => {
    for (const child of running) await stopCliBackground(child);
    running = [];
    stub.stop();
    // A detached run a test left going is killed with its stub CLIs, so nothing outlives the test.
    const root = readdirSync(runsTmp).find((n) => n.startsWith('ctxr-second-opinion-runs-'));
    if (root !== undefined) {
      for (const run of readdirSync(path.join(runsTmp, root)).filter((n) => /^[a-z2-7]{26}$/.test(n))) {
        try {
          process.kill(-(JSON.parse(readFileSync(path.join(runsTmp, root, run, 'run.json'), 'utf8')) as { pid: number }).pid, 'SIGKILL');
        } catch {
          // Already gone.
        }
      }
    }
    await tmp.cleanup();
  });

  it('starts from a file alone, where ctxr serve could not, and offers the four tools and nothing else', async () => {
    // The stubs' own default answer is the one a preflight expects.
    const env = serverEnv();
    for (const cli of ['CLAUDE', 'CODEX', 'AGY']) delete env[`CTXR_SECOND_OPINION_STUB_${cli}`];
    const server = await start(env);
    const { token } = await authorize(server.url, MEMBER);
    const tools = (await rpc(server.url, token!, 'tools/list')).result as { tools: { name: string }[] };
    expect(tools.tools.map((t) => t.name)).toEqual(SECOND_OPINION_TOOL_NAMES);

    const init = await rpc(server.url, token!, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
    const instructions = (init.result as { instructions: string }).instructions;
    expect(instructions).toContain('opinion.example.test');
    for (const name of SECOND_OPINION_TOOL_NAMES) expect(instructions).toContain(`\`${name}\``);
    expect(instructions).toContain(`This server runs ctxr ${CLI_VERSION}.`);
    expect(instructions).not.toContain('## This store');

    // Every tool of a store is unknown here, not merely out of scope.
    for (const name of ['Read', 'find', 'ctxr', 'session_start']) expect((await rpc(server.url, token!, 'tools/call', { name, arguments: {} })).result, name).toBeUndefined();

    // A member can run a preflight: no store, no git, no forge credential, no App key.
    const preflight = await callTool(server.url, token!, 'second_opinion_preflight');
    expect(preflight.structuredContent, JSON.stringify(preflight.structuredContent)).toMatchObject({ command: 'second-opinion preflight', exit_code: ExitCode.Ok });
    expect(preflight.structuredContent!.stdout).toContain('confined: yes');
    expect(preflight.content[0]!.text).not.toMatch(/commit|ran against/);
    // The forge credential, the member and the lineup the server handed over never reach a model CLI.
    for (const cli of ['claude', 'codex', 'agy']) {
      const env = calls(cli).at(-1)!.env;
      for (const key of ['GH_TOKEN', 'CONTEXTURE_SECOND_OPINION_OWNER', 'CONTEXTURE_SECOND_OPINION_LINEUP', 'CONTEXTURE_GITHUB_APP_PRIVATE_KEY_FILE']) expect(env[key], `${cli}: ${key}`).toBeUndefined();
    }
    // D9: no Landlock rule names the state directory or anything above it, so no model CLI can read the signing key.
    const ruled = setprivCalls().flatMap((args) => args.filter((a) => a.startsWith('path-beneath:')).map((a) => a.split(':').slice(2).join(':')));
    expect(ruled.length).toBeGreaterThan(0);
    for (const rule of ruled) expect(`${stateDir}/`.startsWith(`${rule.replace(/\/+$/, '')}/`), rule).toBe(false);
    expect(server.stderr()).not.toMatch(/credential|GitHub App|webhook/i);
  });

  it('answers 404 for every store route, 405 for another method, and refuses a verified person the file leaves out', async () => {
    const server = await start();
    for (const route of ['/', '/approve/', '/notes/', '/hooks/github', '/assets/style.css', '/review/1', '/catalog/']) {
      expect((await http(new URL(route, server.url).toString())).status, route).toBe(404);
      expect((await http(new URL(route, server.url).toString(), { method: 'POST', body: '{}' })).status, route).toBe(405);
    }
    expect((await http(new URL('/.well-known/oauth-authorization-server', server.url).toString())).status).toBe(200);
    expect((await rpc(server.url, '', 'tools/list')).status).toBe(401);

    const registration = await http(new URL('/register', server.url).toString(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ redirect_uris: [REDIRECT] }) });
    const clientId = (JSON.parse(registration.body.toString('utf8')) as { client_id: string }).client_id;
    const params = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: REDIRECT, code_challenge: 'a'.repeat(43), code_challenge_method: 'S256' });
    expect((await http(new URL(`/authorize?${params.toString()}`, server.url).toString())).status).toBe(401);
    expect((await authorize(server.url, 'z@elsewhere.example')).status).toBe(403);
    // An @domain entry admits that domain.
    expect((await authorize(server.url, 'b@members.example')).status).toBe(200);
  });

  it('runs a critique on the file\'s lineup, through OpenRouter where the file says, and leaves a store nearby out of it', async () => {
    // A store around the working directory routes another critic; the file routes gemini.
    writeFileSync(path.join(cwd, 'contexture.yaml'), 'schema_version: 1\nsecond_opinion: { gpt: { via: openrouter, strong: vendor/from-the-store } }\n');
    writeFileSync(configFile, fileText('second_opinion: { claude: { via: cli, strong: m-file }, gpt: { via: cli }, gemini: { via: openrouter, strong: vendor/model-x }, grok: { via: off } }\n'));
    const server = await start(serverEnv({ OPENROUTER_API_KEY: STUB_KEY, CTXR_SECOND_OPINION_OPENROUTER_URL: stub.url }));
    const { token } = await authorize(server.url, MEMBER);
    const result = await callTool(server.url, token!, 'second_opinion_critique', { plan: PLAN, seed: 3 });
    expect(result.structuredContent, result.content[0]?.text).toMatchObject({ command: 'second-opinion critique', exit_code: ExitCode.Ok });
    for (const letter of ['A', 'B', 'C']) expect(result.structuredContent!.stdout).toContain(`===== critique-${letter} =====`);

    expect(stub.requests()).toHaveLength(1);
    expect(stub.requests()[0]!.body!.model).toBe('vendor/model-x');
    expect(stub.requests()[0]!.headers.authorization).toBe(`Bearer ${STUB_KEY}`);
    expect(calls('agy')).toEqual([]);
    // codex is its CLI, as the file says: the store's route is never read.
    expect(calls('codex').some((c) => c.stdin.includes('Rename the module'))).toBe(true);
    const claude = calls('claude').find((c) => c.args.includes('--model'))!.args;
    expect(claude[claude.indexOf('--model') + 1]).toBe('m-file');
    expect(JSON.stringify(result)).not.toContain(STUB_KEY);
    // Nothing of the call is left on the server outside the run's own folder.
    expect(readdirSync(runsTmp).filter((d) => d.startsWith('ctxr-mcp-second-opinion-'))).toEqual([]);

    // A field that names a file is refused, and the server's environment still wins over its file.
    const refused = await callTool(server.url, token!, 'second_opinion_critique', { plan: PLAN, plan_file: '/etc/passwd' });
    expect(refused.isError).toBe(true);
    expect(refused.content[0]!.text).toContain('mcp.invalid_arguments');
  });

  it('follows its file: a removed member is refused on the next call, and a broken file changes nothing and is said once', async () => {
    const server = await start();
    const { token } = await authorize(server.url, MEMBER);
    const other = (await authorize(server.url, 'b@members.example')).token!;
    expect((await rpc(server.url, token!, 'tools/list')).status).toBe(200);

    writeFileSync(configFile, fileText('', '["@members.example"]'));
    expect((await rpc(server.url, token!, 'tools/list')).status).toBe(401);
    expect((await rpc(server.url, other, 'tools/list')).status).toBe(200);

    writeFileSync(configFile, fileText('openrouter_api_key: sk-or-x\n', '["nobody@example.com"]'));
    for (let i = 0; i < 3; i++) expect((await rpc(server.url, other, 'tools/list')).status).toBe(200);
    expect((await rpc(server.url, token!, 'tools/list')).status).toBe(401);
    expect(server.stderr().match(/openrouter_api_key: unknown key/g)).toHaveLength(1);
    expect(server.stderr()).toContain('still serving the file loaded before');
  });

  it('keeps a member signed in across a restart with the same state directory, and not with another', async () => {
    const first = await start();
    const { token } = await authorize(first.url, MEMBER);
    expect((await rpc(first.url, token!, 'tools/list')).status).toBe(200);
    await first.stop();

    const second = await start();
    expect((await rpc(second.url, token!, 'tools/list')).status).toBe(200);
    await second.stop();

    stateDir = path.join(tmp.root, 'another-state');
    const third = await start();
    expect((await rpc(third.url, token!, 'tools/list')).status).toBe(401);
  });

  it('exits with the usage code, and listens on nothing, for a missing file, a file that does not load, or a readable key', async () => {
    const run = (args: string[]) => runCli(['second-opinion', 'serve', '--state-dir', stateDir, '--port', '0', ...args], { cwd, env: serverEnv(), timeoutMs: 20_000 });
    const missing = await run(['--config', path.join(tmp.root, 'absent.yaml')]);
    expect(missing.exitCode).toBe(ExitCode.Usage);
    expect(missing.stderr + missing.stdout).toContain('absent.yaml');
    expect(missing.stdout).not.toContain('serving');

    const none = await run([]);
    expect(none.exitCode).toBe(ExitCode.Usage);

    writeFileSync(configFile, fileText().replace(BASE, 'https://ctx-a.example/opinion'));
    const broken = await run(['--config', configFile]);
    expect(broken.exitCode).toBe(ExitCode.Usage);
    expect(broken.stderr + broken.stdout).toContain('base_url');

    writeFileSync(configFile, fileText());
    signingKey(stateDir);
    chmodSync(path.join(stateDir, SIGNING_KEY_FILE), 0o644);
    const readable = await run(['--config', configFile]);
    expect(readable.exitCode).toBe(ExitCode.Usage);
    expect(readable.stderr + readable.stdout).toContain(path.join(stateDir, SIGNING_KEY_FILE));
    expect(readable.stdout).not.toContain('serving');
  });

  it('serves a connect page that names the second-opinion plugin and its connector, to a verified member only', async () => {
    const server = await start();
    const page = new URL('/plugin/', server.url).toString();
    expect((await http(page)).status).toBe(401);
    expect((await http(page, { headers: { [HEADER]: assertion('z@elsewhere.example') } })).status).toBe(403);

    const member = { [HEADER]: assertion(MEMBER) };
    const html = await http(page, { headers: member });
    expect(html.status).toBe(200);
    const body = html.body.toString('utf8');
    expect(body).toContain('<code>ayxuerui/contexture</code>');
    expect(body).toContain('Install the <strong>second-opinion</strong> plugin');
    expect(body).toContain(`<code>${BASE}/mcp</code>`);
    expect(body).toContain('href="/plugin/second-opinion-opinion-example-test-chatgpt.zip"');
    expect(body).not.toMatch(/__[A-Z_]+__/);
    expect((await http(new URL('/plugin', server.url).toString(), { headers: member })).status).toBe(200);
    expect((await http(new URL('/plugin/contexture-store-chatgpt.zip', server.url).toString(), { headers: member })).status).toBe(404);
    expect((await http(page, { method: 'POST', headers: member, body: '' })).status).toBe(405);

    const zip = await http(new URL('/plugin/second-opinion-opinion-example-test-chatgpt.zip', server.url).toString(), { headers: member });
    expect(zip.status).toBe(200);
    expect(zip.headers['content-type']).toBe('application/zip');
    const file = path.join(tmp.root, 'downloaded.zip');
    writeFileSync(file, zip.body);
    const exec = promisify(execFile);
    const listed = (await exec('unzip', ['-Z1', file])).stdout.trim().split('\n').sort();
    expect(listed).toEqual(['README.md', 'mcp.json', 'plugin.json', 'skills/ctxr-second-opinion/SKILL.md']);
    const mcp = JSON.parse((await exec('unzip', ['-p', file, 'mcp.json'])).stdout) as { mcpServers: Record<string, { url: string }> };
    expect(Object.values(mcp.mcpServers).map((s) => s.url)).toEqual([`${BASE}/mcp`]);
  });
});
