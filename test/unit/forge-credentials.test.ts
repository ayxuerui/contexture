import { generateKeyPairSync, verify } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ForgeCredentialsError } from '../../src/core/errors.js';
import {
  appAssertion,
  githubRepositoryOf,
  resolveForgeCredentials,
  type FetchLike,
} from '../../src/core/forge/credentials.js';
import type { GitRunner } from '../../src/core/git/exec.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PEM = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();

function originGit(url: string): GitRunner {
  return { run: async () => ({ stdout: `${url}\n`, stderr: '', exitCode: 0 }) };
}

/** A fake GitHub: checks every assertion's signature, issues tokens with `ttlMs` of life, counts what it was asked. */
function fakeGithub(opts: { installed?: boolean; ttlMs?: number; now: () => Date }) {
  const calls: string[] = [];
  let minted = 0;
  const fetch: FetchLike = async (url, init) => {
    calls.push(`${init.method ?? 'GET'} ${new URL(url).pathname}`);
    const jwt = init.headers.Authorization!.replace(/^Bearer /, '');
    const [h, p, s] = jwt.split('.') as [string, string, string];
    const valid = verify('sha256', Buffer.from(`${h}.${p}`), publicKey, Buffer.from(s, 'base64url'));
    const claims = JSON.parse(Buffer.from(p, 'base64url').toString()) as { iss: unknown; exp: number; iat: number };
    const reply = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
    if (!valid || claims.iss !== 5354981) return reply(401, { message: 'bad assertion' });
    const pathname = new URL(url).pathname;
    if (pathname === '/app') return reply(200, { id: 5354981, slug: 'ctx-a-approvals' });
    if (pathname === '/repos/ayxuerui/ctx-a/installation') return opts.installed === false ? reply(404, { message: 'Not Found' }) : reply(200, { id: 42 });
    if (pathname === '/app/installations/42/access_tokens') {
      minted += 1;
      return reply(201, { token: `ghs_${minted}`, expires_at: new Date(opts.now().getTime() + (opts.ttlMs ?? 3_600_000)).toISOString() });
    }
    return reply(404, {});
  };
  return { fetch, calls, minted: () => minted };
}

async function refusal(promise: Promise<unknown>): Promise<ForgeCredentialsError> {
  const error = await promise.catch((err: unknown) => err);
  expect(error).toBeInstanceOf(ForgeCredentialsError);
  return error as ForgeCredentialsError;
}

describe('resolveForgeCredentials', () => {
  const git = originGit('https://github.com/ayxuerui/ctx-a.git');

  it('is gh mode, passing the environment through, when no App variable is set', async () => {
    const env = { GH_TOKEN: 'from-gh', PATH: '/bin' };
    const credentials = await resolveForgeCredentials({ env, git, cwd: '/' });
    expect(credentials.kind).toBe('gh');
    expect(await credentials.env()).toBe(env);
    expect(await credentials.botLogin()).toBeNull();
    expect(await credentials.gitToken()).toBeNull();
  });

  it('refuses a partial credential, naming the variables', async () => {
    const onlyId = await refusal(resolveForgeCredentials({ env: { CONTEXTURE_GITHUB_APP_ID: '5354981' }, git, cwd: '/' }));
    expect(onlyId.message).toContain('CONTEXTURE_GITHUB_APP_PRIVATE_KEY_FILE');
    expect(onlyId.message).toContain('CONTEXTURE_GITHUB_APP_PRIVATE_KEY');
    const onlyKey = await refusal(resolveForgeCredentials({ env: { CONTEXTURE_GITHUB_APP_PRIVATE_KEY: PEM }, git, cwd: '/' }));
    expect(onlyKey.message).toContain('CONTEXTURE_GITHUB_APP_ID');
  });

  it('refuses two key sources rather than choosing one', async () => {
    const error = await refusal(
      resolveForgeCredentials({
        env: { CONTEXTURE_GITHUB_APP_ID: '5354981', CONTEXTURE_GITHUB_APP_PRIVATE_KEY: PEM, CONTEXTURE_GITHUB_APP_PRIVATE_KEY_FILE: '/k.pem' },
        git,
        cwd: '/',
      }),
    );
    expect(error.message).toContain('Both');
  });

  it('refuses an unreadable key file, a non-key, and a key that is not RSA', async () => {
    await refusal(resolveForgeCredentials({ env: { CONTEXTURE_GITHUB_APP_ID: '1', CONTEXTURE_GITHUB_APP_PRIVATE_KEY_FILE: '/nonexistent/k.pem' }, git, cwd: '/' }));
    await refusal(resolveForgeCredentials({ env: { CONTEXTURE_GITHUB_APP_ID: '1', CONTEXTURE_GITHUB_APP_PRIVATE_KEY: 'not a key' }, git, cwd: '/' }));
    const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const notRsa = await refusal(resolveForgeCredentials({ env: { CONTEXTURE_GITHUB_APP_ID: '1', CONTEXTURE_GITHUB_APP_PRIVATE_KEY: ec }, git, cwd: '/' }));
    expect(notRsa.message).toContain('RSA');
  });

  it('reads the key from a file', async () => {
    const tmp = await makeTmpDir();
    try {
      const keyFile = path.join(tmp.root, 'k.pem');
      await writeFile(keyFile, PEM);
      const now = () => new Date();
      const github = fakeGithub({ now });
      const credentials = await resolveForgeCredentials({
        env: { CONTEXTURE_GITHUB_APP_ID: '5354981', CONTEXTURE_GITHUB_APP_PRIVATE_KEY_FILE: keyFile },
        git,
        cwd: '/',
        fetch: github.fetch,
        now,
      });
      expect(credentials.kind).toBe('github-app');
      expect(await credentials.botLogin()).toBe('ctx-a-approvals[bot]');
    } finally {
      await tmp.cleanup();
    }
  });
});

