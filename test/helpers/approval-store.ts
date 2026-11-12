import { execFile } from 'node:child_process';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { makeFakeForge, type FakeForge, type FakePull } from './fake-forge.js';
import { hermeticGitEnv } from './git-env.js';
import { runCli } from './run-cli.js';
import { makeTmpDir, type TmpDir } from './tmp-store.js';

const execFileAsync = promisify(execFile);

export const RECORDING_LOGIN = 'ctx-approvals';
export const BASE_URL = 'http://127.0.0.1:1';

export interface ApprovalSession {
  number: number;
  worktree: string;
  name: string;
  branch: string;
  head: string;
}

export interface ApprovalStore {
  tmp: TmpDir;
  /** The canonical clone, on `main`. */
  root: string;
  /** The bare repository standing in for the forge's git side. */
  origin: string;
  env: Record<string, string | undefined>;
  forge: FakeForge;
  git(args: readonly string[], cwd?: string): Promise<string>;
  /** Starts a session, writes `files` in it, commits, pushes, and opens a pull request numbered `number`. */
  openSession(label: string, number: number, files: Record<string, string>, pull?: Partial<FakePull>): Promise<ApprovalSession>;
  /**
   * Commits `files` straight onto origin's main, as another landed change would. With `catalogued`, the catalog is
   * rebuilt in the same commit, so the store still passes `ctxr doctor` — what a gate such as `session submit` runs.
   */
  advanceMain(files: Record<string, string>, message?: string, opts?: { catalogued?: boolean }): Promise<string>;
  commitInWorktree(worktree: string, files: Record<string, string>, message: string): Promise<string>;
}

export interface ApprovalStoreOptions {
  /** Extra YAML lines appended inside the change_approval block (indented two spaces). */
  approvalExtra?: string;
  baseUrl?: string;
  /** Omit the change_approval block entirely. */
  noApproval?: boolean;
  identity?: { issuer: string; audience: string; jwksUrl: string };
  /** The recording login declared, and the login the fake forge authors reviews as. */
  recordingLogin?: string;
}

/**
 * A store whose origin is a local bare repository and whose forge is the fake
 * `gh` (test/helpers/fake-gh.mjs), with change approval declared — the fixture
 * the review, land and approval-page tests share.
 */
