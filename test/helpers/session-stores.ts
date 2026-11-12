import { execFile } from 'node:child_process';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { makeFakeForges, type FakeForge, type FakePull } from './fake-forge.js';
import { hermeticGitEnv } from './git-env.js';
import { startGitHttpOrigin, type GitHttpOrigin } from './git-http-origin.js';
import { runCli } from './run-cli.js';
import { makeTmpDir, type TmpDir } from './tmp-store.js';
import { RECORDING_LOGIN } from './approval-store.js';

const execFileAsync = promisify(execFile);

/** One store of the pair: its canonical clone, its bare origin (whose path makes its forge slug), its fake forge. */
export interface PairStore {
  name: 'ctx-a' | 'ctx-b';
  slug: string;
  root: string;
  origin: string;
  forge: FakeForge;
}

export interface Part {
  store: PairStore;
  number: number;
  worktree: string;
  name: string;
  branch: string;
  head: string;
}

export interface SessionPair {
  tmp: TmpDir;
  env: Record<string, string | undefined>;
  a: PairStore;
  b: PairStore;
  /** ctx-a's clone of ctx-b, at `shared/ctx-b` in ctx-a's canonical clone. */
  mount: string;
  git(args: readonly string[], cwd: string): Promise<string>;
  cli(args: readonly string[], cwd: string): Promise<{ exitCode: number; stdout: string; stderr: string; json: any }>;
  /** Starts a session in ctx-a, commits `files`, pushes, and opens pull request `number` carrying the session marker. */
  openHome(label: string, number: number, files: Record<string, string>, pull?: Partial<FakePull>): Promise<Part>;
  /** Starts a session in the mount joined to `home`, commits, pushes, and opens pull request `number` on ctx-b with the marker. */
  openJoined(home: Part, number: number, files: Record<string, string>, pull?: Partial<FakePull>): Promise<Part>;
  commitIn(worktree: string, files: Record<string, string>, message: string): Promise<string>;
  /** Commits straight onto an origin's main, as a change landed elsewhere would. */
  advance(store: PairStore, files: Record<string, string>): Promise<string>;
  /** With `ownerTokens`: the tokens, the directory holding them, and the git server that takes only them. */
  owners?: OwnerTokensSetup;
  /** Stops whatever the pair started beyond its directory (the git server); call before `tmp.cleanup()`. */
  close(): Promise<void>;
}

export interface OwnerTokensSetup {
  /** ctx-a's owner's token, and ctx-b's. */
  tokenA: string;
  tokenB: string;
  /** The directory `CONTEXTURE_GITHUB_OWNER_TOKENS_DIR` names, with a file `ctx-a-owner` and a file `ctx-b-org`. */
  dir: string;
  /** Serves both origins over http, taking only token A under `/ctx-a-owner/` and only token B under `/ctx-b-org/`. */
  http: GitHttpOrigin;
  /** The environment for git run by the test itself: the CLI's, plus a credential helper per owner the CLI does not have. */
  fixtureEnv: Record<string, string | undefined>;
}

export interface SessionPairOptions {
  baseUrl?: string;
  identity?: { issuer: string; audience: string; jwksUrl: string };
  /** ctx-b's deciders, as YAML flow-sequence entries. */
  bDeciders?: string;
  /** Leave ctx-b without a change_approval block. */
  bNoApproval?: boolean;
  /**
   * reach-each-owner-with-its-own-token: ctx-a is `github.com/ctx-a-owner/ctx-a` and ctx-b is
   * `github.com/ctx-b-org/ctx-b`, served over http (git's `insteadOf`) by a server that takes only token A for the
   * first owner and only token B for the second; each fake forge takes only its owner's token too. The CLI gets
   * the tokens through `CONTEXTURE_GITHUB_OWNER_TOKENS_DIR` and has no other git credential.
   */
  ownerTokens?: boolean;
}