describe('App mode', () => {
  const git = originGit('git@github.com:ayxuerui/ctx-a.git');
  const appEnv = { CONTEXTURE_GITHUB_APP_ID: '5354981', CONTEXTURE_GITHUB_APP_PRIVATE_KEY: PEM, PATH: '/bin' };

  it('finds the installation from origin, mints a token, and hands it to gh as GH_TOKEN', async () => {
    const now = () => new Date();
    const github = fakeGithub({ now });
    const credentials = await resolveForgeCredentials({ env: appEnv, git, cwd: '/', fetch: github.fetch, now });
    const env = await credentials.env();
    expect(env.GH_TOKEN).toBe('ghs_1');
    expect(env.PATH).toBe('/bin');
    expect(await credentials.gitToken()).toBe('ghs_1');
    expect(github.calls).toEqual(['GET /repos/ayxuerui/ctx-a/installation', 'POST /app/installations/42/access_tokens']);
  });

  it('reuses a fresh token, and replaces one with less than five minutes left', async () => {
    let clock = Date.parse('2026-10-17T09:00:00Z');
    const now = () => new Date(clock);
    const github = fakeGithub({ now, ttlMs: 60 * 60 * 1000 });
    const credentials = await resolveForgeCredentials({ env: appEnv, git, cwd: '/', fetch: github.fetch, now });
    expect((await credentials.env()).GH_TOKEN).toBe('ghs_1');
    clock += 10 * 60 * 1000; // fifty minutes left
    expect((await credentials.env()).GH_TOKEN).toBe('ghs_1');
    expect(github.minted()).toBe(1);
    clock += 46 * 60 * 1000; // four minutes left
    expect((await credentials.env()).GH_TOKEN).toBe('ghs_2');
    expect(github.minted()).toBe(2);
  });

  it('mints once for concurrent callers', async () => {
    const now = () => new Date();
    const github = fakeGithub({ now });
    const credentials = await resolveForgeCredentials({ env: appEnv, git, cwd: '/', fetch: github.fetch, now });
    const tokens = await Promise.all([credentials.env(), credentials.env(), credentials.gitToken()]);
    expect(github.minted()).toBe(1);
    expect(tokens[0].GH_TOKEN).toBe('ghs_1');
    expect(tokens[2]).toBe('ghs_1');
  });

  it('names the repository and the App when the App is not installed there', async () => {
    const now = () => new Date();
    const github = fakeGithub({ now, installed: false });
    const credentials = await resolveForgeCredentials({ env: appEnv, git, cwd: '/', fetch: github.fetch, now });
    const error = await refusal(credentials.env());
    expect(error.message).toContain('ayxuerui/ctx-a');
    expect(error.message).toContain('5354981');
  });

  it('refuses an origin that is not github.com, unless the repository is named', async () => {
    const now = () => new Date();
    const github = fakeGithub({ now });
    const local = originGit('/srv/git/ctx-a.git');
    const refused = await resolveForgeCredentials({ env: appEnv, git: local, cwd: '/', fetch: github.fetch, now });
    expect((await refusal(refused.env())).message).toContain('CONTEXTURE_GITHUB_REPOSITORY');
    const named = await resolveForgeCredentials({ env: { ...appEnv, CONTEXTURE_GITHUB_REPOSITORY: 'ayxuerui/ctx-a' }, git: local, cwd: '/', fetch: github.fetch, now });
    expect((await named.env()).GH_TOKEN).toBe('ghs_1');
  });
});

describe('appAssertion', () => {
  it('is RS256 with iat backdated a minute and exp nine minutes out, verifiable with the public key', () => {
    const now = new Date('2026-10-17T09:00:00Z');
    const jwt = appAssertion('5354981', privateKey, now);
    const [h, p, s] = jwt.split('.') as [string, string, string];
    expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toEqual({ alg: 'RS256', typ: 'JWT' });
    const seconds = now.getTime() / 1000;
    expect(JSON.parse(Buffer.from(p, 'base64url').toString())).toEqual({ iat: seconds - 60, exp: seconds + 540, iss: 5354981 });
    expect(verify('sha256', Buffer.from(`${h}.${p}`), publicKey, Buffer.from(s, 'base64url'))).toBe(true);
    expect(JSON.parse(Buffer.from(appAssertion('Iv23liABC', privateKey, now).split('.')[1]!, 'base64url').toString()).iss).toBe('Iv23liABC');
  });
});

describe('githubRepositoryOf', () => {
  it('reads https and ssh github.com remotes, and nothing else', () => {
    expect(githubRepositoryOf('https://github.com/ayxuerui/pkm.git')).toBe('ayxuerui/pkm');
    expect(githubRepositoryOf('https://github.com/ayxuerui/pkm')).toBe('ayxuerui/pkm');
    expect(githubRepositoryOf('https://x-access-token:abc@github.com/ReadyRun-AI/readyrun-brain.git')).toBe('ReadyRun-AI/readyrun-brain');
    expect(githubRepositoryOf('git@github.com:ayxuerui/bambi.git')).toBe('ayxuerui/bambi');
    expect(githubRepositoryOf('ssh://git@github.com/ayxuerui/bambi.git')).toBe('ayxuerui/bambi');
    expect(githubRepositoryOf('https://gitlab.com/ayxuerui/pkm.git')).toBeNull();
    expect(githubRepositoryOf('/srv/git/pkm.git')).toBeNull();
  });
});
