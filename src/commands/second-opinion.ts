import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { SecondOpinionSchema, type SecondOpinionLineup } from '../config/schema.js';
import type { CommandOutcome, CommandRequires } from '../core/command.js';
import type { RunEnv } from '../core/env.js';
import { ContextureError, SecondOpinionUsageError } from '../core/errors.js';
import { ExitCode } from '../core/exit-codes.js';
import type { Store } from '../core/store.js';
import {
  critique,
  poll,
  preflight,
  validateDetached,
  type CommonOptions,
  type CritiqueManifest,
  type CritiqueOptions,
  type PollManifest,
  type PollOptions,
  type PreflightEntry,
  type SecondOpinionContext,
} from '../core/second-opinion/modes.js';
import { spawnDetachedRun } from '../core/second-opinion/launch.js';
import {
  newRunId,
  ownedRun,
  passLock,
  processStart,
  readResult,
  readRun,
  releaseLock,
  RUN_OWNER_VARIABLE,
  runFolder,
  runsRoot,
  stateOf,
  sweep,
  takeLock,
  writeResult,
  writeRun,
  type RunMode,
  type RunRecord,
} from '../core/second-opinion/runs.js';

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
 *
 * second-opinion-start-and-fetch: `--detach` starts a critique or a poll in
 * the background and returns its run id; `result` fetches it within a bounded
 * wait. The same steps in a shell and through the store's server.
 */
export const requires: CommandRequires = { store: 'optional' };

