import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ExitCode } from '../../src/core/exit-codes.js';
import type { CliToolResult } from '../../src/core/mcp/tools/cli.js';
import { makeMcpWriteFixture, type McpWriteFixture } from '../helpers/mcp-write.js';
import { startOpenRouterStub, STUB_KEY, type OpenRouterStub } from '../helpers/openrouter-stub.js';
import { installSecondOpinionStubs } from '../helpers/second-opinion-stubs.js';

/**
 * serve-the-second-opinion-to-chat-apps tasks 2.6 (remote-access requirements
 * "A second opinion runs through the `ctxr` tool as it runs in a shell", "The
 * `ctxr` tool takes `input` for a second opinion only", "A second opinion has
 * its own time bound and runs one at a time" and "The server runs a second
 * opinion only when it is confined"): the server's own CLI against stub model
 * CLIs and a stub `setpriv` first on the server's PATH.
 */
const PLAN = '# Plan: rename the thing\n\n## Steps\nS1. Rename the module and update its callers.\nS2. Delete the old module once nothing imports it.\n';

function critique(role: string): string {
  return `## Role: ${role}\n\n## Verdict: APPROVE_WITH_CHANGES\n\n## Findings\n\n### F1 [major] confidence=0.7\nEvidence: S1\nIssue: ${role} sees a gap.\nChange: reword S1.\n\n## Suggested changes\n- reword\n\n## What you would NOT change\n- S2\n`;
}
const ROLE_OF: Record<string, string> = { claude: 'architect', codex: 'skeptic', agy: 'pragmatist' };

