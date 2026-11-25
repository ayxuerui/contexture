import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ExitCode } from '../../src/core/exit-codes.js';
import { DIST_BIN } from '../helpers/dist-bin.js';
import { startOpenRouterStub, STUB_KEY } from '../helpers/openrouter-stub.js';
import { installSecondOpinionStubs } from '../helpers/second-opinion-stubs.js';
import { makeTmpDir, type TmpDir } from '../helpers/tmp-store.js';

/**
 * second-opinion-start-and-fetch, cli-contract requirements "`ctxr
 * second-opinion --detach` starts a run and returns its id", "`ctxr
 * second-opinion result` fetches a run within a bounded wait", "A detached run
 * that ends without finishing is reported as stopped", "One detached second
 * opinion runs at a time per machine user" and "A detached run's files are
 * private and removed an hour after it finishes" — against the built binary
 * and the stub model CLIs, as a skill or a harness runs it.
 */
const PLAN = '# Plan: rename the thing\n\n## Steps\nS1. Rename the module and update its callers.\n';
const ROLE_OF: Record<string, string> = { claude: 'architect', codex: 'skeptic', agy: 'pragmatist' };

function critique(role: string): string {
  return `## Role: ${role}\n\n## Verdict: APPROVE_WITH_CHANGES\n\n## Findings\n\n### F1 [major] confidence=0.7\nEvidence: S1\nIssue: ${role} marker MARK-${role}.\nChange: reword S1.\n\n## Suggested changes\n- reword\n\n## What you would NOT change\n- S1\n`;
}

let tmp: TmpDir;
let binDir: string;
let logDir: string;
let tmpDir: string;
const started: number[] = [];

beforeEach(async () => {
  tmp = await makeTmpDir('second-opinion-detach-');
  binDir = path.join(tmp.root, 'bin');
  logDir = path.join(tmp.root, 'log');
  tmpDir = path.join(tmp.root, 'tmp');
  for (const dir of [binDir, logDir, tmpDir]) mkdirSync(dir);
  installSecondOpinionStubs(binDir);
  writeFileSync(path.join(tmp.root, 'plan.md'), PLAN);
});
afterEach(async () => {
  // A detached run that a test left going is killed with its stub CLIs, so nothing outlives the test.
  for (const pid of started.splice(0)) {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      // Already gone.
    }
  }
  await tmp.cleanup();
});

type Behavior = Record<string, unknown>;

