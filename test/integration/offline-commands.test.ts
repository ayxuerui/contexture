import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import type { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createExecFileGitRunner } from '../../src/core/git/exec.js';
import { ExitCode } from '../../src/core/exit-codes.js';
import { UPDATE_CHECK_ENV_VAR } from '../../src/core/version-check.js';
import { run } from '../../src/run.js';
import { fakeRegistry, forbiddenRegistry, makeFakeEnv, readAll } from '../helpers/fake-env.js';
import { hermeticGitEnv } from '../helpers/git-env.js';
import { runCli } from '../helpers/run-cli.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');
const NEWER = '99.0.0';

/**
 * `init` fails loud with the usage code when it can find no committer identity
 * (init.ts's hasGitIdentity), so a RunEnv driving it needs one. Spelled out
 * rather than spread from process.env: inheriting the runner's environment
 * would also inherit CONTEXTURE_UPDATE_CHECK, and a developer who has it set
 * would silently turn these tests vacuous.
 */
const GIT_IDENTITY = {
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
};

/** A RunEnv wired to a real store on disk, with the registry still injected. */
function envForStore(root: string, overrides: Partial<Parameters<typeof makeFakeEnv>[0]> = {}) {
  return makeFakeEnv({ cwd: root, git: createExecFileGitRunner(), ...overrides });
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : full.endsWith('.ts') ? [full] : [];
  });
}

/** cli-contract: the commit path and the offline path never consult the registry. */
describe('cli-contract: commands that must stay offline', () => {
  it('doctor makes no registry request, in either scope', async () => {
    const tmp = await makeTmpDir('contexture-offline-');
    try {
      const gitEnv = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env: gitEnv });

      // forbiddenRegistry throws if consulted; the advisory's own backstop
      // would swallow that, so this asserts on doctor's exit code AND on the
      // absence of any release finding.
      for (const argv of [['doctor'], ['doctor', '--staged']]) {
        const env = envForStore(tmp.root, { registry: forbiddenRegistry() });
        const code = await run([...argv, '--json'], env);
        const envelope = JSON.parse(readAll(env.io.stdout as unknown as PassThrough)) as {
          findings: { code: string }[];
        };
        expect(envelope.findings.map((f) => f.code)).not.toContain('cli.update_available');
        expect(envelope.findings.map((f) => f.code)).not.toContain('cli.update_check_failed');
        expect([ExitCode.Ok, ExitCode.CheckFailed]).toContain(code);
      }
    } finally {
      await tmp.cleanup();
    }
  });

  it('init succeeds with no network and reports no release finding', async () => {
    const tmp = await makeTmpDir('contexture-offline-init-');
    try {
      const env = envForStore(tmp.root, { registry: forbiddenRegistry(), env: GIT_IDENTITY });
      const code = await run(['init', '--json'], env);
      expect(code).toBe(ExitCode.Ok);
      const envelope = JSON.parse(readAll(env.io.stdout as unknown as PassThrough)) as {
        findings: { code: string }[];
      };
      expect(envelope.findings.map((f) => f.code)).not.toContain('cli.update_check_failed');
      expect(envelope.findings.map((f) => f.code)).not.toContain('cli.update_available');
    } finally {
      await tmp.cleanup();
    }
  });

  /**
   * The structural half: behavioural tests can only cover the commands they
   * invoke, and the point of the requirement is that no OTHER command grows a
   * registry call later. The port is reachable only through RunEnv, so naming
   * the files allowed to touch it is a complete check.
   */
  it('only the release-check modules reach the registry port', () => {
    const allowed = new Set(
      ['core/registry.ts', 'core/version-check.ts', 'core/env.ts', 'commands/version.ts'].map((p) =>
        path.join(SRC_DIR, p),
      ),
    );
    const offenders = walk(SRC_DIR).filter(
      (file) => !allowed.has(file) && /\benv\.registry\b|\bregistry\.latestVersion\b/.test(readFileSync(file, 'utf8')),
    );
    expect(offenders.map((f) => path.relative(SRC_DIR, f))).toEqual([]);
  });
});

/** cli-contract: the advisory does not disturb machine-readable output. */
describe('cli-contract: the advisory under --json', () => {
  it('leaves stdout exactly one JSON value, with the notice on stderr', async () => {
    const tmp = await makeTmpDir('contexture-advisory-json-');
    try {
      const gitEnv = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env: gitEnv });

      const env = envForStore(tmp.root, {
        registry: fakeRegistry({ kind: 'resolved', version: NEWER }).registry,
      });
      const code = await run(['update', '--json'], env);
      expect(code).toBe(ExitCode.Ok);

      const stdout = readAll(env.io.stdout as unknown as PassThrough);
      // Exactly one JSON value: one trailing newline, and it parses whole.
      expect(stdout.trimEnd().split('\n')).toHaveLength(1);
      const envelope = JSON.parse(stdout) as { status: string; findings: { code: string; severity: string }[] };
      expect(envelope.status).toBe('ok');
      const advisory = envelope.findings.find((f) => f.code === 'cli.update_available');
      expect(advisory?.severity).toBe('info');

      const stderr = readAll(env.io.stderr as unknown as PassThrough);
      expect(stderr).toContain(NEWER);
      expect(stderr).toContain('ctxr-upgrade');
    } finally {
      await tmp.cleanup();
    }
  });

  it('makes no request when the environment suppresses the check', async () => {
    const tmp = await makeTmpDir('contexture-advisory-off-');
    try {
      await runCli(['init'], { cwd: tmp.root, env: hermeticGitEnv() });
      const env = envForStore(tmp.root, {
        registry: forbiddenRegistry(),
        env: { [UPDATE_CHECK_ENV_VAR]: '0' },
      });
      expect(await run(['update', '--json'], env)).toBe(ExitCode.Ok);
      const envelope = JSON.parse(readAll(env.io.stdout as unknown as PassThrough)) as {
        findings: { code: string }[];
      };
      expect(envelope.findings.map((f) => f.code)).not.toContain('cli.update_check_failed');
    } finally {
      await tmp.cleanup();
    }
  });
});