export async function makeApprovalStore(opts: ApprovalStoreOptions = {}): Promise<ApprovalStore> {
  const tmp = await makeTmpDir();
  const origin = path.join(tmp.root, 'origin.git');
  const root = path.join(tmp.root, 'store');
  const recordingLogin = opts.recordingLogin ?? RECORDING_LOGIN;
  const forge = await makeFakeForge(tmp.root, { login: recordingLogin, pulls: [] }, origin);
  const env = hermeticGitEnv(forge.env);
  const git = async (args: readonly string[], cwd = root): Promise<string> =>
    (await execFileAsync('git', [...args], { cwd, env: env as NodeJS.ProcessEnv })).stdout.trim();

  await execFileAsync('git', ['init', '-q', '--bare', '-b', 'main', origin], { env: env as NodeJS.ProcessEnv });
  // Every push into the origin starts `git gc --auto` in the background (receive.autogc). `advanceMain`'s local
  // clone copies loose object files directly, so a gc packing them mid-copy fails the clone with "failed to copy
  // file … No such file or directory". The tests never need the origin collected.
  await git(['config', 'receive.autogc', 'false'], origin);
  await git(['config', 'gc.auto', '0'], origin);
  await mkdir(root, { recursive: true });
  await git(['init', '-q', '-b', 'main']);
  // A generous limit: under load `init` can pass the 10 s default and be killed with no output.
  const init = await runCli(['init'], { cwd: root, env, timeoutMs: 60_000 });
  if (init.exitCode !== 0) throw new Error(`init failed (exit ${init.exitCode}): ${init.stderr}${init.stdout}`);

  const identity = opts.identity ?? { issuer: 'https://ctx-a.example.test', audience: 'aud-1', jwksUrl: 'https://ctx-a.example.test/certs' };
  const block = opts.noApproval
    ? ''
    : 'change_approval:\n' +
      `  identity: { header: Cf-Access-Jwt-Assertion, issuer: "${identity.issuer}", audience: ${identity.audience}, jwks_url: "${identity.jwksUrl}" }\n` +
      '  deciders: ["@example.com"]\n' +
      `  recording_login: "${recordingLogin}"\n` +
      (opts.approvalExtra ?? '');
  await appendFile(path.join(root, 'contexture.yaml'), `serve:\n  base_url: "${opts.baseUrl ?? BASE_URL}"\n${block}`);
  await git(['commit', '-qam', 'declare change approval']);
  await git(['remote', 'add', 'origin', origin]);
  await git(['push', '-q', '--no-verify', 'origin', 'main']);
  await git(['fetch', '-q', 'origin']);

  const writeFiles = async (cwd: string, files: Record<string, string>): Promise<void> => {
    for (const [rel, text] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(cwd, rel)), { recursive: true });
      await writeFile(path.join(cwd, rel), text);
    }
  };

  const store: ApprovalStore = {
    tmp,
    root,
    origin,
    env,
    forge,
    git,
    async commitInWorktree(worktree, files, message) {
      await writeFiles(worktree, files);
      await git(['add', ...Object.keys(files)], worktree);
      await git(['commit', '-q', '-m', message], worktree);
      return git(['rev-parse', 'HEAD'], worktree);
    },
    async openSession(label, number, files, pull = {}) {
      const started = await runCli(['session', 'start', label, '--json'], { cwd: root, env, timeoutMs: 60_000 });
      if (started.exitCode !== 0) throw new Error(`session start failed: ${started.stdout}${started.stderr}`);
      const data = JSON.parse(started.stdout).data as { worktree: string; branch: string };
      const head = await store.commitInWorktree(data.worktree, files, `add ${label}`);
      await git(['push', '-q', 'origin', data.branch], data.worktree);
      await forge.update((state) => {
        state.pulls.push({ number, head: data.branch, title: `Add ${label}`, body: `Why: ${label}.`, ...pull });
      });
      return { number, worktree: data.worktree, name: path.basename(data.worktree), branch: data.branch, head };
    },
    async advanceMain(files, message = 'advance main', opts = {}) {
      const scratch = path.join(tmp.root, `scratch-${Date.now()}-${Math.random().toString(16).slice(2)}`);
      await git(['clone', '-q', origin, scratch], tmp.root);
      await writeFiles(scratch, files);
      await git(['add', ...Object.keys(files)], scratch);
      if (opts.catalogued === true) {
        const built = await runCli(['catalog', 'build'], { cwd: scratch, env, timeoutMs: 60_000 });
        if (built.exitCode !== 0) throw new Error(`catalog build failed: ${built.stderr}${built.stdout}`);
        await git(['add', '-A'], scratch);
      }
      await git(['commit', '-q', '--no-verify', '-m', message], scratch);
      await git(['push', '-q', '--no-verify', 'origin', 'HEAD:main'], scratch);
      await git(['fetch', '-q', 'origin']);
      return git(['rev-parse', 'HEAD'], scratch);
    },
  };
  return store;
}

/** An approving review by the recording login for `head`, posted straight into the fake forge's state. */
export async function recordApproval(store: ApprovalStore, number: number, head: string, by = 'a@example.com', login = RECORDING_LOGIN): Promise<void> {
  const { decisionBody } = await import('../../src/core/approval/decision.js');
  const at = new Date().toISOString();
  await store.forge.update((state) => {
    state.reviews ??= {};
    (state.reviews[number] ??= []).push({
      user: { login },
      state: 'APPROVED',
      body: decisionBody({ decision: 'approve', head, by, at, carriedFrom: null, comment: null }),
      commit_id: head,
      submitted_at: at,
    });
  });
}
