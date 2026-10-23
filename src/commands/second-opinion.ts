import { homedir } from 'node:os';
import type { CommandOutcome, CommandRequires } from '../core/command.js';
import type { RunEnv } from '../core/env.js';
import { ExitCode } from '../core/exit-codes.js';
import {
  critique,
  poll,
  preflight,
  type CommonOptions,
  type CritiqueManifest,
  type CritiqueOptions,
  type PollManifest,
  type PollOptions,
  type PreflightEntry,
  type SecondOpinionContext,
} from '../core/second-opinion/modes.js';

/**
 * run-the-second-opinion-from-the-cli D1: `ctxr second-opinion preflight |
 * critique | poll`, the runner the `ctxr-second-opinion` skill used to carry
 * as `run.mjs`. It is the one command that invokes a model CLI; it is never
 * on the write path and no other command depends on it. It reads no store:
 * a plan or a question is all it needs, so it answers from any directory.
 *
 * D2: the exit codes are the shared table's. A partial result and a preflight
 * with a CLI down are the failed-check code; bad arguments and fewer than two
 * requested CLIs are the usage code (raised as SecondOpinionUsageError).
 */
export const requires: CommandRequires = { store: 'absent' };

function context(env: RunEnv): SecondOpinionContext {
  return {
    source: env.env,
    cwd: env.cwd,
    home: env.env.HOME || homedir(),
    progress: (line) => {
      env.io.stderr.write(`${line}\n`);
    },
    readStdin: async () => {
      if (env.io.stdin.isTTY) return null;
      const chunks: Buffer[] = [];
      for await (const chunk of env.io.stdin) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer));
      return Buffer.concat(chunks).toString('utf8');
    },
  };
}

function outcome<TData>(failed: boolean, data: TData, lines: string[]): CommandOutcome<TData> {
  return {
    exitCode: failed ? ExitCode.CheckFailed : ExitCode.Ok,
    data,
    findings: [],
    humanSummary: lines.join('\n'),
    storeRoot: null,
    schemaVersion: null,
  };
}

export interface PreflightData {
  tier: string;
  ok: boolean;
  clis: PreflightEntry[];
  withheld?: string[];
}

export async function executePreflight(env: RunEnv, flags: CommonOptions): Promise<CommandOutcome<PreflightData>> {
  const { lines, ...data } = await preflight(context(env), flags);
  return outcome(!data.ok, data, lines);
}

export interface CritiqueData {
  out: string;
  manifest: CritiqueManifest;
}

export async function executeCritique(env: RunEnv, flags: CritiqueOptions): Promise<CommandOutcome<CritiqueData>> {
  const { lines, ...data } = await critique(context(env), flags);
  return outcome(data.manifest.partial, data, lines);
}

export interface PollData {
  out: string;
  manifest: PollManifest;
}

export async function executePoll(env: RunEnv, flags: PollOptions): Promise<CommandOutcome<PollData>> {
  const { lines, ...data } = await poll(context(env), flags);
  return outcome(data.manifest.partial, data, lines);
}
