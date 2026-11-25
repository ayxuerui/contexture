import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ExitCode } from '../../src/core/exit-codes.js';
import type { CliToolResult } from '../../src/core/mcp/tools/cli.js';
import type { SecondOpinionToolResult } from '../../src/core/mcp/tools/second-opinion.js';
import { makeMcpWriteFixture, type McpWriteFixture } from '../helpers/mcp-write.js';
import { startOpenRouterStub, STUB_KEY, type OpenRouterStub } from '../helpers/openrouter-stub.js';
import { installSecondOpinionStubs } from '../helpers/second-opinion-stubs.js';

/**
 * offer-the-second-opinion-on-its-own tasks 2.3–2.5 (remote-access
 * requirements "A second opinion runs through four tools of its own", "A
 * second-opinion tool takes text and names no file", "The `ctxr` runner
 * refuses a second opinion and names its tool", "A second opinion has its own
 * time bound and runs one at a time" and "The server runs a second opinion
 * only when it is confined"): the server's own CLI against stub model CLIs
 * and a stub `setpriv` first on the server's PATH.
 */
const PLAN = '# Plan: rename the thing\n\n## Steps\nS1. Rename the module and update its callers.\nS2. Delete the old module once nothing imports it.\n';

function critique(role: string): string {
  return `## Role: ${role}\n\n## Verdict: APPROVE_WITH_CHANGES\n\n## Findings\n\n### F1 [major] confidence=0.7\nEvidence: S1\nIssue: ${role} sees a gap.\nChange: reword S1.\n\n## Suggested changes\n- reword\n\n## What you would NOT change\n- S2\n`;
}
const ROLE_OF: Record<string, string> = { claude: 'architect', codex: 'skeptic', agy: 'pragmatist' };

