import { mkdir, chmod, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { StoreConfigSchema } from '../../src/config/schema.js';
import { ExitCode } from '../../src/core/exit-codes.js';
import type { RegistryLookup } from '../../src/core/registry.js';
import type { Store } from '../../src/core/store.js';
import { updateCheckCachePath } from '../../src/core/version-check.js';
import * as sessionStartCommand from '../../src/commands/session-start.js';
import * as updateCommand from '../../src/commands/update.js';
import { fakeRegistry, makeFakeEnv } from '../helpers/fake-env.js';
import { makeTmpDir, type TmpDir } from '../helpers/tmp-store.js';

const NEWER = '99.0.0';

const cleanups: TmpDir[] = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()?.cleanup();
});

async function makeStore(): Promise<Store> {
  const tmp = await makeTmpDir('contexture-advisory-');
  cleanups.push(tmp);
  const config = StoreConfigSchema.parse({
    schema_version: 1,
    taxonomy: { profile: 'custom', layers: [] },
    git: { default_branch: 'main' },
    organize: { archive_destination: 'archive/' },
  });
  return { root: tmp.root, config } as unknown as Store;
}

/**
 * cli-contract: an advisory about a newer release never changes the outcome of
 * the command carrying it.
 *
 * The failure matrix is the point of this file. Session start creates a git
 * worktree BEFORE the advisory runs, so an advisory that threw would report a
 * failed session that had in fact succeeded — with an orphan worktree left
 * behind. Every row below must still exit 0.
 */
describe('cli-contract: the advisory cannot fail the command carrying it', () => {
  const FAILURES: [string, RegistryLookup][] = [
    ['a timeout', { kind: 'undetermined', reason: 'the registry did not answer within 1500ms' }],
    ['a DNS failure', { kind: 'undetermined', reason: 'getaddrinfo ENOTFOUND registry.npmjs.org' }],
    ['a non-success status', { kind: 'undetermined', reason: 'the registry answered 503' }],
    ['an unparseable body', { kind: 'undetermined', reason: 'Unexpected token < in JSON' }],
    ['an unrecognizable published version', { kind: 'resolved', version: 'latest' }],
  ];

  it.each(FAILURES)('update survives %s', async (_label, lookup) => {
    const store = await makeStore();
    const env = makeFakeEnv({ registry: fakeRegistry(lookup).registry });
    const outcome = await updateCommand.execute(env, store);
    expect(outcome.exitCode).toBe(ExitCode.Ok);
    expect(outcome.findings.map((f) => f.code)).toContain('cli.update_check_failed');
    expect(outcome.findings.every((f) => f.severity !== 'error')).toBe(true);
    expect(outcome.notices).toBeUndefined();
  });

  it.each(FAILURES)('session start survives %s, and still created the worktree', async (_label, lookup) => {
    const store = await makeStore();
    const env = makeFakeEnv({ registry: fakeRegistry(lookup).registry });
    const outcome = await sessionStartCommand.execute(env, store);
    expect(outcome.exitCode).toBe(ExitCode.Ok);
    expect(outcome.data?.worktree).toBeTruthy();
    expect(outcome.findings.map((f) => f.code)).toEqual(['cli.update_check_failed']);
  });

  it('survives a registry client that throws outright', async () => {
    // Reaching the backstop is a bug, but it must still not fail the command.
    const store = await makeStore();
    const env = makeFakeEnv({
      registry: {
        async latestVersion() {
          throw new Error('boom');
        },
      },
    });
    const outcome = await sessionStartCommand.execute(env, store);
    expect(outcome.exitCode).toBe(ExitCode.Ok);
    expect(outcome.data?.worktree).toBeTruthy();
    expect(outcome.findings.map((f) => f.code)).toEqual(['cli.update_check_failed']);
  });

  it('survives an unwritable cache directory', async () => {
    const store = await makeStore();
    const cacheDir = path.dirname(updateCheckCachePath(store));
    await mkdir(cacheDir, { recursive: true });
    await chmod(cacheDir, 0o500);
    try {
      const env = makeFakeEnv({ registry: fakeRegistry({ kind: 'resolved', version: NEWER }).registry });
      const outcome = await updateCommand.execute(env, store);
      expect(outcome.exitCode).toBe(ExitCode.Ok);
      expect(outcome.findings.map((f) => f.code)).toContain('cli.update_available');
    } finally {
      await chmod(cacheDir, 0o700);
    }
  });

  it('survives a corrupt cache file', async () => {
    const store = await makeStore();
    const filePath = updateCheckCachePath(store);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, '{ this is not json', 'utf8');
    const env = makeFakeEnv({ registry: fakeRegistry({ kind: 'resolved', version: NEWER }).registry });
    const outcome = await sessionStartCommand.execute(env, store);
    expect(outcome.exitCode).toBe(ExitCode.Ok);
    expect(outcome.findings.map((f) => f.code)).toEqual(['cli.update_available']);
  });
});

describe('cli-contract: the advisory when a newer release exists', () => {
  it('reports exactly one info finding and a stderr notice, still exiting 0', async () => {
    const store = await makeStore();
    const env = makeFakeEnv({ registry: fakeRegistry({ kind: 'resolved', version: NEWER }).registry });
    const outcome = await sessionStartCommand.execute(env, store);
    expect(outcome.exitCode).toBe(ExitCode.Ok);
    expect(outcome.findings).toHaveLength(1);
    expect(outcome.findings[0]?.code).toBe('cli.update_available');
    expect(outcome.findings[0]?.severity).toBe('info');
    expect(outcome.notices?.[0]).toContain(NEWER);
    expect(outcome.notices?.[0]).toContain('ctxr-upgrade');
  });

  it('reports neither finding nor notice when the installed version is current', async () => {
    const store = await makeStore();
    const { CLI_VERSION } = await import('../../src/version.js');
    const env = makeFakeEnv({ registry: fakeRegistry({ kind: 'resolved', version: CLI_VERSION }).registry });
    const outcome = await sessionStartCommand.execute(env, store);
    expect(outcome.findings).toEqual([]);
    expect(outcome.notices).toBeUndefined();
  });

  it('leaves the update command its own findings alongside the advisory', async () => {
    const store = await makeStore();
    const env = makeFakeEnv({ registry: fakeRegistry({ kind: 'resolved', version: NEWER }).registry });
    const outcome = await updateCommand.execute(env, store);
    expect(outcome.exitCode).toBe(ExitCode.Ok);
    expect(outcome.findings.map((f) => f.code)).toContain('cli.update_available');
  });
});