describe('mcp ctxr second-opinion', () => {
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
    const result = await ctxr({ args: ['second-opinion', 'critique', '--plan-file', '@input', '--seed', '3'], input: PLAN });
    expect(result.exit_code, result.stdout + result.stderr).toBe(ExitCode.Ok);
    expect(result.command).toBe('second-opinion critique');
    expect(result.ran_against).toEqual({ commit: expect.stringMatching(/^[0-9a-f]{40}$/) });
    for (const letter of ['A', 'B', 'C']) expect(result.stdout).toContain(`===== critique-${letter} =====`);
    expect(result.stdout).toContain('confined: yes');
    expect(calls('claude')[0]!.stdin).toContain(PLAN);
    // The forge credential never reaches a model CLI.
    for (const cli of ['claude', 'codex', 'agy']) expect(calls(cli)[0]!.env.GH_TOKEN, cli).toBeUndefined();
    expect(leftovers().length).toBe(before);
  });

  it('returns a slow model as a partial result within the bound', async () => {
    serverEnv({}, { agy: { kind: 'hang' }, codex: { kind: 'hang' } });
    const result = await ctxr({ args: ['second-opinion', 'critique', '--plan-file', '@input', '--timeout', '1'], input: PLAN });
    expect(result.timed_out).toBe(false);
    expect(result.exit_code).toBe(ExitCode.CheckFailed);
    expect(result.stdout).toMatch(/failed\s+agy\s+timed out after 1s/);
    expect(result.stdout).toContain('===== critique-A =====');
  });

  it('runs one second opinion at a time, and names the running one to the member who started it', async () => {
    serverEnv({}, { claude: { kind: 'hang' }, codex: { kind: 'hang' }, agy: { kind: 'hang' } });
    const first = await ctxr({ args: ['second-opinion', 'critique', '--plan-file', '@input', '--detach', '--timeout', '60'], input: PLAN });
    expect(first.exit_code, first.stdout + first.stderr).toBe(ExitCode.Ok);
    const run = runIdIn(first.stdout)!;
    const again = await ctxr({ args: ['second-opinion', 'poll', '--prompt-file', '@input'], input: 'A or B?' });
    expect(again.exit_code).toBe(ExitCode.CheckFailed);
    expect(again.stdout + again.stderr).toContain(`ctxr second-opinion result ${run}`);
    const other = (await f.call('ctxr', { args: ['second-opinion', 'critique', '--plan-file', '@input', '--detach'], input: PLAN }, 'b@example.com')) as unknown as CliToolResult;
    expect(other.exit_code).toBe(ExitCode.CheckFailed);
    expect(other.stdout + other.stderr).not.toContain(run);
    expect(calls('claude')).toHaveLength(1);
  });

  it('refuses a larger timeout, --out, and input for any other command, before anything runs', async () => {
    await expect(ctxr({ args: ['second-opinion', 'critique', '--timeout', '1200', '--plan-file', '@input', '--detach'], input: PLAN })).rejects.toThrow(/at most 600 seconds/);
    await expect(ctxr({ args: ['second-opinion', 'critique', '--run-folder', 'x', '--plan-file', '@input'], input: PLAN })).rejects.toMatchObject({ code: 'mcp.invalid_arguments' });
    await expect(ctxr({ args: ['second-opinion', 'critique', '--out', 'x', '--plan-file', '@input'], input: PLAN })).rejects.toMatchObject({ code: 'mcp.invalid_arguments' });
    await expect(ctxr({ args: ['lint'], input: 'text' })).rejects.toMatchObject({ code: 'mcp.invalid_arguments' });
    await expect(ctxr({ args: ['second-opinion', 'critique', '--plan-file', '@input'] })).rejects.toMatchObject({ code: 'mcp.invalid_arguments' });
    expect(calls('claude')).toEqual([]);
  });

  it('starts a detached run and fetches it with result, across calls', async () => {
    const started = await ctxr({ args: ['second-opinion', 'critique', '--plan-file', '@input', '--detach'], input: PLAN });
    expect(started.exit_code, started.stdout + started.stderr).toBe(ExitCode.Ok);
    expect(started.command).toBe('second-opinion critique');
    const run = runIdIn(started.stdout)!;
    expect(runRecords().map((r) => r.owner)).toEqual(['a@example.com']);
    const fetched = await ctxr({ args: ['second-opinion', 'result', run, '--wait', '20'] });
    expect(fetched.exit_code, fetched.stdout + fetched.stderr).toBe(ExitCode.Ok);
    for (const letter of ['A', 'B', 'C']) expect(fetched.stdout).toContain(`===== critique-${letter} =====`);
    // The member's identity never reaches a model CLI.
    for (const cli of ['claude', 'codex', 'agy']) expect(calls(cli)[0]!.env.CONTEXTURE_SECOND_OPINION_OWNER, cli).toBeUndefined();
  });

  it('hands back the run id when a blocking critique outlasts the wait, and a later result carries the critiques', async () => {
    f.ctx.secondOpinionMaxWaitSeconds = 1;
    serverEnv({}, Object.fromEntries(['claude', 'codex', 'agy'].map((cli) => [cli, { kind: 'ok', text: critique(ROLE_OF[cli]!), delayMs: 4000 }])));
    const first = await ctxr({ args: ['second-opinion', 'critique', '--plan-file', '@input'], input: PLAN });
    expect(first.exit_code, first.stdout + first.stderr).toBe(ExitCode.Ok);
    expect(first.duration_ms).toBeLessThan(4000);
    expect(first.stdout).toMatch(/^running: [a-z2-7]{26} /);
    const run = runIdIn(first.stdout)!;
    f.ctx.secondOpinionMaxWaitSeconds = 20;
    const later = await ctxr({ args: ['second-opinion', 'result', run] });
    expect(later.exit_code).toBe(ExitCode.Ok);
    expect(later.stdout).toContain('===== critique-A =====');
  });

  it('cuts a longer wait to the bound', async () => {
    f.ctx.secondOpinionMaxWaitSeconds = 1;
    serverEnv({}, { claude: { kind: 'hang' }, codex: { kind: 'hang' }, agy: { kind: 'hang' } });
    const started = await ctxr({ args: ['second-opinion', 'critique', '--plan-file', '@input', '--detach', '--timeout', '60'], input: PLAN });
    const run = runIdIn(started.stdout)!;
    const fetched = await ctxr({ args: ['second-opinion', 'result', run, '--wait', '600'] });
    expect(fetched.duration_ms).toBeLessThan(5000);
    expect(fetched.stdout).toMatch(new RegExp(`^running: ${run}`));
  });

  it('lets no other member fetch a run', async () => {
    const started = await ctxr({ args: ['second-opinion', 'critique', '--plan-file', '@input', '--detach'], input: PLAN });
    const run = runIdIn(started.stdout)!;
    const other = (await f.call('ctxr', { args: ['second-opinion', 'result', run, '--wait', '20'] }, 'b@example.com')) as unknown as CliToolResult;
    expect(other.exit_code).toBe(ExitCode.Usage);
    expect(other.stdout).not.toContain('critique-A');
    expect(other.stdout).not.toContain('Rename the module');
  });

  it('does not run where the model CLIs cannot be confined', async () => {
    serverEnv({ CTXR_SECOND_OPINION_STUB_SETPRIV: 'none' });
    const result = await ctxr({ args: ['second-opinion', 'critique', '--plan-file', '@input'], input: PLAN });
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
    const critiqueCall = (extra: Record<string, unknown> = {}) => ctxr({ args: ['second-opinion', 'critique', '--plan-file', '@input'], input: PLAN, ...extra });

    it('reaches a chat member', async () => {
      await serveLineup('second_opinion: { strong: { agy: { model: m-served } } }');
      const result = await critiqueCall();
      expect(result.exit_code, result.stdout + result.stderr).toBe(ExitCode.Ok);
      expect(modelAsked('agy')).toBe('m-served');
      expect(modelAsked('claude')).toBe('fable');
    });

    it('is not a session\'s unreviewed working copy', async () => {
      await serveLineup('second_opinion: { strong: { agy: { model: m-served } } }');
      const { session } = await f.start('lineup');
      appendFileSync(path.join(f.store.root, '.worktrees', session, 'contexture.yaml'), 'second_opinion: { strong: { codex: { model: m-session } } }\n');
      const result = await critiqueCall({ session });
      expect(result.exit_code, result.stdout + result.stderr).toBe(ExitCode.Ok);
      expect(result.ran_against).toMatchObject({ session });
      expect(modelAsked('agy')).toBe('m-served');
      expect(modelAsked('codex')).not.toBe('m-session');
    });

    it('gives way to the server\'s own environment', async () => {
      await serveLineup('second_opinion: { strong: { agy: { model: m-served } } }');
      serverEnv({ CTXR_SECOND_OPINION_AGY_MODEL: 'm-operator' });
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
      await serveLineup('second_opinion: { strong: { agy: { openrouter: vendor/model-x } } }');
      serverEnv(operator());
      const result = await ctxr({ args: ['second-opinion', 'critique', '--plan-file', '@input', '--json'], input: PLAN });
      expect(result.exit_code, result.stdout + result.stderr).toBe(ExitCode.Ok);
      expect(stub.requests()).toHaveLength(1);
      expect(stub.requests()[0]!.headers.authorization).toBe(`Bearer ${STUB_KEY}`);
      expect(stub.requests()[0]!.body!.model).toBe('vendor/model-x');
      expect(calls('agy')).toEqual([]);
      expect(JSON.stringify(result)).not.toContain(STUB_KEY);
      expect(result.stdout).toContain('"route":"openrouter"');
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
      await ctxr({ args: ['second-opinion', 'preflight'] });
      const runs = JSON.parse(readFileSync(seen, 'utf8')) as { argv: string[]; keys: string[] }[];
      const holdsKey = Object.fromEntries(runs.map((r) => [r.argv.slice(0, 2).join(' '), r.keys.includes('OPENROUTER_API_KEY')]));
      expect(holdsKey).toEqual({ 'lint --no-input': false, 'entry append': false, 'second-opinion preflight': true });
    });

    it('is not chosen by a session\'s unreviewed working copy', async () => {
      const { session } = await f.start('route');
      appendFileSync(path.join(f.store.root, '.worktrees', session, 'contexture.yaml'), 'second_opinion: { strong: { agy: { openrouter: vendor/model-session } } }\n');
      serverEnv(operator());
      const result = await ctxr({ args: ['second-opinion', 'critique', '--plan-file', '@input'], input: PLAN, session });
      expect(result.exit_code, result.stdout + result.stderr).toBe(ExitCode.Ok);
      expect(result.ran_against).toMatchObject({ session });
      expect(stub.requests()).toEqual([]);
      expect(calls('agy').length).toBeGreaterThan(0);
    });
  });
});
