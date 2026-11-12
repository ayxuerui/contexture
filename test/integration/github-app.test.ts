import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { makeApprovalStore, recordApproval, type ApprovalStore } from '../helpers/approval-store.js';
import { startFakeGithubApi, type FakeGithubApi } from '../helpers/fake-github-api.js';
import { startGitHttpOrigin } from '../helpers/git-http-origin.js';
import { runCli, runCliBackground, stopCliBackground } from '../helpers/run-cli.js';

const APP_ID = 5354981;
const SLUG = 'ctx-a-approvals';
const BOT = `${SLUG}[bot]`;
const REPO = 'ayxuerui/ctx-a';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()!();
});

/** A store whose recording identity is a GitHub App: the fake API mints tokens, and the fake gh refuses any other credential. */
async function appStore(opts: { recordingLogin?: string; installedOn?: string[] } = {}): Promise<{ store: ApprovalStore; api: FakeGithubApi; env: Record<string, string | undefined> }> {
  const api = await startFakeGithubApi({ appId: APP_ID, slug: SLUG, installedOn: opts.installedOn ?? [REPO] });
  cleanups.push(() => api.close());
  const store = await makeApprovalStore({ recordingLogin: opts.recordingLogin ?? BOT });
  cleanups.push(() => store.tmp.cleanup());
  const keyFile = path.join(store.tmp.root, 'app.pem');
  await writeFile(keyFile, api.privateKeyPem, { mode: 0o600 });
  await store.forge.update((state) => {
    state.login = BOT;
  });
  const env = {
    ...store.env,
    GH_TOKEN: undefined,
    CONTEXTURE_GITHUB_APP_ID: String(APP_ID),
    CONTEXTURE_GITHUB_APP_PRIVATE_KEY_FILE: keyFile,
    CONTEXTURE_GITHUB_API_URL: api.url,
    // The fixture's origin is a local bare repository, not a github.com URL.
    CONTEXTURE_GITHUB_REPOSITORY: REPO,
  };
  return { store, api, env };
}

/** Sessions are opened with the fixture's own credential-free fake gh; App mode is switched on only afterwards. */
async function requireAppTokens(store: ApprovalStore): Promise<void> {
  await store.forge.update((state) => {
    state.expectTokenPrefix = 'ghs_test_';
  });
}

function leaks(text: string, api: FakeGithubApi): string[] {
  const found: string[] = [];
  if (text.includes('PRIVATE KEY') || text.includes(api.privateKeyPem.split('\n')[1]!)) found.push('private key');
  if (api.minted.some((token) => text.includes(token))) found.push('installation token');
  if (/eyJ[\w-]+\.eyJ[\w-]+\./.test(text)) found.push('signed assertion');
  return found;
}

