import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCli } from '../helpers/run-cli.js';
import { makeSessionPair, recordSessionDecision, type SessionPair } from '../helpers/session-stores.js';

/**
 * reach-each-owner-with-its-own-token: ctx-a (`github.com/ctx-a-owner/ctx-a`)
 * mounts ctx-b (`github.com/ctx-b-org/ctx-b`). The git server and each fake
 * forge take only their own owner's token, and the CLI has no credential but
 * the tokens directory, so every step that succeeds used the right token.
 */
describe('shared-stores, session and land: a mount owned by another GitHub owner, reached with its own token (real CLI)', () => {
  let pair: SessionPair;
  /** Every stdout and stderr the CLI printed in a test, checked for the tokens at the end. */
  let printed: string[];

  beforeEach(async () => {
    pair = await makeSessionPair({ ownerTokens: true });
    printed = [];
  });

  afterEach(async () => {
    await pair.close();
    await pair.tmp.cleanup();
  });

  const owners = () => pair.owners!;
  const cli = async (args: string[], cwd: string, env: Record<string, string | undefined> = {}) => {
    const r = await runCli([...args, '--json'], { cwd, env: { ...pair.env, ...env }, timeoutMs: 120_000 });
    printed.push(r.stdout, r.stderr);
    let json: any = null;
    try {
      json = JSON.parse(r.stdout);
    } catch {
      json = null;
    }
    return { ...r, json };
  };
  /** A tokens directory holding only `files`. */
  const tokensDir = async (name: string, files: Record<string, string>) => {
    const dir = path.join(pair.tmp.root, name);
    await mkdir(dir);
    for (const [owner, text] of Object.entries(files)) await writeFile(path.join(dir, owner), text, { mode: 0o600 });
    return dir;
  };
  /** Any part of either token: the whole, or the distinctive middle of each. */
  const tokenParts = () => [owners().tokenA, owners().tokenB, 'ctxAownerAAAA', 'ctxBorgBBBB'];
  async function filesUnder(dir: string): Promise<string[]> {
    const out: string[] = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Git's object store is compressed: what git could have written there is checked through `git` itself below.
        if (entry.name !== 'objects') out.push(...(await filesUnder(full)));
      } else if (entry.isFile()) out.push(full);
    }
    return out;
  }
  async function expectNoTokenIn(dir: string): Promise<void> {
    for (const file of await filesUnder(dir)) {
      const text = await readFile(file, 'utf8');
      for (const part of tokenParts()) expect(text.includes(part), `${file} holds part of a token`).toBe(false);
    }
  }

  it('syncs, starts, submits and lands in the mount with its owner token, and the home store with its own', async () => {
    const { http } = owners();
    // makeSessionPair cloned the mount with `ctxr shared-stores sync`: only token B opens /ctx-b-org/.
    expect(http.requests.some((r) => r.path.startsWith('/ctx-b-org/') && r.authorized)).toBe(true);
    expect(await pair.git(['config', '--get', 'remote.origin.url'], pair.mount)).toBe('https://github.com/ctx-b-org/ctx-b.git');

    // A fetch that fast-forwards the mount, reporting the credential and its owner.
    await pair.advance(pair.b, { 'projects/elsewhere.md': '# Elsewhere\n' });
    const synced = await cli(['shared-stores', 'sync'], pair.a.root);
    expect(synced.exitCode, synced.stdout + synced.stderr).toBe(0);
    expect(synced.json.data.mounts).toEqual([expect.objectContaining({ name: 'ctx-b', outcome: 'fast_forwarded', credential: 'owner-token', credential_owner: 'ctx-b-org' })]);

    // A home session, and a session in the mount joined to it: its start fetches with token B.
    const home = await pair.openHome('ctx-move', 7, { 'projects/gone.md': '# Gone\n' });
    await pair.advance(pair.b, { 'projects/later.md': '# Later\n' });
    const started = await cli(['session', 'start', '--joins', home.name], pair.mount);
    expect(started.exitCode, started.stdout + started.stderr).toBe(0);
    expect(started.json.data.fetched).toBe(true);
    expect(started.json.data.startPoint).toBe('origin/main');
    const worktree = started.json.data.worktree as string;
    // Cut from the forge's default branch, which the mount's own clone had not seen.
    await expect(readFile(path.join(worktree, 'projects', 'later.md'), 'utf8')).resolves.toBe('# Later\n');

    // Submit pushes and opens the pull request on ctx-b with token B.
    await mkdir(path.join(worktree, 'projects'), { recursive: true });
    await writeFile(path.join(worktree, 'projects', 'moved.md'), '# Moved\n\nA note moved into ctx-b.\n');
    expect((await runCli(['catalog', 'build'], { cwd: worktree, env: pair.env, timeoutMs: 60_000 })).exitCode).toBe(0);
    const submitted = await cli(
      ['session', 'submit', path.basename(worktree), '--branch', 'notes/move', '--message', 'Move a note', '--title', 'Move a note', '--body', 'Why: move it.'],
      pair.mount,
    );
    expect(submitted.exitCode, submitted.stdout + submitted.stderr + (await pair.b.forge.log())).toBe(0);
    expect(submitted.json.data).toMatchObject({ credential: 'owner-token', credential_owner: 'ctx-b-org', steps: { push: expect.any(String) } });
    const [pull] = (await pair.b.forge.read()).pulls;
    expect(pull).toBeDefined();
    const joinedHead = await pair.git(['rev-parse', 'HEAD'], worktree);

    // Review list reads both stores, each with its owner's token, and says so.
    const listed = await cli(['review', 'list'], pair.a.root);
    expect(listed.exitCode, listed.stdout + listed.stderr).toBe(0);
    expect(listed.json.data.credential).toBe('owner-token');
    expect(listed.json.data.credential_owner).toBe('ctx-a-owner');
    expect(listed.json.data.store_credentials).toEqual([
      { store: 'ctx-a-owner/ctx-a', credential: 'owner-token', credential_owner: 'ctx-a-owner' },
      { store: 'ctx-b-org/ctx-b', credential: 'owner-token', credential_owner: 'ctx-b-org' },
    ]);

    // Land the whole session from its home: the mounted part with token B, the home part with token A.
    const identity = { home: 'ctx-a-owner/ctx-a', branch: home.branch };
    const parts = [
      { store: pair.b, number: pull!.number, head: joinedHead },
      { store: pair.a, number: 7, head: home.head },
    ];
    await recordSessionDecision({ store: pair.a, number: 7, head: home.head }, parts, identity);
    const landed = await cli(['land', '--session', home.name, '--confirm'], pair.a.root);
    expect(landed.exitCode, landed.stdout + landed.stderr + (await pair.a.forge.log()) + (await pair.b.forge.log())).toBe(0);
    expect(landed.json.data.sessions).toEqual([expect.objectContaining({ state: 'landed', landed: [`ctx-b-org/ctx-b#${pull!.number}`, 'ctx-a-owner/ctx-a#7'] })]);
    expect(landed.json.data.store_credentials).toEqual([
      { store: 'ctx-a-owner/ctx-a', credential: 'owner-token', credential_owner: 'ctx-a-owner' },
      { store: 'ctx-b-org/ctx-b', credential: 'owner-token', credential_owner: 'ctx-b-org' },
    ]);
    const onMain = async (origin: string, file: string) => (await pair.git(['--git-dir', origin, 'ls-tree', '-r', '--name-only', 'main'], pair.tmp.root)).split('\n').includes(file);
    expect(await onMain(pair.b.origin, 'projects/moved.md')).toBe(true);
    expect(await onMain(pair.a.origin, 'projects/gone.md')).toBe(true);

    // Each forge saw only its own owner's token; the git server refused every other.
    expect(await pair.a.forge.tokensSeen()).toEqual([owners().tokenA]);
    expect(await pair.b.forge.tokensSeen()).toEqual([owners().tokenB]);

    // Nothing recorded either token: remote URLs, git configuration, working trees, output.
    for (const root of [pair.mount, pair.a.root]) {
      expect(await pair.git(['config', '--get', 'remote.origin.url'], root)).toMatch(/^https:\/\/github\.com\/ctx-[ab]-(owner|org)\/ctx-[ab]\.git$/);
      await expectNoTokenIn(root);
    }
    for (const text of printed) for (const part of tokenParts()) expect(text).not.toContain(part);
  });

  it('status reports each mount’s credential without a network call or a change', async () => {
    const before = owners().http.requests.length;
    const tree = await pair.git(['status', '--porcelain', '--ignored'], pair.mount);
    const owned = await cli(['shared-stores', 'status'], pair.a.root);
    expect(owned.exitCode, owned.stdout + owned.stderr).toBe(0);
    expect(owned.json.data.mounts).toEqual([expect.objectContaining({ name: 'ctx-b', credential: 'owner-token', credential_owner: 'ctx-b-org' })]);

    const onlyA = await tokensDir('only-a', { 'ctx-a-owner': owners().tokenA });
    const plain = await cli(['shared-stores', 'status'], pair.a.root, { CONTEXTURE_GITHUB_OWNER_TOKENS_DIR: onlyA });
    expect(plain.json.data.mounts).toEqual([expect.objectContaining({ name: 'ctx-b', credential: 'gh', credential_owner: null })]);
    expect(await pair.git(['status', '--porcelain', '--ignored'], pair.mount)).toBe(tree);

    // An absent mount resolves from its declared URL.
    await rm(pair.mount, { recursive: true, force: true });
    const absent = await cli(['shared-stores', 'status'], pair.a.root);
    expect(absent.json.data.mounts).toEqual([expect.objectContaining({ present: false, credential: 'owner-token', credential_owner: 'ctx-b-org' })]);

    expect(owners().http.requests.length).toBe(before);
    for (const text of printed) for (const part of tokenParts()) expect(text).not.toContain(part);
  });

  it('a clone the forge refuses names the owner, the credential used, and where its token goes', async () => {
    await rm(pair.mount, { recursive: true, force: true });
    const onlyA = await tokensDir('only-a', { 'ctx-a-owner': owners().tokenA });
    const run = await cli(['shared-stores', 'sync'], pair.a.root, { CONTEXTURE_GITHUB_OWNER_TOKENS_DIR: onlyA });
    expect(run.exitCode).toBe(3);
    const [mount] = run.json.data.mounts as { outcome: string; reason: string; credential: string }[];
    expect(mount!.outcome).toBe('failed');
    expect(mount!.credential).toBe('gh');
    expect(mount!.reason).toContain('ctx-b-org');
    expect(mount!.reason).toContain('the forge refused the gh credential');
    expect(mount!.reason).toContain('CONTEXTURE_GITHUB_OWNER_TOKENS_DIR');
  });

  it('an empty token file is refused before any git command, naming its path', async () => {
    await rm(pair.mount, { recursive: true, force: true });
    const empty = await tokensDir('empty', { 'ctx-a-owner': owners().tokenA, 'ctx-b-org': '  \n' });
    const before = owners().http.requests.length;
    const run = await cli(['shared-stores', 'sync'], pair.a.root, { CONTEXTURE_GITHUB_OWNER_TOKENS_DIR: empty });
    expect(run.exitCode).toBe(2);
    expect(run.stdout + run.stderr).toContain(path.join(empty, 'ctx-b-org'));
    expect(owners().http.requests.length).toBe(before);
    await expect(readdir(pair.mount)).rejects.toThrow();

    const missing = await cli(['shared-stores', 'sync'], pair.a.root, { CONTEXTURE_GITHUB_OWNER_TOKENS_DIR: path.join(pair.tmp.root, 'no-such-dir') });
    expect(missing.exitCode).toBe(2);
    expect(missing.stdout + missing.stderr).toContain('CONTEXTURE_GITHUB_OWNER_TOKENS_DIR');
  });
});