function run(args: string[], behaviors: Record<string, Behavior> = {}, env: Record<string, string> = {}) {
  const full: NodeJS.ProcessEnv = { ...process.env, HOME: tmp.root, TMPDIR: tmpDir, PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}`, CTXR_SECOND_OPINION_STUB_DIR: logDir };
  for (const cli of ['claude', 'codex', 'agy']) {
    full[`CTXR_SECOND_OPINION_STUB_${cli.toUpperCase()}`] = JSON.stringify(behaviors[cli] ?? { kind: 'ok', text: critique(ROLE_OF[cli]!) });
  }
  const result = spawnSync(process.execPath, [DIST_BIN, ...args], { cwd: tmp.root, env: { ...full, ...env }, encoding: 'utf8', input: '' });
  return { status: result.status, stdout: result.stdout, output: result.stdout + result.stderr };
}

const slow = (ms: number): Record<string, Behavior> =>
  Object.fromEntries(['claude', 'codex', 'agy'].map((cli) => [cli, { kind: 'ok', text: critique(ROLE_OF[cli]!), delayMs: ms }]));
const hang: Record<string, Behavior> = { claude: { kind: 'hang' }, codex: { kind: 'hang' }, agy: { kind: 'hang' } };

const runsRoot = () => {
  const name = readdirSync(tmpDir).find((n) => n.startsWith('ctxr-second-opinion-runs-'));
  return name === undefined ? null : path.join(tmpDir, name);
};
const runFile = (run: string) => path.join(runsRoot()!, run, 'run.json');

function detach(behaviors: Record<string, Behavior> = {}, extra: string[] = [], env: Record<string, string> = {}): string {
  const r = run(['second-opinion', 'critique', '--plan-file', 'plan.md', '--detach', ...extra], behaviors, env);
  expect(r.status, r.output).toBe(ExitCode.Ok);
  const id = /^run: ([a-z2-7]{26})$/m.exec(r.stdout)?.[1];
  expect(id, r.output).toBeDefined();
  const pid = JSON.parse(readFileSync(runFile(id!), 'utf8')).pid as number;
  started.push(pid);
  return id!;
}

const calls = (): unknown[] => ['claude', 'codex', 'agy'].flatMap((cli) => {
  const file = path.join(logDir, `${cli}.json`);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
});

describe('--detach', () => {
  it('returns at once with a run id while the model CLIs keep answering, and result fetches the critiques', () => {
    const before = Date.now();
    const id = detach(slow(3000));
    expect(Date.now() - before).toBeLessThan(2500);
    const r = run(['second-opinion', 'result', id, '--wait', '20']);
    expect(r.status, r.output).toBe(ExitCode.Ok);
    expect(r.stdout).toMatch(/===== critique-A =====[\s\S]*===== critique-B =====[\s\S]*===== critique-C =====[\s\S]*===== letters/);
    for (const role of Object.values(ROLE_OF)) expect(r.stdout).toContain(`MARK-${role}`);
  }, 30_000);

  it('makes every refusal a blocking run makes, and starts nothing when it refuses', () => {
    const r = run(['second-opinion', 'critique', '--detach', '--only', 'claude', '--plan-file', 'plan.md']);
    expect(r.status).toBe(ExitCode.Usage);
    expect(r.stdout).not.toMatch(/^run: /m);
    expect(calls()).toHaveLength(0);
    expect(readdirSync(runsRoot() ?? tmpDir).filter((n) => /^[a-z2-7]{26}$/.test(n))).toHaveLength(0);
  });

  it('refuses --detach with --out, and preflight takes no --detach', () => {
    expect(run(['second-opinion', 'poll', '--detach', '--out', 'answers', '--prompt-file', 'plan.md']).status).toBe(ExitCode.Usage);
    expect(run(['second-opinion', 'preflight', '--detach']).status).toBe(ExitCode.Usage);
    expect(calls()).toHaveLength(0);
  });

  it('keeps its plan and answers in a folder only its user can read, and never shows --run-folder in help', () => {
    const id = detach();
    const folder = path.join(runsRoot()!, id);
    expect(spawnSync('stat', ['-c', '%a', runsRoot()!, folder], { encoding: 'utf8' }).stdout.trim().split('\n')).toEqual(['700', '700']);
    expect(readFileSync(path.join(folder, 'input.md'), 'utf8')).toBe(PLAN);
    expect(run(['second-opinion', 'critique', '--help']).stdout).not.toContain('--run-folder');
  });
});

describe('result', () => {
  it('reports an unfinished run as running within the wait, with state running under --json', () => {
    const id = detach(hang, ['--timeout', '60']);
    const before = Date.now();
    const r = run(['--json', 'second-opinion', 'result', id, '--wait', '1']);
    expect(Date.now() - before).toBeLessThan(5000);
    expect(r.status).toBe(ExitCode.Ok);
    const envelope = JSON.parse(r.stdout);
    expect(envelope.data).toMatchObject({ run: id, state: 'running' });
    expect(run(['second-opinion', 'result', id, '--wait', '0']).stdout).toMatch(new RegExp(`^running: ${id} \\(\\d+s so far\\)`));
  }, 20_000);

  it('keeps a partial run’s failed-check code', () => {
    const id = detach({ claude: { kind: 'exit', code: 2 }, codex: { kind: 'exit', code: 2 } });
    const r = run(['second-opinion', 'result', id, '--wait', '20']);
    expect(r.status).toBe(ExitCode.CheckFailed);
    expect(r.stdout).toMatch(/PARTIAL/);
  }, 30_000);

  it('prints the same answers when a finished run is fetched again', () => {
    const id = detach();
    const first = run(['second-opinion', 'result', id, '--wait', '20']);
    const second = run(['second-opinion', 'result', id, '--wait', '0']);
    expect(first.status).toBe(ExitCode.Ok);
    expect(second.stdout).toBe(first.stdout);
  }, 30_000);

  it('reports a killed run as stopped, not running, with the failed-check code', () => {
    const id = detach(hang, ['--timeout', '60']);
    const pid = JSON.parse(readFileSync(runFile(id), 'utf8')).pid as number;
    process.kill(-pid, 'SIGKILL');
    const r = run(['--json', 'second-opinion', 'result', id, '--wait', '0']);
    expect(r.status).toBe(ExitCode.CheckFailed);
    expect(JSON.parse(r.stdout).data.state).toBe('stopped');
  }, 20_000);

  it('treats an id that names no run as a usage error', () => {
    const r = run(['second-opinion', 'result', 'abcdefghijklmnopqrstuvwxyz']);
    expect(r.status).toBe(ExitCode.Usage);
    expect(r.output).toContain('abcdefghijklmnopqrstuvwxyz');
  });
});

describe('one detached run at a time', () => {
  it('refuses a second detached run, naming the first so it can be fetched', () => {
    const first = detach(hang, ['--timeout', '60']);
    const r = run(['second-opinion', 'critique', '--plan-file', 'plan.md', '--detach']);
    expect(r.status).toBe(ExitCode.CheckFailed);
    expect(r.output).toContain(`ctxr second-opinion result ${first}`);
  }, 20_000);

  it('does not let a stopped run hold the machine', () => {
    const first = detach(hang, ['--timeout', '60']);
    process.kill(-JSON.parse(readFileSync(runFile(first), 'utf8')).pid, 'SIGKILL');
    const second = detach();
    expect(second).not.toBe(first);
  }, 20_000);

  it('names a running run only to the member who started it', () => {
    const first = detach(hang, ['--timeout', '60'], { CONTEXTURE_SECOND_OPINION_OWNER: 'a@example.com' });
    const other = run(['second-opinion', 'critique', '--plan-file', 'plan.md', '--detach'], {}, { CONTEXTURE_SECOND_OPINION_OWNER: 'b@example.com' });
    expect(other.status).toBe(ExitCode.CheckFailed);
    expect(other.output).not.toContain(first);
    expect(run(['second-opinion', 'result', first, '--wait', '0'], {}, { CONTEXTURE_SECOND_OPINION_OWNER: 'b@example.com' }).status).toBe(ExitCode.Usage);
  }, 20_000);
});

describe('the run lifetime', () => {
  it('removes a run finished over an hour ago when the next detached run starts', () => {
    const old = detach();
    expect(run(['second-opinion', 'result', old, '--wait', '20']).status).toBe(ExitCode.Ok);
    const resultFile = path.join(runsRoot()!, old, 'result.json');
    const result = JSON.parse(readFileSync(resultFile, 'utf8'));
    writeFileSync(resultFile, JSON.stringify({ ...result, finished_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() }));
    detach();
    expect(existsSync(path.join(runsRoot()!, old))).toBe(false);
    expect(run(['second-opinion', 'result', old, '--wait', '0']).status).toBe(ExitCode.Usage);
  }, 30_000);
});

/**
 * second-opinion-through-openrouter, harness-portability requirement "The
 * OpenRouter key is read from the environment and appears nowhere else": a
 * detached run inherits the key in its environment and keeps a folder of its
 * own, which is where a leak would sit for an hour.
 */
describe('a detached run with a critic answered through OpenRouter', () => {
  it('sends the key to the endpoint and leaves it in no file of the run and no line either command printed', async () => {
    const stub = await startOpenRouterStub(logDir);
    try {
      stub.behave({ kind: 'ok', text: critique('pragmatist') });
      const env = { CTXR_SECOND_OPINION_OPENROUTER_URL: stub.url, OPENROUTER_API_KEY: STUB_KEY, CONTEXTURE_SECOND_OPINION_LINEUP: JSON.stringify({ claude: { via: 'cli' }, gpt: { via: 'cli' }, gemini: { via: 'openrouter', strong: 'vendor/model-x' }, grok: { via: 'off' } }) };
      const started = run(['second-opinion', 'critique', '--plan-file', 'plan.md', '--detach'], {}, env);
      expect(started.status, started.output).toBe(ExitCode.Ok);
      const id = /^run: ([a-z2-7]{26})$/m.exec(started.stdout)![1]!;
      const r = run(['second-opinion', 'result', id, '--wait', '30'], {}, env);
      expect(r.status, r.output).toBe(ExitCode.Ok);
      expect(r.stdout).toContain('MARK-pragmatist');
      expect(r.stdout).toMatch(/pragmatist {2}gemini {2}model=stub\/answered, through OpenRouter/);
      expect(stub.requests()).toHaveLength(1);
      expect(stub.requests()[0]!.headers.authorization).toBe(`Bearer ${STUB_KEY}`);
      expect(started.output + r.output).not.toContain(STUB_KEY);
      const folder = path.join(runsRoot()!, id);
      const files = readdirSync(folder, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => path.join(e.parentPath, e.name));
      expect(files.length).toBeGreaterThan(2); // anti-vacuity: the run record, its input, its result and its logs
      for (const file of files) expect(readFileSync(file, 'utf8'), file).not.toContain(STUB_KEY);
    } finally {
      stub.stop();
    }
  }, 60_000);
});