describe('a GitHub App as the recording identity (real CLI, fake GitHub)', () => {
  it('review list authenticates gh with a minted installation token and leaks no secret', async () => {
    const { store, api, env } = await appStore();
    const s = await store.openSession('ctx-a', 7, { 'projects/a.md': '# A\n' });
    await recordApproval(store, 7, s.head, 'a@example.com', BOT);
    await requireAppTokens(store);

    const result = await runCli(['review', 'list', '--json'], { cwd: store.root, env });
    expect(result.exitCode, result.stdout + result.stderr).toBe(0);
    const data = JSON.parse(result.stdout).data;
    expect(data.credential).toBe('github-app');
    expect(data.sessions[0]).toMatchObject({ state: 'approved', decided_by: 'a@example.com' });
    expect(api.minted).toHaveLength(1);
    expect(await store.forge.tokensSeen()).toEqual(api.minted);
    expect(leaks(result.stdout + result.stderr, api)).toEqual([]);
  });

  it('serve starts when the App bot login is the recording login, and reports the credential kind', async () => {
    const { store, api, env } = await appStore();
    const { child, firstLine } = await runCliBackground(['serve', '--port', '0', '--json'], { cwd: store.root, env });
    try {
      expect(JSON.parse(firstLine).data.credential).toBe('github-app');
      expect(leaks(firstLine, api)).toEqual([]);
    } finally {
      await stopCliBackground(child);
    }
  });

  it('serve refuses to start when the App bot login is not the recording login', async () => {
    const { store, env } = await appStore({ recordingLogin: 'ctx-approvals' });
    const result = await runCli(['serve', '--port', '0', '--json'], { cwd: store.root, env });
    expect(result.exitCode).toBe(2);
    const finding = JSON.parse(result.stdout).findings[0];
    expect(finding.code).toBe('change_approval.recording_login_mismatch');
    expect(finding.message).toContain('ctx-approvals');
    expect(finding.message).toContain(BOT);
  });

  it('names the repository and the App when the App is not installed there', async () => {
    const { store, env } = await appStore({ installedOn: ['ayxuerui/other'] });
    const result = await runCli(['serve', '--port', '0', '--json'], { cwd: store.root, env });
    expect(result.exitCode).toBe(2);
    const finding = JSON.parse(result.stdout).findings[0];
    expect(finding.code).toBe('forge.credentials');
    expect(finding.message).toContain(REPO);
    expect(finding.message).toContain(String(APP_ID));
  });

  it('refuses a partial App credential before any forge call', async () => {
    const { store, api, env } = await appStore();
    const result = await runCli(['review', 'list', '--json'], { cwd: store.root, env: { ...env, CONTEXTURE_GITHUB_APP_PRIVATE_KEY_FILE: undefined } });
    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stdout).findings[0].code).toBe('forge.credentials');
    expect(api.minted).toHaveLength(0);
  });

  it('land fetches and pushes over HTTP as the App with no other credential, and stores the token nowhere', async () => {
    const { store, api, env } = await appStore();
    const s = await store.openSession('ctx-a', 7, { 'projects/a.md': '# A\n' });
    await recordApproval(store, 7, s.head, 'a@example.com', BOT);
    await store.advanceMain({ 'projects/other.md': '# Other\n' });

    // From here on, origin is reachable only with an installation token the fake API minted.
    const origin = await startGitHttpOrigin(path.dirname(store.origin), path.basename(store.origin), (password) => api.minted.includes(password));
    cleanups.push(() => origin.close());
    await store.git(['config', 'http.receivepack', 'true'], store.origin);
    await store.git(['remote', 'set-url', 'origin', origin.url]);
    await requireAppTokens(store);

    const result = await runCli(['land', '7', '--json'], { cwd: store.root, env, timeoutMs: 60_000 });
    expect(result.exitCode, result.stdout + result.stderr).toBe(0);
    const data = JSON.parse(result.stdout).data;
    expect(data.credential).toBe('github-app');
    expect(data.results[0]).toMatchObject({ outcome: 'merged', catch_up: 'carried-over', records_posted: ['carry-over'], canonical_sync: { synced: true } });

    // Every fetch and the push reached the origin with the App's token, and nothing got in without one.
    expect(origin.requests.some((r) => r.path.endsWith('/git-receive-pack') && r.authorized)).toBe(true);
    expect(origin.requests.filter((r) => r.path.endsWith('/git-upload-pack')).every((r) => r.authorized)).toBe(true);
    // The carry-over review is the App's, and the merge landed.
    const state = await store.forge.read();
    expect(state.pulls[0]).toMatchObject({ merged: true });
    expect(state.reviews!['7']!.at(-1)!.user.login).toBe(BOT);

    // The token is stored nowhere.
    expect(await store.git(['remote', 'get-url', 'origin'])).toBe(origin.url);
    const config = await readFile(path.join(store.root, '.git', 'config'), 'utf8');
    expect(api.minted.some((token) => config.includes(token))).toBe(false);
    expect(leaks(result.stdout + result.stderr, api)).toEqual([]);
  });
});
