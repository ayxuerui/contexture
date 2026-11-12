import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ExitCode } from '../../src/core/exit-codes.js';
import type { CliToolResult } from '../../src/core/mcp/tools/cli.js';
import { makeMcpWriteFixture, type McpWriteFixture } from '../helpers/mcp-write.js';
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

  const serverEnv = (extra: Record<string, string> = {}, behaviors: Record<string, Record<string, unknown>> = {}) => {
    const env: Record<string, string | undefined> = {
      ...f.store.env,
      HOME: home,
      PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}`,
      CTXR_SECOND_OPINION_STUB_DIR: logDir,
      CTXR_SECOND_OPINION_STUB_SETPRIV: 'landlock',
      GH_TOKEN: 'ghp-forge-secret',
      ...extra,
    };
    for (const cli of ['claude', 'codex', 'agy']) env[`CTXR_SECOND_OPINION_STUB_${cli.toUpperCase()}`] = JSON.stringify(behaviors[cli] ?? { kind: 'ok', text: critique(ROLE_OF[cli]!) });
    (f.write as { env: Record<string, string | undefined> }).env = env;
  };
  const calls = (cli: string): { stdin: string; env: Record<string, string> }[] => {
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
    for (const dir of [binDir, logDir, home]) mkdirSync(dir, { recursive: true });
    installSecondOpinionStubs(binDir);
    serverEnv();
  });

  afterEach(async () => {
    await f.store.tmp.cleanup();
  });

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

  it('runs one second opinion at a time', async () => {
    serverEnv({}, { agy: { kind: 'hang' } });
    const first = ctxr({ args: ['second-opinion', 'critique', '--plan-file', '@input', '--timeout', '3'], input: PLAN });
    await new Promise((r) => setTimeout(r, 300));
    await expect(ctxr({ args: ['second-opinion', 'poll', '--prompt-file', '@input'], input: 'A or B?' })).rejects.toMatchObject({ code: 'mcp.busy' });
    await first;
    expect(calls('claude')).toHaveLength(1);
  });

  it('refuses a larger timeout, --out, and input for any other command, before anything runs', async () => {
    await expect(ctxr({ args: ['second-opinion', 'critique', '--timeout', '600', '--plan-file', '@input'], input: PLAN })).rejects.toThrow(/at most 200 seconds/);
    await expect(ctxr({ args: ['second-opinion', 'critique', '--out', 'x', '--plan-file', '@input'], input: PLAN })).rejects.toMatchObject({ code: 'mcp.invalid_arguments' });
    await expect(ctxr({ args: ['lint'], input: 'text' })).rejects.toMatchObject({ code: 'mcp.invalid_arguments' });
    await expect(ctxr({ args: ['second-opinion', 'critique', '--plan-file', '@input'] })).rejects.toMatchObject({ code: 'mcp.invalid_arguments' });
    expect(calls('claude')).toEqual([]);
  });

  it('does not run where the model CLIs cannot be confined', async () => {
    serverEnv({ CTXR_SECOND_OPINION_STUB_SETPRIV: 'none' });
    const result = await ctxr({ args: ['second-opinion', 'critique', '--plan-file', '@input'], input: PLAN });
    expect(result.exit_code).toBe(ExitCode.CheckFailed);
    expect(result.stdout + result.stderr).toMatch(/cannot confine the model CLIs here/);
    for (const cli of ['claude', 'codex', 'agy']) expect(calls(cli), cli).toEqual([]);
  });
});
