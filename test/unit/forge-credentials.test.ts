import { generateKeyPairSync, verify } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ForgeCredentialsError } from '../../src/core/errors.js';
import {
  appAssertion,
  githubOwnerOf,
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

/** reach-each-owner-with-its-own-token: a tokens directory holding `files`, removed after `body`. */
async function withTokensDir(files: Record<string, string>, body: (dir: string) => Promise<void>): Promise<void> {
  const tmp = await makeTmpDir();
  try {
    const dir = path.join(tmp.root, 'owner-tokens');
    await mkdir(dir);
    for (const [name, text] of Object.entries(files)) await writeFile(path.join(dir, name), text);
    await body(dir);
  } finally {
    await tmp.cleanup();
  }
}

/** A git that answers every command with `url`, and counts what it was asked. */
function countingGit(url: string): GitRunner & { calls: string[][] } {
  const calls: string[][] = [];
  return { calls, run: async (args) => (calls.push([...args]), { stdout: `${url}\n`, stderr: '', exitCode: 0 }) };
}

const TOKEN_B = 'github_pat_11ctxBorgSECRETtokenvalue';

describe('owner token credentials', () => {
  it('reads no directory and asks git nothing when the variable is unset', async () => {
    const git = countingGit('https://github.com/ctx-b-org/ctx-b.git');
    const env = { PATH: '/bin' };
    const credentials = await resolveForgeCredentials({ env, git, cwd: '/' });
    expect(credentials.kind).toBe('gh');
    expect(credentials.owner).toBeNull();
    expect(await credentials.env()).toBe(env);
    expect(git.calls).toEqual([]);
  });

  it("uses the owner's file for gh and git alike, trimmed, keeping the rest of the environment", async () => {
    await withTokensDir({ 'ctx-b-org': `  ${TOKEN_B}\n` }, async (dir) => {
      const env = { CONTEXTURE_GITHUB_OWNER_TOKENS_DIR: dir, GH_TOKEN: 'the-persons-own', PATH: '/bin' };
      const credentials = await resolveForgeCredentials({ env, git: originGit('https://github.com/ctx-b-org/ctx-b.git'), cwd: '/' });
      expect(credentials.kind).toBe('owner-token');
      expect(credentials.owner).toBe('ctx-b-org');
      expect(await credentials.env()).toEqual({ ...env, GH_TOKEN: TOKEN_B });
      expect(await credentials.gitToken()).toBe(TOKEN_B);
      expect(await credentials.botLogin()).toBeNull();
      expect(credentials.derivedSecret('x')).toBeNull();
    });
  });

  it('reads the owner from an ssh origin, and from a declared URL before any clone', async () => {
    await withTokensDir({ 'ctx-b-org': TOKEN_B }, async (dir) => {
      const env = { CONTEXTURE_GITHUB_OWNER_TOKENS_DIR: dir };
      const ssh = await resolveForgeCredentials({ env, git: originGit('git@github.com:ctx-b-org/ctx-b.git'), cwd: '/' });
      expect(ssh.kind).toBe('owner-token');
      const git = countingGit('https://github.com/ctx-a-owner/ctx-a.git');
      const declared = await resolveForgeCredentials({ env, git, cwd: '/', url: 'https://github.com/ctx-b-org/ctx-b.git' });
      expect(declared.owner).toBe('ctx-b-org');
      expect(git.calls).toEqual([]);
    });
  });

  it("keeps gh's credential for an owner with no file, and for a repository not on github.com", async () => {
    await withTokensDir({ 'ctx-b-org': TOKEN_B }, async (dir) => {
      const env = { CONTEXTURE_GITHUB_OWNER_TOKENS_DIR: dir };
      expect((await resolveForgeCredentials({ env, git: originGit('https://github.com/ctx-a-owner/ctx-a.git'), cwd: '/' })).kind).toBe('gh');
      expect((await resolveForgeCredentials({ env, git: originGit('/srv/git/ctx-b-org/ctx-b.git'), cwd: '/' })).kind).toBe('gh');
      const noOrigin: GitRunner = { run: async () => ({ stdout: '', stderr: '', exitCode: 1 }) };
      expect((await resolveForgeCredentials({ env, git: noOrigin, cwd: '/' })).kind).toBe('gh');
    });
  });

  it("matches the owner's name without regard to case", async () => {
    await withTokensDir({ 'ctx-b-org': TOKEN_B }, async (dir) => {
      const credentials = await resolveForgeCredentials({ env: { CONTEXTURE_GITHUB_OWNER_TOKENS_DIR: dir }, git: originGit('https://github.com/CTX-B-Org/ctx-b.git'), cwd: '/' });
      expect(credentials.kind).toBe('owner-token');
      expect(credentials.owner).toBe('CTX-B-Org');
      expect(await credentials.gitToken()).toBe(TOKEN_B);
    });
  });

  it('refuses a directory that cannot be read, naming the variable', async () => {
    const error = await refusal(resolveForgeCredentials({ env: { CONTEXTURE_GITHUB_OWNER_TOKENS_DIR: '/nonexistent/owner-tokens' }, git: originGit('https://github.com/ctx-b-org/ctx-b.git'), cwd: '/' }));
    expect(error.message).toContain('CONTEXTURE_GITHUB_OWNER_TOKENS_DIR');
    expect(error.exitCode).toBe(2);
  });

  it('refuses an empty or unreadable owner file, naming its path and never a token', async () => {
    await withTokensDir({ 'ctx-b-org': ' \n', 'ctx-a-owner': TOKEN_B }, async (dir) => {
      const env = { CONTEXTURE_GITHUB_OWNER_TOKENS_DIR: dir };
      const empty = await refusal(resolveForgeCredentials({ env, git: originGit('https://github.com/ctx-b-org/ctx-b.git'), cwd: '/' }));
      expect(empty.message).toContain(path.join(dir, 'ctx-b-org'));
      await mkdir(path.join(dir, 'ctx-c-org'));
      const unreadable = await refusal(resolveForgeCredentials({ env, git: originGit('https://github.com/ctx-c-org/ctx-c.git'), cwd: '/' }));
      expect(unreadable.message).toContain(path.join(dir, 'ctx-c-org'));
      for (const error of [empty, unreadable]) expect(JSON.stringify({ message: error.message, details: error.finding })).not.toContain(TOKEN_B);
    });
  });

  it('refuses two files whose names differ only by case, naming both, rather than choosing one', async () => {
    await withTokensDir({ 'ctx-b-org': TOKEN_B, 'CTX-B-ORG': `${TOKEN_B}-other` }, async (dir) => {
      const error = await refusal(resolveForgeCredentials({ env: { CONTEXTURE_GITHUB_OWNER_TOKENS_DIR: dir }, git: originGit('https://github.com/ctx-b-org/ctx-b.git'), cwd: '/' }));
      expect(error.message).toContain(path.join(dir, 'ctx-b-org'));
      expect(error.message).toContain(path.join(dir, 'CTX-B-ORG'));
      expect(error.message).not.toContain(TOKEN_B);
    });
  });

  it('never reads the directory in App mode', async () => {
    const now = () => new Date();
    const github = fakeGithub({ now });
    const appEnv = { CONTEXTURE_GITHUB_APP_ID: '5354981', CONTEXTURE_GITHUB_APP_PRIVATE_KEY: PEM };
    // A directory that cannot be read would be refused if App mode looked at it.
    const unread = await resolveForgeCredentials({ env: { ...appEnv, CONTEXTURE_GITHUB_OWNER_TOKENS_DIR: '/nonexistent/owner-tokens' }, git: originGit('https://github.com/ayxuerui/ctx-a.git'), cwd: '/', fetch: github.fetch, now });
    expect(unread.kind).toBe('github-app');
    await withTokensDir({ ayxuerui: TOKEN_B }, async (dir) => {
      const credentials = await resolveForgeCredentials({ env: { ...appEnv, CONTEXTURE_GITHUB_OWNER_TOKENS_DIR: dir }, git: originGit('https://github.com/ayxuerui/ctx-a.git'), cwd: '/', fetch: github.fetch, now });
      expect(credentials.kind).toBe('github-app');
      expect(credentials.owner).toBeNull();
      expect(await credentials.gitToken()).toMatch(/^ghs_/);
    });
  });

  it("finds an App's installation from a declared URL before any clone", async () => {
    const now = () => new Date();
    const github = fakeGithub({ now });
    const appEnv = { CONTEXTURE_GITHUB_APP_ID: '5354981', CONTEXTURE_GITHUB_APP_PRIVATE_KEY: PEM };
    const credentials = await resolveForgeCredentials({ env: appEnv, git: originGit('/not/read'), cwd: '/', url: 'https://github.com/ayxuerui/ctx-a.git', fetch: github.fetch, now });
    expect(await credentials.gitToken()).toBe('ghs_1');
  });
});

describe('githubOwnerOf', () => {
  it('is the first path segment of a github.com URL, and null otherwise', () => {
    expect(githubOwnerOf('https://github.com/ReadyRun-AI/readyrun-brain.git')).toBe('ReadyRun-AI');
    expect(githubOwnerOf('git@github.com:ayxuerui/pkm.git')).toBe('ayxuerui');
    expect(githubOwnerOf('/srv/git/pkm.git')).toBeNull();
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
