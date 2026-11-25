import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { SecondOpinionLineup } from '../../../config/schema.js';
import { runServerCli, type CliRunResult } from '../cli-runner.js';
import { ToolRefusal } from '../jsonrpc.js';
import {
  SECOND_OPINION_CLI_TIMEOUT_SECONDS,
  SECOND_OPINION_LINEUP_VARIABLE,
  SECOND_OPINION_MAX_WAIT_SECONDS,
  SECOND_OPINION_OWNER_VARIABLE,
  SECOND_OPINION_TIMEOUT_MS,
} from '../tool-map.js';

/**
 * offer-the-second-opinion-on-its-own D2 (remote-access spec, *A second
 * opinion runs through four tools of its own*): one tool per `ctxr
 * second-opinion` command, under the `second-opinion` scope. This module
 * takes only what the four use — the CLI entry, the environment, where the
 * lineup comes from and the bounds — so the server with no store builds the
 * same tools as `ctxr serve`.
 *
 * Each tool builds its command's argument vector from typed fields. There is
 * no argument vector from the member, so there is nothing to refuse in one:
 * no field names a path, a session, an output directory, a model, a route or
 * an address. The plan or question arrives as text and is written to a file
 * in the call's own temporary folder, outside any checkout, removed when the
 * call ends.
 *
 * serve-the-second-opinion-to-chat-apps D2–D4: confinement is required, and
 * each model CLI's own timeout stays within the shell's default.
 *
 * second-opinion-start-and-fetch D5, D6: every call answers within its bound.
 * The member's email goes to the CLI as the run's owner, so a run is fetched,
 * and named in a busy refusal, only by the member who started it. A critique
 * or poll is started detached and waited on once: a short run answers in that
 * call, and a long one hands back its run id. The CLI's own lock keeps runs
 * one at a time.
 */

/** Where a run's lineup comes from: a store root the command reads, or the lineup itself where there is no store. */
export type LineupSource = { storeRoot: string } | { lineup: SecondOpinionLineup };

export interface SecondOpinionToolContext {
  /** The CLI entry the tools spawn with `process.execPath`. */
  entry: string;
  /** The server's environment; forge credentials are removed before anything runs. */
  env: Readonly<Record<string, string | undefined>>;
  /**
   * second-opinion-lineup-in-store-config D5: in `ctxr serve` the root of the
   * commit being served, never a session's working copy. In the server with
   * no store, its file's lineup.
   */
  lineupSource(): Promise<LineupSource>;
  /** One call's bound, when a caller (a test) needs a different one. */
  timeoutMs?: number;
  /** The longest `result` wait, when a caller (a test) needs a different one. */
  maxWaitSeconds?: number;
}

const tierField = { type: 'string', enum: ['strong', 'fast'], description: "strong (each family's frontier model, the default) or fast (each family's workhorse)." } as const;
const onlyField = { type: 'string', description: 'Comma-separated critics to use, of claude, gpt, gemini and grok. A critique or poll needs at least two.' } as const;
const timeoutField = { type: 'integer', minimum: 1, maximum: SECOND_OPINION_CLI_TIMEOUT_SECONDS, description: `Each critic's own time limit in seconds, at most ${SECOND_OPINION_CLI_TIMEOUT_SECONDS} (the default).` } as const;

export const SECOND_OPINION_PREFLIGHT_INPUT_SCHEMA = {
  type: 'object',
  properties: { tier: tierField, only: onlyField, timeout: timeoutField },
  additionalProperties: false,
} as const;

export const SECOND_OPINION_CRITIQUE_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    plan: { type: 'string', description: 'The whole plan to critique, as text. It is sent to the critics as written.' },
    tier: tierField,
    only: onlyField,
    timeout: timeoutField,
    seed: { type: 'integer', description: 'Seeds the letter assignment, for a reproducible mapping.' },
  },
  required: ['plan'],
  additionalProperties: false,
} as const;

export const SECOND_OPINION_POLL_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    prompt: { type: 'string', description: 'The question and its options, as text.' },
    lens: { type: 'string', description: 'Two or three comma-separated taste lenses: built-in names or Name:description.' },
    wrap: { type: 'boolean', description: 'false sends the question as written, without the answer scaffold. Default true.' },
    tier: tierField,
    only: onlyField,
    timeout: timeoutField,
  },
  required: ['prompt'],
  additionalProperties: false,
} as const;

export const SECOND_OPINION_RESULT_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    run: { type: 'string', description: 'The run id a critique or poll returned.' },
    wait: { type: 'integer', minimum: 0, description: `How long to wait for the run, in seconds. The server waits at most ${SECOND_OPINION_MAX_WAIT_SECONDS}.` },
  },
  required: ['run'],
  additionalProperties: false,
} as const;

/** The plan or question is capped like `Write`'s content. */
const MAX_TEXT_BYTES = 256 * 1024;
const MAX_OPTION_CHARS = 2048;

