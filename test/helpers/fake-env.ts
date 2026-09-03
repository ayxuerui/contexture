import { PassThrough } from 'node:stream';
import type { GitResult, GitRunner } from '../../src/core/git/exec.js';
import type { Io, RunEnv } from '../../src/core/env.js';
import type { RegistryClient, RegistryLookup } from '../../src/core/registry.js';
import type { HarnessChoice, ProfileChoice, Prompter } from '../../src/prompt/prompter.js';

export function collectingStream(isTTY = false): PassThrough & { isTTY?: boolean } {
  const stream = new PassThrough() as PassThrough & { isTTY?: boolean };
  stream.isTTY = isTTY;
  return stream;
}

export function readAll(stream: PassThrough): string {
  const chunks: Buffer[] = [];
  let chunk: Buffer | null;
  // eslint-disable-next-line no-cond-assign
  while ((chunk = stream.read() as Buffer | null) !== null) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

export interface FakePrompterCall {
  message: string;
  choices: readonly ProfileChoice[];
  defaultId: string;
}

export interface FakeHarnessPrompterCall {
  message: string;
  choices: readonly HarnessChoice[];
  defaultIds: readonly string[];
}

export function fakePrompter(
  returnId: string,
  confirmResponse: boolean = true,
  harnessIds: string[] = ['claude-code'],
): {
  prompter: Prompter;
  calls: FakePrompterCall[];
  confirmCalls: { message: string }[];
  harnessCalls: FakeHarnessPrompterCall[];
} {
  const calls: FakePrompterCall[] = [];
  const confirmCalls: { message: string }[] = [];
  const harnessCalls: FakeHarnessPrompterCall[] = [];
  return {
    calls,
    confirmCalls,
    harnessCalls,
    prompter: {
      async selectProfile(input) {
        calls.push(input);
        return returnId;
      },
      async confirm(input) {
        confirmCalls.push(input);
        return confirmResponse;
      },
      async selectHarnesses(input) {
        harnessCalls.push(input);
        return harnessIds;
      },
    },
  };
}

/** A branch name is needed by nearly every init-related test, so it's the one sensible default. */
const DEFAULT_RESPONSES: ReadonlyMap<string, GitResult> = new Map([
  ['symbolic-ref --short HEAD', { exitCode: 0, stdout: 'main\n', stderr: '' }],
]);

export function fakeGitRunner(
  responses: Map<string, GitResult> = new Map(),
): { git: GitRunner; calls: string[][] } {
  const calls: string[][] = [];
  return {
    calls,
    git: {
      async run(args) {
        calls.push([...args]);
        const key = args.join(' ');
        return responses.get(key) ?? DEFAULT_RESPONSES.get(key) ?? { stdout: '', stderr: '', exitCode: 0 };
      },
    },
  };
}

/**
 * The release-registry fake. Default is "undetermined" rather than a version:
 * a test that does not care about the release check should never accidentally
 * assert against a made-up published version, and undetermined is the answer
 * that changes no behavior.
 *
 * `calls` records every lookup so a test can assert a command made NO request
 * at all — which is how the offline guarantee for doctor/init is enforced.
 */
export function fakeRegistry(lookup: RegistryLookup = { kind: 'undetermined', reason: 'no fake answer configured' }): {
  registry: RegistryClient;
  calls: string[];
} {
  const calls: string[] = [];
  return {
    calls,
    registry: {
      async latestVersion(packageName) {
        calls.push(packageName);
        return lookup;
      },
    },
  };
}

/** A registry that fails the test if anything asks it a question. */
export function forbiddenRegistry(): RegistryClient {
  return {
    async latestVersion() {
      throw new Error('the registry must not be consulted by this command');
    },
  };
}

export function makeFakeEnv(overrides: Partial<RunEnv> = {}): RunEnv {
  const io: Io = {
    stdin: Object.assign(new PassThrough(), { isTTY: false }),
    stdout: collectingStream(),
    stderr: collectingStream(),
  };
  return {
    cwd: '/tmp/fake-cwd',
    execPath: '/usr/local/bin/node',
    env: {},
    io,
    noInput: false,
    prompter: fakePrompter('para').prompter,
    git: fakeGitRunner().git,
    registry: fakeRegistry().registry,
    now: () => new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}