describe('mcp second-opinion tools', () => {
  let f: McpWriteFixture;
  let binDir: string;
  let logDir: string;
  let home: string;
  let runsTmp: string;

  const serverEnv = (extra: Record<string, string> = {}, behaviors: Record<string, Record<string, unknown>> = {}) => {
    const env: Record<string, string | undefined> = {
      ...f.store.env,
      HOME: home,
      PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}`,
      CTXR_SECOND_OPINION_STUB_DIR: logDir,
      CTXR_SECOND_OPINION_STUB_SETPRIV: 'landlock',
      GH_TOKEN: 'ghp-forge-secret',
      TMPDIR: runsTmp,
      ...extra,
    };
    for (const cli of ['claude', 'codex', 'agy']) env[`CTXR_SECOND_OPINION_STUB_${cli.toUpperCase()}`] = JSON.stringify(behaviors[cli] ?? { kind: 'ok', text: critique(ROLE_OF[cli]!) });
    (f.write as { env: Record<string, string | undefined> }).env = env;
  };
  const calls = (cli: string): { args: string[]; stdin: string; env: Record<string, string> }[] => {
    const file = path.join(logDir, `${cli}.json`);
    return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
  };
  const leftovers = () => readdirSync(tmpdir()).filter((d) => d.startsWith('ctxr-mcp-second-opinion-') || d.startsWith('ctxr-second-opinion-out-'));
  const ctxr = (args: Record<string, unknown>) => f.call('ctxr', args) as Promise<unknown> as Promise<CliToolResult>;
  const tool = (name: 'preflight' | 'critique' | 'poll' | 'result', args: Record<string, unknown> = {}, email?: string) =>
    f.call(`second_opinion_${name}`, args, email) as Promise<unknown> as Promise<SecondOpinionToolResult>;
  const HANG = { claude: { kind: 'hang' }, codex: { kind: 'hang' }, agy: { kind: 'hang' } };
  /** Starts a critique that outlasts a one-second wait, and returns its run id. */
  const startLong = async (behaviors: Record<string, Record<string, unknown>> = HANG, email?: string): Promise<string> => {
    f.ctx.secondOpinionMaxWaitSeconds = 1;
    serverEnv({}, behaviors);
    const started = await tool('critique', { plan: PLAN, timeout: 60 }, email);
    expect(started.exit_code, started.stdout + started.stderr).toBe(ExitCode.Ok);
    expect(started.stdout).toMatch(/^running: [a-z2-7]{26} /);
    return runIdIn(started.stdout)!;
  };

  beforeEach(async () => {
    f = await makeMcpWriteFixture();
    binDir = path.join(f.store.tmp.root, 'bin');
    logDir = path.join(f.store.tmp.root, 'stub-log');
    home = path.join(f.store.tmp.root, 'server-home');
    runsTmp = path.join(f.store.tmp.root, 'server-tmp');
    for (const dir of [binDir, logDir, home, runsTmp]) mkdirSync(dir, { recursive: true });
    installSecondOpinionStubs(binDir);
    serverEnv();
  });

  afterEach(async () => {
    // A detached run a test left going is killed with its stub CLIs, so nothing outlives the test.
    for (const run of runRecords()) {
      try {
        process.kill(-run.pid, 'SIGKILL');
      } catch {
        // Already gone.
      }
    }
    await f.store.tmp.cleanup();
  });

  const runsRoot = () => path.join(runsTmp, readdirSync(runsTmp).find((n) => n.startsWith('ctxr-second-opinion-runs-')) ?? 'none');
  const runRecords = (): { run: string; pid: number; owner: string | null }[] =>
    existsSync(runsRoot()) ? readdirSync(runsRoot()).filter((n) => /^[a-z2-7]{26}$/.test(n)).map((n) => JSON.parse(readFileSync(path.join(runsRoot(), n, 'run.json'), 'utf8'))) : [];
  const runIdIn = (stdout: string) => /([a-z2-7]{26})/.exec(stdout)?.[1];

  it('answers a critique written in chat, and leaves nothing on the server', async () => {
    const before = leftovers().length;
    const result = await tool('critique', { plan: PLAN, seed: 3 });
    expect(result.exit_code, result.stdout + result.stderr).toBe(ExitCode.Ok);
    expect(result.command).toBe('second-opinion critique');
    // A member without `read` is told nothing about the store's state.
    expect(result).not.toHaveProperty('ran_against');
    for (const letter of ['A', 'B', 'C']) expect(result.stdout).toContain(`===== critique-${letter} =====`);
    expect(result.stdout).toContain('confined: yes');
    expect(calls('claude')[0]!.stdin).toContain(PLAN);
    // The forge credential never reaches a model CLI.
    for (const cli of ['claude', 'codex', 'agy']) expect(calls(cli)[0]!.env.GH_TOKEN, cli).toBeUndefined();
    expect(leftovers().length).toBe(before);
  });

  it('takes a poll\'s question as text, written to a file the command reads', async () => {
    const answer = (name: string) => ({ kind: 'ok', text: `## Pick: A\n\n${name} prefers A.\n` });
    serverEnv({}, { claude: answer('claude'), codex: answer('codex'), agy: answer('agy') });
    const result = await tool('poll', { prompt: 'Name the tool: A) lantern or B) beacon?', lens: 'minimalist,contrarian' });
    expect(result.exit_code, result.stdout + result.stderr).toBe(ExitCode.Ok);
    expect(result.command).toBe('second-opinion poll');
    expect(calls('claude').some((c) => c.stdin.includes('lantern or B) beacon'))).toBe(true);
    expect(result.stdout).toContain('prefers A');
  });

  it('checks the critics with preflight, confined', async () => {
    const result = await tool('preflight', { tier: 'fast', only: 'claude,gpt' });
    expect(result.command).toBe('second-opinion preflight');
    expect(result.stdout + result.stderr).toMatch(/confined/);
    expect(calls('agy')).toEqual([]);
  });

  it('returns a slow model as a partial result within the bound', async () => {
    serverEnv({}, { agy: { kind: 'hang' }, codex: { kind: 'hang' } });
    const result = await tool('critique', { plan: PLAN, timeout: 1 });
    expect(result.timed_out).toBe(false);
    expect(result.exit_code).toBe(ExitCode.CheckFailed);
    expect(result.stdout).toMatch(/failed\s+gemini\s+timed out after 1s/);
    expect(result.stdout).toContain('===== critique-A =====');
  });

  it('runs one second opinion at a time, and names the running one to the member who started it', async () => {
    const run = await startLong();
    const again = await tool('poll', { prompt: 'A or B?' });
    expect(again.exit_code).toBe(ExitCode.CheckFailed);
    expect(again.stdout + again.stderr).toContain(`ctxr second-opinion result ${run}`);
    const other = await tool('critique', { plan: PLAN }, 'b@example.com');
    expect(other.exit_code).toBe(ExitCode.CheckFailed);
    expect(other.stdout + other.stderr).not.toContain(run);
    expect(calls('claude')).toHaveLength(1);
  });

  it('refuses a larger timeout and any field that names a file, a session or an output directory, before anything runs', async () => {
    await expect(tool('critique', { plan: PLAN, timeout: 1200 })).rejects.toThrow(/at most 600 seconds/);
    for (const extra of [{ plan_file: 'projects/a.md' }, { out: 'x' }, { session: 's' }, { run_folder: 'x' }, { model: 'm' }, { detach: true }]) {
      await expect(tool('critique', { plan: PLAN, ...extra }), JSON.stringify(extra)).rejects.toMatchObject({ code: 'mcp.invalid_arguments' });
    }
    await expect(tool('critique', {})).rejects.toMatchObject({ code: 'mcp.invalid_arguments' });
    await expect(tool('poll', { prompt: 'A or B?', prompt_file: 'x' })).rejects.toMatchObject({ code: 'mcp.invalid_arguments' });
    await expect(tool('result', { run: '../../etc' })).rejects.toMatchObject({ code: 'mcp.invalid_arguments' });
    // An option's value is never read as another option.
    const smuggled = await tool('critique', { plan: PLAN, tier: '--out=/tmp/x' });
    expect(smuggled.exit_code).toBe(ExitCode.Usage);
    expect(calls('claude')).toEqual([]);
  });

  /** remote-access spec, *The `ctxr` runner refuses a second opinion and names its tool*. */
  it('is refused by the ctxr runner, which names the tool and takes no input', async () => {
    await expect(ctxr({ args: ['second-opinion', 'critique', '--plan-file', '@input'] })).rejects.toMatchObject({ code: 'mcp.command_not_allowed', message: expect.stringContaining('second_opinion_critique') });
    await expect(ctxr({ args: ['second-opinion', 'result', 'x'] })).rejects.toThrow(/second_opinion_result/);
    await expect(ctxr({ args: ['second-opinion', 'serve'] })).rejects.toThrow(/second_opinion_preflight, second_opinion_critique/);
    await expect(ctxr({ args: ['second-opinion', 'critique', '--plan-file', '@input'], input: PLAN })).rejects.toMatchObject({ code: 'mcp.invalid_arguments' });
    await expect(ctxr({ args: ['lint'], input: 'text' })).rejects.toMatchObject({ code: 'mcp.invalid_arguments' });
    expect(calls('claude')).toEqual([]);
    expect(runRecords()).toEqual([]);
  });

  it('starts a run and fetches it with result, across calls', async () => {
    const delayed = Object.fromEntries(['claude', 'codex', 'agy'].map((cli) => [cli, { kind: 'ok', text: critique(ROLE_OF[cli]!), delayMs: 3000 }]));
    const run = await startLong(delayed);
    expect(runRecords().map((r) => r.owner)).toEqual(['a@example.com']);
    f.ctx.secondOpinionMaxWaitSeconds = 20;
    const fetched = await tool('result', { run, wait: 20 });
    expect(fetched.exit_code, fetched.stdout + fetched.stderr).toBe(ExitCode.Ok);
    expect(fetched.command).toBe('second-opinion result');
    for (const letter of ['A', 'B', 'C']) expect(fetched.stdout).toContain(`===== critique-${letter} =====`);
    // The member's identity never reaches a model CLI.
    for (const cli of ['claude', 'codex', 'agy']) expect(calls(cli)[0]!.env.CONTEXTURE_SECOND_OPINION_OWNER, cli).toBeUndefined();
  });

  it('hands back the run id when a critique outlasts the wait, and a later result carries the critiques', async () => {
    f.ctx.secondOpinionMaxWaitSeconds = 1;
    serverEnv({}, Object.fromEntries(['claude', 'codex', 'agy'].map((cli) => [cli, { kind: 'ok', text: critique(ROLE_OF[cli]!), delayMs: 4000 }])));
    const first = await tool('critique', { plan: PLAN });
    expect(first.exit_code, first.stdout + first.stderr).toBe(ExitCode.Ok);
    expect(first.duration_ms).toBeLessThan(4000);
    expect(first.stdout).toMatch(/^running: [a-z2-7]{26} /);
    const run = runIdIn(first.stdout)!;
    f.ctx.secondOpinionMaxWaitSeconds = 20;
    const later = await tool('result', { run });
    expect(later.exit_code).toBe(ExitCode.Ok);
    expect(later.stdout).toContain('===== critique-A =====');
  });

  it('cuts a longer wait to the bound', async () => {
    const run = await startLong();
    const fetched = await tool('result', { run, wait: 600 });
    expect(fetched.duration_ms).toBeLessThan(5000);
    expect(fetched.stdout).toMatch(new RegExp(`^running: ${run}`));
  });

  it('lets no other member fetch a run', async () => {
    const run = await startLong();
    const other = await tool('result', { run, wait: 1 }, 'b@example.com');
    expect(other.exit_code).toBe(ExitCode.Usage);
    expect(other.stdout).not.toContain('critique-A');
    expect(other.stdout).not.toContain('Rename the module');
  });

  it('does not run where the model CLIs cannot be confined', async () => {
    serverEnv({ CTXR_SECOND_OPINION_STUB_SETPRIV: 'none' });
    const result = await tool('critique', { plan: PLAN });
    expect(result.exit_code).toBe(ExitCode.CheckFailed);
    expect(result.stdout + result.stderr).toMatch(/cannot confine the model CLIs here/);
    for (const cli of ['claude', 'codex', 'agy']) expect(calls(cli), cli).toEqual([]);
  });
  /**
   * second-opinion-lineup-in-store-config task 4.2 (remote-access requirement
   * "A second opinion through the server uses the served store's lineup").
   */
  describe('the lineup is the served commit\'s', () => {
    const modelAsked = (cli: string): string | undefined => {
      const args = calls(cli).filter((c) => c.args.includes('--model')).at(-1)?.args;
      return args?.[args.indexOf('--model') + 1];
    };
    const serveLineup = async (lineup: string) => {
      const config = readFileSync(path.join(f.store.root, 'contexture.yaml'), 'utf8');
      await f.store.advanceMain({ 'contexture.yaml': `${config}${lineup}\n` });
      f.tick(61);
    };
    const critiqueCall = () => tool('critique', { plan: PLAN });

    it('reaches a chat member', async () => {
      await serveLineup('second_opinion: { gemini: { via: cli, strong: m-served } }');
      const result = await critiqueCall();
      expect(result.exit_code, result.stdout + result.stderr).toBe(ExitCode.Ok);
      expect(modelAsked('agy')).toBe('m-served');
      expect(modelAsked('claude')).toBe('fable');
    });

    it('is not a session\'s unreviewed working copy', async () => {
      await serveLineup('second_opinion: { gemini: { via: cli, strong: m-served } }');
      const { session } = await f.start('lineup');
      appendFileSync(path.join(f.store.root, '.worktrees', session, 'contexture.yaml'), 'second_opinion: { gpt: { via: cli, strong: m-session } }\n');
      // No second-opinion tool reads a session at all, so there is no way to name this one.
      await expect(tool('critique', { plan: PLAN, session })).rejects.toMatchObject({ code: 'mcp.invalid_arguments' });
      const result = await critiqueCall();
      expect(result.exit_code, result.stdout + result.stderr).toBe(ExitCode.Ok);
      expect(modelAsked('agy')).toBe('m-served');
      expect(modelAsked('codex')).not.toBe('m-session');
    });

    it('gives way to the server\'s own environment', async () => {
      await serveLineup('second_opinion: { gemini: { via: cli, strong: m-served } }');
      serverEnv({ CTXR_SECOND_OPINION_GEMINI_MODEL: 'm-operator' });
      const result = await critiqueCall();
      expect(result.exit_code, result.stdout + result.stderr).toBe(ExitCode.Ok);
      expect(modelAsked('agy')).toBe('m-operator');
    });
  });

  /**
   * second-opinion-through-openrouter tasks 4.1–4.2 (remote-access requirements
   * "The server gives the OpenRouter key to a second opinion only" and "A
   * member cannot choose a second opinion's route").
   */
  describe('a critic answered through OpenRouter', () => {
    let stub: OpenRouterStub;
    const serveLineup = async (lineup: string) => {
      const config = readFileSync(path.join(f.store.root, 'contexture.yaml'), 'utf8');
      await f.store.advanceMain({ 'contexture.yaml': `${config}${lineup}\n` });
      f.tick(61);
    };
    const operator = () => ({ OPENROUTER_API_KEY: STUB_KEY, CTXR_SECOND_OPINION_OPENROUTER_URL: stub.url });

    beforeEach(async () => {
      stub = await startOpenRouterStub(logDir);
      stub.behave({ kind: 'ok', text: critique('pragmatist') });
    });
    afterEach(() => stub.stop());

    it('reaches OpenRouter with the server\'s key, which no tool result carries', async () => {
      await serveLineup('second_opinion: { claude: { via: cli }, gpt: { via: cli }, gemini: { via: openrouter, strong: vendor/model-x }, grok: { via: off } }');
      serverEnv(operator());
      const result = await tool('critique', { plan: PLAN });
      expect(result.exit_code, result.stdout + result.stderr).toBe(ExitCode.Ok);
      expect(stub.requests()).toHaveLength(1);
      expect(stub.requests()[0]!.headers.authorization).toBe(`Bearer ${STUB_KEY}`);
      expect(stub.requests()[0]!.body!.model).toBe('vendor/model-x');
      expect(calls('agy')).toEqual([]);
      expect(JSON.stringify(result)).not.toContain(STUB_KEY);
      for (const cli of ['claude', 'codex']) expect(calls(cli)[0]!.env.OPENROUTER_API_KEY, cli).toBeUndefined();
    });

    it('withholds the key from every other command the server runs', async () => {
      // A stand-in for the server's own CLI that records the environment it was started with.
      const recorder = path.join(f.store.tmp.root, 'record-env.cjs');
      const seen = path.join(logDir, 'server-cli.json');
      writeFileSync(
        recorder,
        `const fs = require('node:fs');\nconst prior = fs.existsSync(${JSON.stringify(seen)}) ? JSON.parse(fs.readFileSync(${JSON.stringify(seen)}, 'utf8')) : [];\nprior.push({ argv: process.argv.slice(2), keys: Object.keys(process.env) });\nfs.writeFileSync(${JSON.stringify(seen)}, JSON.stringify(prior));\n`,
      );
      const { session, root } = await f.start('keys');
      serverEnv(operator());
      f.ctx.cliEntry = recorder;
      await ctxr({ args: ['lint'] });
      await f.call('ctxr_write', { args: ['entry', 'append', `${root}projects/a.md`, '--region', 'log', '--text', 'x'], session });
      await tool('preflight');
      const runs = JSON.parse(readFileSync(seen, 'utf8')) as { argv: string[]; keys: string[] }[];
      const holdsKey = Object.fromEntries(runs.map((r) => [r.argv.slice(0, 2).join(' '), r.keys.includes('OPENROUTER_API_KEY')]));
      expect(holdsKey).toEqual({ 'lint --no-input': false, 'entry append': false, 'second-opinion preflight': true });
    });

    it('is not chosen by a session\'s unreviewed working copy', async () => {
      // The served store keeps every critic on its tool, although the server holds a key.
      await serveLineup('second_opinion: { claude: { via: cli }, gpt: { via: cli }, gemini: { via: cli }, grok: { via: off } }');
      const { session } = await f.start('route');
      const copy = path.join(f.store.root, '.worktrees', session, 'contexture.yaml');
      writeFileSync(copy, readFileSync(copy, 'utf8').replace('gemini: { via: cli }', 'gemini: { via: openrouter, strong: vendor/model-session }'));
      serverEnv(operator());
      const result = await tool('critique', { plan: PLAN });
      expect(result.exit_code, result.stdout + result.stderr).toBe(ExitCode.Ok);
      expect(stub.requests()).toEqual([]);
      expect(calls('agy').length).toBeGreaterThan(0);
    });
  });
});