const invalid = (message: string) => new ToolRefusal('mcp.invalid_arguments', message);

type Schema = { readonly properties: Readonly<Record<string, unknown>>; readonly required?: readonly string[] };

/** Every field must be one the schema names: a field for a file, an output directory or a session is refused, not ignored. */
function checkFields(tool: string, schema: Schema, args: Record<string, unknown>): void {
  const known = Object.keys(schema.properties);
  const extra = Object.keys(args).filter((key) => !known.includes(key));
  if (extra.length > 0) throw invalid(`${tool} takes ${known.map((k) => `"${k}"`).join(', ')}, not ${extra.map((k) => `"${k}"`).join(', ')}. The plan or question goes in as text; nothing here names a file, a session or a model.`);
}

function text(args: Record<string, unknown>, field: string): string {
  const value = args[field];
  if (typeof value !== 'string' || value.trim() === '') throw invalid(`"${field}" is required: the text itself, not a path.`);
  if (Buffer.byteLength(value, 'utf8') > MAX_TEXT_BYTES) throw invalid(`"${field}" is at most ${MAX_TEXT_BYTES} bytes.`);
  return value;
}

function option(args: Record<string, unknown>, field: string): string | undefined {
  const value = args[field];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string' || value.trim() === '' || value.length > MAX_OPTION_CHARS || value.includes('\0')) throw invalid(`"${field}", when given, is a short string.`);
  // An option's value is never read as another option: every one is passed as `--name=value`.
  return value.trim();
}

function wholeNumber(args: Record<string, unknown>, field: string, min: number): number | undefined {
  const value = args[field];
  if (value === undefined || value === null) return undefined;
  const n = typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value.trim()) : value;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < min) throw invalid(`"${field}", when given, is a whole number of at least ${min}.`);
  return n;
}

interface Common {
  tier?: string;
  only?: string;
  timeout?: number;
}

function common(args: Record<string, unknown>): Common {
  const timeout = wholeNumber(args, 'timeout', 1);
  // Refused before anything runs: a longer limit would outlive what the server lets a run take.
  if (timeout !== undefined && timeout > SECOND_OPINION_CLI_TIMEOUT_SECONDS) throw invalid(`"timeout" is at most ${SECOND_OPINION_CLI_TIMEOUT_SECONDS} seconds here.`);
  return { tier: option(args, 'tier'), only: option(args, 'only'), timeout };
}

function commonArgv(c: Common): string[] {
  const argv: string[] = [];
  if (c.tier !== undefined) argv.push(`--tier=${c.tier}`);
  if (c.only !== undefined) argv.push(`--only=${c.only}`);
  if (c.timeout !== undefined) argv.push(`--timeout=${c.timeout}`);
  return argv;
}

export type SecondOpinionArgs =
  | ({ command: 'preflight' } & Common)
  | ({ command: 'critique'; plan: string; seed?: number } & Common)
  | ({ command: 'poll'; prompt: string; lens?: string; wrap: boolean } & Common)
  | { command: 'result'; run: string; wait?: number };

export function parsePreflightArgs(args: Record<string, unknown>): SecondOpinionArgs {
  checkFields('second_opinion_preflight', SECOND_OPINION_PREFLIGHT_INPUT_SCHEMA, args);
  return { command: 'preflight', ...common(args) };
}

export function parseCritiqueArgs(args: Record<string, unknown>): SecondOpinionArgs {
  checkFields('second_opinion_critique', SECOND_OPINION_CRITIQUE_INPUT_SCHEMA, args);
  return { command: 'critique', plan: text(args, 'plan'), seed: wholeNumber(args, 'seed', 0), ...common(args) };
}

export function parsePollArgs(args: Record<string, unknown>): SecondOpinionArgs {
  checkFields('second_opinion_poll', SECOND_OPINION_POLL_INPUT_SCHEMA, args);
  if (args.wrap !== undefined && args.wrap !== null && typeof args.wrap !== 'boolean') throw invalid('"wrap", when given, is true or false.');
  return { command: 'poll', prompt: text(args, 'prompt'), lens: option(args, 'lens'), wrap: args.wrap !== false, ...common(args) };
}

export function parseResultArgs(args: Record<string, unknown>): SecondOpinionArgs {
  checkFields('second_opinion_result', SECOND_OPINION_RESULT_INPUT_SCHEMA, args);
  const run = args.run;
  if (typeof run !== 'string' || !/^[a-z2-7]{26}$/.test(run.trim())) throw invalid('"run" is the run id a critique or poll returned.');
  return { command: 'result', run: run.trim(), wait: wholeNumber(args, 'wait', 0) };
}

/**
 * The server's environment for a second opinion: without its forge
 * credentials or any store root of its own, with the OpenRouter key kept
 * (second-opinion-through-openrouter D4), and with the member as the run's
 * owner. The lineup is the store root's, or handed over in a variable.
 */
