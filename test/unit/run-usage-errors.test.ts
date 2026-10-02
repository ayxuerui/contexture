import type { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { ExitCode } from '../../src/core/exit-codes.js';
import { run } from '../../src/run.js';
import { makeFakeEnv, readAll } from '../helpers/fake-env.js';

/**
 * cli-contract (parser-errors-answer-in-the-envelope): a command line rejected
 * during parsing still answers in JSON, and explains itself once.
 */
function streams(env: ReturnType<typeof makeFakeEnv>): { stdout: string; stderr: string } {
  return {
    stdout: readAll(env.io.stdout as unknown as PassThrough),
    stderr: readAll(env.io.stderr as unknown as PassThrough),
  };
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('a rejected command line answers in the envelope', () => {
  it('emits one envelope naming the subcommand that was reached', async () => {
    const env = makeFakeEnv();
    const exitCode = await run(['session', 'start', '--slug', 'x', '--json'], env);
    expect(exitCode).toBe(ExitCode.Usage);

    const { stdout } = streams(env);
    expect(stdout.trim().split('\n')).toHaveLength(1);
    const envelope = JSON.parse(stdout) as Record<string, unknown>;
    expect(envelope.envelope_version).toBe(1);
    expect(envelope.command).toBe('session.start');
    expect(envelope.status).toBe('error');
    expect(envelope.exit_code).toBe(2);
    expect(envelope.data).toBeNull();

    expect(envelope.findings).toHaveLength(1);
    const finding = JSON.parse(stdout).findings[0];
    expect(finding.code).toBe('cli.usage');
    expect(finding.message).toBe("unknown option '--slug'");
    expect(finding.details.commander_code).toBe('unknownOption');
  });

  it('never reports an argument of its own as the command', async () => {
    const env = makeFakeEnv();
    await run(['publish', 'new', 'my-page', '--bogus', '--json'], env);
    expect(JSON.parse(streams(env).stdout).command).toBe('publish.new');
  });

  it('reports no command for a word that is not one, or for a leading flag', async () => {
    const unknown = makeFakeEnv();
    expect(await run(['sessoin', 'start', '--json'], unknown)).toBe(ExitCode.Usage);
    const unknownEnvelope = JSON.parse(streams(unknown).stdout);
    expect(unknownEnvelope.command).toBe('');
    expect(unknownEnvelope.findings[0].details.commander_code).toBe('unknownCommand');

    const flagFirst = makeFakeEnv();
    expect(await run(['--nope', '--json'], flagFirst)).toBe(ExitCode.Usage);
    expect(JSON.parse(streams(flagFirst).stdout).command).toBe('');
  });

  it('reports excess arguments the same way', async () => {
    const env = makeFakeEnv();
    expect(await run(['session', 'start', 'a', 'b', '--json'], env)).toBe(ExitCode.Usage);
    expect(JSON.parse(streams(env).stdout).findings[0].details.commander_code).toBe('excessArguments');
  });
});

describe('a usage error is reported once', () => {
  it('writes the human explanation exactly once, and nothing on stdout, without --json', async () => {
    const env = makeFakeEnv();
    expect(await run(['session', 'start', '--slug', 'x'], env)).toBe(ExitCode.Usage);
    const { stdout, stderr } = streams(env);
    expect(stdout).toBe('');
    expect(occurrences(stderr, "unknown option '--slug'")).toBe(1);
  });

  it('writes the human explanation exactly once alongside the envelope, with --json', async () => {
    const env = makeFakeEnv();
    await run(['session', 'start', '--slug', 'x', '--json'], env);
    const { stdout, stderr } = streams(env);
    expect(occurrences(stderr, "unknown option '--slug'")).toBe(1);
    expect(occurrences(stdout, "unknown option '--slug'")).toBe(1);
    expect(stdout.trim().startsWith('{')).toBe(true);
  });
});

describe('help and version are not usage errors', () => {
  it('leave stdout empty and exit zero', async () => {
    const help = makeFakeEnv();
    expect(await run(['--help'], help)).toBe(ExitCode.Ok);
    expect(streams(help).stdout).toBe('');

    const subHelp = makeFakeEnv();
    expect(await run(['session', 'start', '--help'], subHelp)).toBe(ExitCode.Ok);
    expect(streams(subHelp).stdout).toBe('');
  });

  it('leave the version query answering on stdout, as it already did', async () => {
    const version = makeFakeEnv();
    expect(await run(['--version', '--json'], version)).toBe(ExitCode.Ok);
    const envelope = JSON.parse(streams(version).stdout) as Record<string, unknown>;
    expect(envelope.command).toBe('version');
    expect(envelope.status).toBe('ok');
  });
});
