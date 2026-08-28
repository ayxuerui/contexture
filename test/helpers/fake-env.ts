import { PassThrough } from 'node:stream';
import type { GitResult, GitRunner } from '../../src/core/git/exec.js';
import type { Io, RunEnv } from '../../src/core/env.js';
import type { ProfileChoice, Prompter } from '../../src/prompt/prompter.js';

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

export function fakePrompter(returnId: string): { prompter: Prompter; calls: FakePrompterCall[] } {
  const calls: FakePrompterCall[] = [];
  return {
    calls,
    prompter: {
      async selectProfile(input) {
        calls.push(input);
        return returnId;
      },
    },
  };
}

export function fakeGitRunner(
  responses: Map<string, GitResult> = new Map(),
): { git: GitRunner; calls: string[][] } {
  const calls: string[][] = [];
  return {
    calls,
    git: {
      async run(args) {
        calls.push([...args]);
        return responses.get(args.join(' ')) ?? { stdout: '', stderr: '', exitCode: 0 };
      },
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
    env: {},
    io,
    noInput: false,
    prompter: fakePrompter('para').prompter,
    git: fakeGitRunner().git,
    now: () => new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}