export function secondOpinionEnv(env: Readonly<Record<string, string | undefined>>, source: LineupSource, folder: string, email: string): Record<string, string> {
  const child: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue;
    if (/TOKEN/i.test(key) || key.startsWith('GH_') || key.startsWith('GITHUB_') || key.startsWith('CONTEXTURE_GITHUB_')) continue;
    if (key === 'CONTEXTURE_ROOT' || key === 'CONTEXTURE_STORE_ROOT' || key === 'GIT_ASKPASS' || key === 'SSH_ASKPASS' || key === 'SSH_AUTH_SOCK') continue;
    if (key === SECOND_OPINION_LINEUP_VARIABLE || key === SECOND_OPINION_OWNER_VARIABLE) continue;
    child[key] = value;
  }
  if ('storeRoot' in source) child.CONTEXTURE_STORE_ROOT = source.storeRoot;
  else child[SECOND_OPINION_LINEUP_VARIABLE] = JSON.stringify(source.lineup);
  child[SECOND_OPINION_OWNER_VARIABLE] = email;
  // gh's own credential file is out of reach too: its configuration directory is one that does not exist.
  child.GH_CONFIG_DIR = path.join(folder, 'no-gh-config');
  child.GIT_TERMINAL_PROMPT = '0';
  return child;
}

export interface SecondOpinionToolResult extends CliRunResult {
  /** The command that ran, as `ctxr <command>` names it. */
  command: string;
}

/** The run id a detached start printed on its `run:` line. */
function startedRun(stdout: string): string | null {
  return /^run: ([a-z2-7]{26})$/m.exec(stdout)?.[1] ?? null;
}

export async function secondOpinionTool(ctx: SecondOpinionToolContext, email: string, args: SecondOpinionArgs): Promise<SecondOpinionToolResult> {
  const command = `second-opinion ${args.command}`;
  const maxWait = ctx.maxWaitSeconds ?? SECOND_OPINION_MAX_WAIT_SECONDS;
  const source = await ctx.lineupSource();
  const folder = await mkdtemp(path.join(tmpdir(), 'ctxr-mcp-second-opinion-'));
  const env = secondOpinionEnv(ctx.env, source, folder, email);
  // `--no-input` always: nothing a tool runs may wait on a person.
  const runCli = (argv: string[]) => runServerCli({ entry: ctx.entry, argv: [...argv, '--no-input'], cwd: folder, env, timeoutMs: ctx.timeoutMs ?? SECOND_OPINION_TIMEOUT_MS });
  try {
    if (args.command === 'result') {
      // A longer wait is cut to the bound, so the call still answers in time.
      const wait = args.wait !== undefined && args.wait <= maxWait ? args.wait : maxWait;
      return { command, ...(await runCli(['second-opinion', 'result', args.run, `--wait=${wait}`])) };
    }
    if (args.command === 'preflight') return { command, ...(await runCli(['second-opinion', 'preflight', ...commonArgv(args), '--require-confinement'])) };

    const inputFile = path.join(folder, 'input.md');
    await writeFile(inputFile, args.command === 'critique' ? args.plan : args.prompt, { flag: 'wx', mode: 0o600 });
    const argv = ['second-opinion', args.command, args.command === 'critique' ? `--plan-file=${inputFile}` : `--prompt-file=${inputFile}`, ...commonArgv(args)];
    if (args.command === 'critique' && args.seed !== undefined) argv.push(`--seed=${args.seed}`);
    if (args.command === 'poll' && args.lens !== undefined) argv.push(`--lens=${args.lens}`);
    if (args.command === 'poll' && !args.wrap) argv.push('--no-wrap');
    // D6: a detached start and one bounded wait.
    const start = await runCli([...argv, '--require-confinement', '--detach']);
    const run = start.exit_code === 0 ? startedRun(start.stdout) : null;
    if (run === null) return { command, ...start };
    const fetched = await runCli(['second-opinion', 'result', run, `--wait=${maxWait}`]);
    return { command, ...fetched, duration_ms: start.duration_ms + fetched.duration_ms };
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

/** The command's own output, as a shell shows it. Nothing here names the store or a commit. */
export function renderSecondOpinion(data: unknown): string {
  const r = data as SecondOpinionToolResult;
  const head = r.timed_out ? `ctxr ${r.command} was stopped after the time limit.` : `ctxr ${r.command} exited ${r.exit_code}.`;
  const parts = [head];
  if (r.stdout !== '') parts.push(r.stdout.replace(/\n$/, '') + (r.stdout_truncated ? '\n[output cut at the size limit]' : ''));
  if (r.stderr !== '') parts.push(`[stderr]\n${r.stderr.replace(/\n$/, '')}${r.stderr_truncated ? '\n[cut at the size limit]' : ''}`);
  return parts.join('\n\n');
}
