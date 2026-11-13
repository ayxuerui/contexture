import { homedir } from 'node:os';
import { SecondOpinionSchema } from '../config/schema.js';
import type { CommandOutcome, CommandRequires } from '../core/command.js';
import type { RunEnv } from '../core/env.js';
import { ExitCode } from '../core/exit-codes.js';
import type { Store } from '../core/store.js';
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
 * on the write path and no other command depends on it. A plan or a question
 * is all it needs, so it answers from any directory.
 *
 * second-opinion-lineup-in-store-config D4: the store is optional. Inside one,
 * the lineup is the store's `second_opinion` block; outside, the schema's own
 * defaults. A store that cannot be loaded refuses the command as it refuses
 * every other, since running on the shipped lineup there would quietly ignore
 * what the store said.
 *
 * D2: the exit codes are the shared table's. A partial result and a preflight
 * with a CLI down are the failed-check code; bad arguments and fewer than two
 * requested CLIs are the usage code (raised as SecondOpinionUsageError).
 */
export const requires: CommandRequires = { store: 'optional' };

function context(env: RunEnv, store: Store | null): SecondOpinionContext {
  return {
    source: env.env,
    lineup: store?.config.second_opinion ?? SecondOpinionSchema.parse({}),
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

function outcome<TData>(store: Store | null, failed: boolean, data: TData, lines: string[]): CommandOutcome<TData> {
  return {
    exitCode: failed ? ExitCode.CheckFailed : ExitCode.Ok,
    data,
    findings: [],
    humanSummary: lines.join('\n'),
    storeRoot: store?.root ?? null,
    schemaVersion: store?.config.schema_version ?? null,
  };
}

export interface PreflightData {
  tier: string;
  ok: boolean;
  confined: boolean;
  confinement_reason: string | null;
  clis: PreflightEntry[];
  withheld?: string[];
}

export async function executePreflight(env: RunEnv, store: Store | null, flags: CommonOptions): Promise<CommandOutcome<PreflightData>> {
  const { lines, ...data } = await preflight(context(env, store), flags);
  return outcome(store, !data.ok, data, lines);
}

export interface CritiqueData {
  out: string | null;
  manifest: CritiqueManifest;
  texts?: Record<string, string>;
}

export async function executeCritique(env: RunEnv, store: Store | null, flags: CritiqueOptions): Promise<CommandOutcome<CritiqueData>> {
  const { lines, ...data } = await critique(context(env, store), flags);
  return outcome(store, data.manifest.partial, data, lines);
}

export interface PollData {
  out: string | null;
  manifest: PollManifest;
  texts?: Record<string, string>;
}

export async function executePoll(env: RunEnv, store: Store | null, flags: PollOptions): Promise<CommandOutcome<PollData>> {
  const { lines, ...data } = await poll(context(env, store), flags);
  return outcome(store, data.manifest.partial, data, lines);
}