function context(env: RunEnv, store: Store | null, lineup?: SecondOpinionLineup): SecondOpinionContext {
  return {
    source: env.env,
    lineup: lineup ?? store?.config.second_opinion ?? SecondOpinionSchema.parse({}),
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

/** Options that start or carry a detached run (second-opinion-start-and-fetch). */
export interface DetachOptions {
  detach?: boolean;
  /** Internal: the run folder a detached child records its result in. Never shown in --help. */
  runFolder?: string;
}

export interface CritiqueData {
  out: string | null;
  manifest: CritiqueManifest;
  texts?: Record<string, string>;
}

export interface DetachData {
  run: string;
  mode: RunMode;
  state: 'running';
}

export async function executeCritique(env: RunEnv, store: Store | null, flags: CritiqueOptions & DetachOptions): Promise<CommandOutcome<CritiqueData | DetachData>> {
  if (flags.detach) return startDetached(env, store, 'critique', flags);
  if (flags.runFolder !== undefined) return runAsChild(env, flags.runFolder, async (ctx) => critique(ctx, flags), (data) => data.manifest.partial);
  const { lines, ...data } = await critique(context(env, store), flags);
  return outcome(store, data.manifest.partial, data, lines);
}

export interface PollData {
  out: string | null;
  manifest: PollManifest;
  texts?: Record<string, string>;
}

export async function executePoll(env: RunEnv, store: Store | null, flags: PollOptions & DetachOptions): Promise<CommandOutcome<PollData | DetachData>> {
  if (flags.detach) return startDetached(env, store, 'poll', flags);
  if (flags.runFolder !== undefined) return runAsChild(env, flags.runFolder, async (ctx) => poll(ctx, flags), (data) => data.manifest.partial);
  const { lines, ...data } = await poll(context(env, store), flags);
  return outcome(store, data.manifest.partial, data, lines);
}

// ---------------------------------------------------------------------------
// Detached runs (second-opinion-start-and-fetch).
// ---------------------------------------------------------------------------

/** The arguments a detached child runs with: the caller's options, its input as a file, and its answers printed. */
function childArgv(mode: RunMode, flags: CritiqueOptions & PollOptions, inputFile: string, folder: string): string[] {
  const argv = ['second-opinion', mode, mode === 'critique' ? '--plan-file' : '--prompt-file', inputFile];
  if (flags.tier !== undefined) argv.push('--tier', flags.tier);
  if (flags.only !== undefined) argv.push('--only', flags.only);
  if (flags.timeout !== undefined) argv.push('--timeout', flags.timeout);
  if (flags.requireConfinement) argv.push('--require-confinement');
  if (mode === 'critique' && flags.seed !== undefined) argv.push('--seed', flags.seed);
  if (mode === 'poll' && flags.lens !== undefined) argv.push('--lens', flags.lens);
  if (mode === 'poll' && flags.wrap === false) argv.push('--no-wrap');
  argv.push('--print', '--run-folder', folder);
  return argv;
}

/**
 * D1–D4: make every refusal the run would make, take the per-user lock, write
 * the run folder, and start the same command as a detached child that holds
 * the lock until its run ends. Returns at once with the run id.
 */
async function startDetached(env: RunEnv, store: Store | null, mode: RunMode, flags: CritiqueOptions & PollOptions & DetachOptions): Promise<CommandOutcome<DetachData>> {
  if (flags.out !== undefined) throw new SecondOpinionUsageError('--detach keeps its answers for result to fetch; leave out --out');
  if (flags.runFolder !== undefined) throw new SecondOpinionUsageError('--detach and --run-folder cannot be combined');
  const ctx = context(env, store);
  const input = await validateDetached(ctx, mode, flags);
  const owner = env.env[RUN_OWNER_VARIABLE] || null;
  const root = runsRoot();
  sweep(root);
  const run = newRunId();
  takeLock(root, run, owner);
  const folder = runFolder(root, run);
  try {
    mkdirSync(folder, { mode: 0o700 });
    const inputFile = path.join(folder, 'input.md');
    writeFileSync(inputFile, input, { flag: 'wx', mode: 0o600 });
    const argv = childArgv(mode, flags, inputFile, folder);
    const record: RunRecord = { run, mode, owner, started_at: new Date().toISOString(), pid: null, pid_start: null, lineup: ctx.lineup, argv };
    writeRun(folder, record);
    const pid = spawnChild(env, folder, argv);
    const pidStart = processStart(pid);
    writeRun(folder, { ...record, pid, pid_start: pidStart });
    passLock(root, run, pid, pidStart);
  } catch (err) {
    releaseLock(root, run);
    rmSync(folder, { recursive: true, force: true });
    throw err;
  }
  const lines = [`run: ${run}`, `started: the ${mode} runs in the background. Fetch it with: ctxr second-opinion result ${run}`];
  return outcome(store, false, { run, mode, state: 'running' as const }, lines);
}

function spawnChild(env: RunEnv, folder: string, argv: string[]): number {
  const pid = spawnDetachedRun(argv, folder, { ...env.env });
  if (pid === null) throw new SecondOpinionUsageError('the detached run did not start');
  return pid;
}

/**
 * The detached child: run with the lineup recorded at start, then record the
 * outcome — a refusal included — and release the lock. Its own output goes to
 * the folder's log files and is not what `result` prints.
 */
async function runAsChild<TData extends { manifest: { partial: boolean } }>(
  env: RunEnv,
  folder: string,
  body: (ctx: SecondOpinionContext) => Promise<TData & { lines: string[] }>,
  partial: (data: TData) => boolean,
): Promise<CommandOutcome<TData>> {
  const record = readRun(folder);
  if (record === null) throw new SecondOpinionUsageError(`${folder} holds no run`);
  const root = path.dirname(folder);
  try {
    const { lines, ...data } = await body(context(env, null, record.lineup));
    const result = outcome(null, partial(data as unknown as TData), data as unknown as TData, lines);
    writeResult(folder, { exit_code: result.exitCode, human: result.humanSummary, data: result.data, finished_at: new Date().toISOString() });
    return result;
  } catch (err) {
    const exitCode = err instanceof ContextureError ? err.exitCode : ExitCode.Internal;
    const message = err instanceof Error ? err.message : String(err);
    writeResult(folder, { exit_code: exitCode, human: `error: ${message}`, data: null, finished_at: new Date().toISOString() });
    throw err;
  } finally {
    releaseLock(root, record.run);
  }
}

export interface ResultOptions {
  wait?: string;
}

export interface ResultData {
  run: string;
  mode: RunMode;
  state: 'running' | 'finished' | 'stopped';
  elapsed_s: number;
  /** A finished run's own `--json` data: the manifest and the texts. */
  result?: unknown;
}

/** How long `result` waits by default, in a shell and on the server alike. */
export const DEFAULT_RESULT_WAIT_SECONDS = 45;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * `ctxr second-opinion result <run>`: wait up to `--wait` seconds for the run,
 * then print it as `--print` prints it, with its exit code — or say it is
 * still running, or that it stopped without finishing.
 */
export async function executeResult(env: RunEnv, run: string, flags: ResultOptions): Promise<CommandOutcome<ResultData>> {
  const wait = flags.wait === undefined ? DEFAULT_RESULT_WAIT_SECONDS : Number(flags.wait);
  if (!Number.isFinite(wait) || wait < 0) throw new SecondOpinionUsageError('--wait must be zero or a positive number of seconds');
  const owner = env.env[RUN_OWNER_VARIABLE] || null;
  const root = runsRoot();
  sweep(root);
  const { folder, record } = ownedRun(root, run, owner);
  const deadline = Date.now() + wait * 1000;
  let state = stateOf(folder, record);
  while (state === 'running' && Date.now() < deadline) {
    await sleep(Math.min(500, Math.max(0, deadline - Date.now())));
    state = stateOf(folder, readRun(folder) ?? record);
  }
  const elapsed_s = Math.round((Date.now() - Date.parse(record.started_at)) / 1000);
  const base = { run, mode: record.mode, elapsed_s };
  const plain = (exitCode: ExitCode, data: ResultData, lines: string[]): CommandOutcome<ResultData> => ({
    exitCode,
    data,
    findings: [],
    humanSummary: lines.join('\n'),
    storeRoot: null,
    schemaVersion: null,
  });
  if (state === 'running') {
    return plain(ExitCode.Ok, { ...base, state }, [`running: ${run} (${elapsed_s}s so far). Fetch it again with: ctxr second-opinion result ${run}`]);
  }
  if (state === 'stopped') {
    return plain(ExitCode.CheckFailed, { ...base, state }, [`stopped: ${run} ended without finishing. A restart or a kill stops a detached run; start it again.`]);
  }
  const result = readResult(folder)!;
  return plain(result.exit_code as ExitCode, { ...base, state, result: result.data }, [result.human]);
}