async function writeFiles(cwd: string, files: Record<string, string>): Promise<void> {
  for (const [rel, text] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(cwd, rel)), { recursive: true });
    await writeFile(path.join(cwd, rel), text);
  }
}

/**
 * approve-sessions-across-stores: `ctx-a` mounts `ctx-b`; both are stores made
 * by `ctxr init`, with origins at `example/ctx-a.git` and `example/ctx-b.git`
 * (so their forge slugs are `example/ctx-a` and `example/ctx-b`), one fake
 * forge answering for each, and change approval declared in each.
 */
export async function makeSessionPair(opts: SessionPairOptions = {}): Promise<SessionPair> {
  const tmp = await makeTmpDir();
  const owned = opts.ownerTokens === true;
  const githubRoot = path.join(tmp.root, 'github');
  const originDir = path.join(tmp.root, 'example');
  const aOrigin = owned ? path.join(githubRoot, 'ctx-a-owner', 'ctx-a.git') : path.join(originDir, 'ctx-a.git');
  const bOrigin = owned ? path.join(githubRoot, 'ctx-b-org', 'ctx-b.git') : path.join(originDir, 'ctx-b.git');
  await mkdir(path.dirname(aOrigin), { recursive: true });
  await mkdir(path.dirname(bOrigin), { recursive: true });

  let owners: OwnerTokensSetup | undefined;
  let forgeEnv: Record<string, string>;
  let forges: FakeForge[];
  let env: Record<string, string | undefined>;
  let fixtureEnv: Record<string, string | undefined>;
  if (owned) {
    const tokenA = 'github_pat_ctxAownerAAAA0123456789';
    const tokenB = 'github_pat_ctxBorgBBBB9876543210';
    const dir = path.join(tmp.root, 'owner-tokens');
    await mkdir(dir);
    await writeFile(path.join(dir, 'ctx-a-owner'), `${tokenA}\n`, { mode: 0o600 });
    await writeFile(path.join(dir, 'ctx-b-org'), `${tokenB}\n`, { mode: 0o600 });
    const http = await startGitHttpOrigin(githubRoot, 'unused', (password, pathname) =>
      pathname.startsWith('/ctx-a-owner/') ? password === tokenA : pathname.startsWith('/ctx-b-org/') && password === tokenB,
    );
    ({ env: forgeEnv, forges } = await makeFakeForges(tmp.root, [
      { origin: aOrigin, url: `${http.base}/ctx-a-owner/ctx-a.git`, state: { login: RECORDING_LOGIN, pulls: [], expectTokenPrefix: tokenA } },
      { origin: bOrigin, url: `${http.base}/ctx-b-org/ctx-b.git`, state: { login: RECORDING_LOGIN, pulls: [], expectTokenPrefix: tokenB } },
    ]));
    // github.com is reached through the local server; nothing but the tokens directory gives the CLI a credential.
    env = hermeticGitEnv({
      ...forgeEnv,
      GIT_CONFIG_COUNT: '2',
      GIT_CONFIG_KEY_1: `url.${http.base}/.insteadOf`,
      GIT_CONFIG_VALUE_1: 'https://github.com/',
      GIT_TERMINAL_PROMPT: '0',
      CONTEXTURE_GITHUB_OWNER_TOKENS_DIR: dir,
    });
    const helper = (token: string) => `!f() { echo username=x-access-token; echo password=${token}; }; f`;
    fixtureEnv = {
      ...env,
      GIT_CONFIG_COUNT: '4',
      GIT_CONFIG_KEY_2: `credential.${http.base}/ctx-a-owner.helper`,
      GIT_CONFIG_VALUE_2: helper(tokenA),
      GIT_CONFIG_KEY_3: `credential.${http.base}/ctx-b-org.helper`,
      GIT_CONFIG_VALUE_3: helper(tokenB),
    };
    owners = { tokenA, tokenB, dir, http, fixtureEnv };
  } else {
    ({ env: forgeEnv, forges } = await makeFakeForges(tmp.root, [
      { origin: aOrigin, state: { login: RECORDING_LOGIN, pulls: [] } },
      { origin: bOrigin, state: { login: RECORDING_LOGIN, pulls: [] } },
    ]));
    env = hermeticGitEnv(forgeEnv);
    fixtureEnv = env;
  }
  const remoteOf = (name: 'ctx-a' | 'ctx-b', origin: string) => (owned ? `https://github.com/${name === 'ctx-a' ? 'ctx-a-owner' : 'ctx-b-org'}/${name}.git` : origin);
  const git = async (args: readonly string[], cwd: string): Promise<string> =>
    (await execFileAsync('git', [...args], { cwd, env: fixtureEnv as NodeJS.ProcessEnv })).stdout.trim();
  const cli = async (args: readonly string[], cwd: string) => {
    const r = await runCli([...args, '--json'], { cwd, env, timeoutMs: 120_000 });
    let json: unknown = null;
    try {
      json = JSON.parse(r.stdout);
    } catch {
      json = null;
    }
    return { ...r, json: json as any };
  };

  const identity = opts.identity ?? { issuer: 'https://ctx-a.example.test', audience: 'aud-1', jwksUrl: 'https://ctx-a.example.test/certs' };
  const approvalBlock = (deciders: string) =>
    'change_approval:\n' +
    `  identity: { header: Cf-Access-Jwt-Assertion, issuer: "${identity.issuer}", audience: ${identity.audience}, jwks_url: "${identity.jwksUrl}" }\n` +
    `  deciders: [${deciders}]\n` +
    `  recording_login: "${RECORDING_LOGIN}"\n`;

  const makeStore = async (name: 'ctx-a' | 'ctx-b', origin: string, extra: string): Promise<string> => {
    const root = path.join(tmp.root, name);
    await execFileAsync('git', ['init', '-q', '--bare', '-b', 'main', origin], { env: env as NodeJS.ProcessEnv });
    await git(['config', 'receive.autogc', 'false'], origin);
    await git(['config', 'gc.auto', '0'], origin);
    await mkdir(root, { recursive: true });
    await git(['init', '-q', '-b', 'main'], root);
    const init = await runCli(['init'], { cwd: root, env, timeoutMs: 60_000 });
    if (init.exitCode !== 0) throw new Error(`init failed (exit ${init.exitCode}): ${init.stderr}${init.stdout}`);
    await appendFile(path.join(root, 'contexture.yaml'), `serve:\n  base_url: "${opts.baseUrl ?? `https://${name}.example.test`}"\n${extra}`);
    await git(['commit', '-qam', 'declare change approval'], root);
    await git(['remote', 'add', 'origin', remoteOf(name, origin)], root);
    await git(['push', '-q', '--no-verify', 'origin', 'main'], root);
    await git(['fetch', '-q', 'origin'], root);
    return root;
  };

  const bRoot = await makeStore('ctx-b', bOrigin, opts.bNoApproval ? '' : approvalBlock(opts.bDeciders ?? '"@example.com"'));
  const aRoot = await makeStore('ctx-a', aOrigin, `${approvalBlock('"@example.com"')}shared_stores:\n  - { name: ctx-b, url: "${remoteOf('ctx-b', bOrigin)}" }\n`);
  const synced = await runCli(['shared-stores', 'sync'], { cwd: aRoot, env, timeoutMs: 60_000 });
  if (synced.exitCode !== 0) throw new Error(`shared-stores sync failed: ${synced.stderr}${synced.stdout}`);
  // A fresh clone has no hooks wired; the first `ctxr doctor` there wires them, as it would for a person.
  await runCli(['doctor'], { cwd: path.join(aRoot, 'shared', 'ctx-b'), env, timeoutMs: 60_000 });

  const a: PairStore = { name: 'ctx-a', slug: owned ? 'ctx-a-owner/ctx-a' : 'example/ctx-a', root: aRoot, origin: aOrigin, forge: forges[0]! };
  const b: PairStore = { name: 'ctx-b', slug: owned ? 'ctx-b-org/ctx-b' : 'example/ctx-b', root: bRoot, origin: bOrigin, forge: forges[1]! };
  const mount = path.join(aRoot, 'shared', 'ctx-b');
  const { sessionMarker } = await import('../../src/core/approval/session-marker.js');

  const commitIn = async (worktree: string, files: Record<string, string>, message: string): Promise<string> => {
    await writeFiles(worktree, files);
    await git(['add', ...Object.keys(files)], worktree);
    await git(['commit', '-q', '--no-verify', '-m', message], worktree);
    return git(['rev-parse', 'HEAD'], worktree);
  };

  const open = async (store: PairStore, cwd: string, args: string[], number: number, files: Record<string, string>, pull: Partial<FakePull>): Promise<Part> => {
    const started = await cli(['session', 'start', ...args], cwd);
    if (started.exitCode !== 0) throw new Error(`session start failed: ${started.stdout}${started.stderr}`);
    const data = started.json.data as { worktree: string; branch: string; session: { home: string; branch: string } };
    const head = await commitIn(data.worktree, files, `change ${number}`);
    await git(['push', '-q', '--no-verify', 'origin', data.branch], data.worktree);
    await store.forge.update((state) => {
      state.pulls.push({ number, head: data.branch, title: `Change ${number}`, body: `Why: change ${number}.\n\n${sessionMarker(data.session)}`, ...pull });
    });
    return { store, number, worktree: data.worktree, name: path.basename(data.worktree), branch: data.branch, head };
  };

  return {
    tmp,
    env,
    a,
    b,
    mount,
    git,
    cli,
    commitIn,
    owners,
    close: async () => {
      await owners?.http.close();
    },
    openHome: (label, number, files, pull = {}) => open(a, aRoot, [label], number, files, pull),
    openJoined: (home, number, files, pull = {}) => open(b, mount, ['--joins', home.name], number, files, pull),
    async advance(store, files) {
      const scratch = path.join(tmp.root, `scratch-${Date.now()}-${Math.random().toString(16).slice(2)}`);
      await git(['clone', '-q', store.origin, scratch], tmp.root);
      await writeFiles(scratch, files);
      await git(['add', ...Object.keys(files)], scratch);
      await git(['commit', '-q', '--no-verify', '-m', 'advance main'], scratch);
      await git(['push', '-q', '--no-verify', 'origin', 'HEAD:main'], scratch);
      return git(['rev-parse', 'HEAD'], scratch);
    },
  };
}

/** A session decision by the recording login, posted straight into a forge's state, as the approval page would record it. */
export async function recordSessionDecision(
  record: { store: PairStore; number: number; head: string },
  parts: readonly { store: PairStore; number: number; head: string }[],
  session: { home: string; branch: string },
  opts: { id?: string; by?: string; kind?: 'approve' | 'request-changes'; comment?: string | null } = {},
): Promise<void> {
  const { decisionBody } = await import('../../src/core/approval/decision.js');
  const at = new Date().toISOString();
  const kind = opts.kind ?? 'approve';
  await record.store.forge.update((state) => {
    state.reviews ??= {};
    (state.reviews[record.number] ??= []).push({
      user: { login: RECORDING_LOGIN },
      state: kind === 'approve' ? 'APPROVED' : 'CHANGES_REQUESTED',
      body: decisionBody({
        decision: kind,
        head: record.head,
        by: opts.by ?? 'a@example.com',
        at,
        carriedFrom: null,
        comment: kind === 'approve' ? null : (opts.comment ?? 'please change'),
        session: { id: opts.id ?? 'd-1', session, parts: parts.map((p) => ({ store: p.store.slug, number: p.number, head: p.head })) },
      }),
      commit_id: record.head,
      submitted_at: at,
    });
  });
}
