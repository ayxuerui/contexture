import type { PassThrough } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ExitCode } from '../../src/core/exit-codes.js';
import { run } from '../../src/run.js';
import { CLI_VERSION } from '../../src/version.js';
import { fakeRegistry, makeFakeEnv, readAll } from '../helpers/fake-env.js';
import { runCli } from '../helpers/run-cli.js';
import { makeTmpDir, type TmpDir } from '../helpers/tmp-store.js';

/** cli-contract: the CLI reports its own version and how it was installed. */
describe('cli-contract: the CLI reports its own version', () => {
  let tmp: TmpDir;

  beforeAll(async () => {
    // A bare temp dir with no contexture.yaml anywhere above it inside the
    // sandbox: the version must be answerable where no store resolves.
    tmp = await makeTmpDir('contexture-version-');
  });

  afterAll(async () => {
    await tmp.cleanup();
  });

  it('prints the version on stdout, leaving stderr empty', async () => {
    const result = await runCli(['version'], { cwd: tmp.root });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe(CLI_VERSION);
    expect(result.stderr).toBe('');
  });

  it('answers --json on stdout as exactly one JSON value', async () => {
    const result = await runCli(['version', '--json'], { cwd: tmp.root });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    const envelope = JSON.parse(result.stdout) as {
      command: string;
      data: { version: string; install_path: string; install_kind: string };
    };
    expect(envelope.command).toBe('version');
    expect(envelope.data.version).toBe(CLI_VERSION);
    expect(envelope.data.install_path).toMatch(/bin\.js$/);
    expect(['global', 'linked', 'undetermined']).toContain(envelope.data.install_kind);
  });

  it('the flag and the command agree, and neither is a usage error', async () => {
    const viaFlag = await runCli(['--version'], { cwd: tmp.root });
    const viaShortFlag = await runCli(['-V'], { cwd: tmp.root });
    const viaCommand = await runCli(['version'], { cwd: tmp.root });
    expect(viaFlag.exitCode).toBe(0);
    expect(viaShortFlag.exitCode).toBe(0);
    expect(viaFlag.stdout.trim()).toBe(viaCommand.stdout.trim());
    expect(viaShortFlag.stdout.trim()).toBe(viaCommand.stdout.trim());
    // The regression this guards: commander's built-in .version() would have
    // written the answer to stderr, because this program routes writeOut there.
    expect(viaFlag.stderr).toBe('');
  });

  it('reports the version outside any store rather than failing for want of one', async () => {
    const result = await runCli(['version'], { cwd: tmp.root });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).not.toMatch(/store/i);
  });
});

/**
 * cli-contract: an explicit release check reports its answer through the exit
 * code. Driven through run(argv, env) — the CLI's one testable seam — so the
 * three outcomes are proven end to end from argv without any test reaching the
 * real registry.
 */
describe('cli-contract: the explicit release check', () => {
  function envWith(lookup: Parameters<typeof fakeRegistry>[0]) {
    return makeFakeEnv({ registry: fakeRegistry(lookup).registry });
  }

  it('exits with the success code when the installed version is current', async () => {
    const env = envWith({ kind: 'resolved', version: CLI_VERSION });
    expect(await run(['version', '--check'], env)).toBe(ExitCode.Ok);
  });

  it('exits with the failed-check code when a newer release is published', async () => {
    const env = envWith({ kind: 'resolved', version: '99.0.0' });
    expect(await run(['version', '--check'], env)).toBe(ExitCode.CheckFailed);
    expect(readAll(env.io.stdout as unknown as PassThrough)).toContain('99.0.0');
  });

  it('exits with the usage code, naming the cause, when the answer is undeterminable', async () => {
    const env = envWith({ kind: 'undetermined', reason: 'the registry answered 503' });
    expect(await run(['version', '--check'], env)).toBe(ExitCode.Usage);
    expect(readAll(env.io.stdout as unknown as PassThrough)).toContain('503');
  });

  it('treats an unrecognized published version as undeterminable, never as a comparison', async () => {
    const env = envWith({ kind: 'resolved', version: 'latest' });
    expect(await run(['version', '--check', '--json'], env)).toBe(ExitCode.Usage);
    const envelope = JSON.parse(readAll(env.io.stdout as unknown as PassThrough)) as {
      data: { release_status: string };
      findings: { code: string }[];
    };
    expect(envelope.data.release_status).toBe('undetermined');
    expect(envelope.findings.map((f) => f.code)).toContain('cli.update_check_failed');
  });
});
