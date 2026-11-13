import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { SecondOpinionLineup } from '../../config/schema.js';
import { SecondOpinionUnconfinedError, SecondOpinionUsageError } from '../errors.js';
import { onPath, type Confinement, type ConfinedRun } from './confine.js';
import { childEnvironment, PASS_ENV_VARIABLE, protectedPassThroughNames, type SourceEnv } from './environment.js';
import { judgeCritique } from './judge.js';
import { firstLines, runCli, type CliResult } from './launch.js';
import { ALL_CLIS, buildInvocation, FLAGS_USED, INSTALL_LEVELS, LOGIN_FILES, MAX_ARGV_BYTES, normalize, QUORUM, ROLE_CLI, ROLES, TIERS, lineupCell, type Cli, type LineupSource, type Role, type Tier } from './lineup.js';
import { critiquePrompt, pollPrompt } from './prompts.js';

/**
 * run-the-second-opinion-from-the-cli: the three modes of `ctxr second-opinion`,
 * ported from the skill's `run.mjs`. Behaviour is the script's; what changed is
 * the exit-code mapping (D2, done by the command) and the child environment
 * (D3, built here once per run). Each mode returns the lines the script
 * printed to stdout, plus a structured result for `--json`.
 */
export interface SecondOpinionContext {
  /** The command's own environment: the source the allowlist filters, and where the lineup overrides are read. */
  source: SourceEnv;
  /** The store's `second_opinion` block, or the schema's defaults outside a store (second-opinion-lineup-in-store-config). */
  lineup: SecondOpinionLineup;
  cwd: string;
  home: string;
  /** Progress narration, for stderr. */
  progress(line: string): void;
  /** Piped standard input, or null when stdin is a terminal. */
  readStdin(): Promise<string | null>;
}

export interface CommonOptions {
  tier?: string;
  timeout?: string;
  only?: string;
  /** End before any model CLI starts when the run cannot be confined (serve-the-second-opinion-to-chat-apps). */
  requireConfinement?: boolean;
}

interface Resolved {
  tier: Tier;
  timeout: number;
  clis: Cli[];
  env: Record<string, string>;
  withheld: string[];
  confinement: Confinement;
}

/**
 * serve-the-second-opinion-to-chat-apps D1: whether this machine can wrap a
 * CLI in Landlock rules. `setpriv` must offer them (util-linux 2.40 and
 * later) and the kernel must accept them, which a probe run of `setpriv`
 * itself under a read-only rule shows.
 */
async function detectConfinement(env: Record<string, string>): Promise<Confinement> {
  if (process.platform !== 'linux') return { confined: false, reason: 'Landlock is Linux-only' };
  const setpriv = onPath('setpriv', env.PATH);
  if (setpriv === null) return { confined: false, reason: 'setpriv is not installed (util-linux 2.40 or later applies Landlock)' };
  const help = await runCli(setpriv, ['--help'], '', 10, env);
  if (!`${help.stdout}${help.stderr}`.includes('--landlock-access')) {
    return { confined: false, reason: 'this setpriv cannot apply Landlock (util-linux 2.40 or later can)' };
  }
  const probe = await runCli(setpriv, ['--landlock-access', 'fs', '--landlock-rule', 'path-beneath:execute,read-file,read-dir:/', '--', setpriv, '--version'], '', 10, env);
  if (!probe.ok) return { confined: false, reason: `the kernel refused Landlock: ${probe.cause ?? 'failed'}` };
  return { confined: true, setpriv };
}

/** One CLI's confined run, or undefined when this machine cannot confine. */
function confinedRun(ctx: SecondOpinionContext, r: Resolved, cli: Cli): ConfinedRun | undefined {
  if (!r.confinement.confined) return undefined;
  return { setpriv: r.confinement.setpriv, sourceHome: ctx.home, logins: LOGIN_FILES[cli], installLevels: INSTALL_LEVELS[cli] };
}

const confinementLine = (c: Confinement): string =>
  c.confined ? 'confined: yes (each CLI in a fresh home of its own, under Landlock)' : `confined: no (${c.reason})`;

/** Every refusal happens here, before any CLI launches. */
async function resolve(ctx: SecondOpinionContext, opts: CommonOptions, needQuorum: boolean): Promise<Resolved> {
  const r = resolveOptions(ctx, opts, needQuorum);
  const confinement = await detectConfinement(r.env);
  if (opts.requireConfinement && !confinement.confined) throw new SecondOpinionUnconfinedError(confinement.reason);
  return { ...r, confinement };
}

function resolveOptions(ctx: SecondOpinionContext, opts: CommonOptions, needQuorum: boolean): Omit<Resolved, 'confinement'> {
  const tier = (opts.tier ?? 'strong') as Tier;
  if (!TIERS.includes(tier)) throw new SecondOpinionUsageError('--tier is strong or fast');
  const timeout = opts.timeout === undefined ? 600 : Number(opts.timeout);
  if (!Number.isFinite(timeout) || timeout <= 0) throw new SecondOpinionUsageError('--timeout must be a positive number of seconds');

  let clis: Cli[] = [...ALL_CLIS];
  if (opts.only !== undefined) {
    const named = opts.only.split(',').map((c) => c.trim()).filter(Boolean);
    const bad = named.filter((c) => !(ALL_CLIS as readonly string[]).includes(c));
    if (bad.length) throw new SecondOpinionUsageError(`unknown CLI in --only: ${bad.join(', ')} (valid: ${ALL_CLIS.join(', ')})`);
    clis = [...new Set(named as Cli[])];
  }
  if (needQuorum && clis.length < QUORUM) {
    throw new SecondOpinionUsageError(`--only names ${clis.length} CLI; a second opinion needs at least ${QUORUM}`);
  }

  // D3 and Revisions after critique 1: the protected prefixes win over the pass-through, and naming one stops the run.
  const refused = protectedPassThroughNames(ctx.source);
  if (refused.length) {
    throw new SecondOpinionUsageError(
      `${PASS_ENV_VARIABLE} names ${refused.join(', ')}; forge and contexture variables are never passed to a model CLI`,
      { variables: refused },
    );
  }
  const { env, withheld } = childEnvironment(ctx.source, ctx.home);
  return { tier, timeout, clis, env, withheld };
}

// ---------------------------------------------------------------------------
// Preflight.
// ---------------------------------------------------------------------------

export interface PreflightEntry {
  cli: Cli;
  ok: boolean;
  detail: string;
  /** The model this CLI was asked for, and where it came from. */
  model_asked: string;
  model_source: LineupSource;
}

/** How a model's source reads beside its name. */
const SOURCE_LABEL: Record<LineupSource, string> = { environment: 'environment', store: 'store configuration', default: 'shipped default' };

export interface PreflightResult {
  tier: Tier;
  ok: boolean;
  /** Whether each CLI ran confined; not confined alone does not fail the preflight. */
  confined: boolean;
  confinement_reason: string | null;
  clis: PreflightEntry[];
  /** On a failing preflight only: the variables withheld from the CLIs, by name. Never values. */
  withheld?: string[];
  lines: string[];
}

export async function preflight(ctx: SecondOpinionContext, opts: CommonOptions): Promise<PreflightResult> {
  const r = await resolve(ctx, opts, false);
  const results = await Promise.all(
    r.clis.map(async (cli): Promise<PreflightEntry> => {
      const spec = FLAGS_USED[cli];
      const cell = lineupCell(ctx.source, ctx.lineup, r.tier, cli);
      const asked = { model_asked: cell.model, model_source: cell.source };
      // A CLI that is down still names the model and its source: a refused model is the lineup's to fix.
      const down = (detail: string): PreflightEntry => ({ cli, ok: false, detail: `${detail} [asked for ${cell.model}, ${SOURCE_LABEL[cell.source]}]`, ...asked });
      const confine = confinedRun(ctx, r, cli);
      const help = await runCli(cli, spec.helpArgs, '', 30, r.env, confine);
      if (!help.ok) return down(help.cause ?? 'failed');
      const helpText = help.stdout + help.stderr;
      const missing = spec.flags.filter((f) => !helpText.includes(f));
      // The ping runs at the tier the run will use. A fixed tier left the other tier's model untested, so a
      // model name agy no longer accepted passed preflight and failed the critique (2026-10-13).
      const inv = buildInvocation(cli, 'say PONG only', cell);
      const ping = await runCli(inv.cmd, inv.args, inv.stdin, Math.min(r.timeout, 60), r.env, confine);
      if (!ping.ok) return down(ping.cause ?? 'failed');
      const { text } = normalize(cli, ping);
      if (!/pong/i.test(text)) return down(`unexpected reply: ${firstLines(text, 2)}`);
      if (missing.length) return down(`answers, but its --help no longer lists: ${missing.join(' ')}`);
      return { cli, ok: true, detail: `PONG (${cell.model}, ${SOURCE_LABEL[cell.source]})`, ...asked };
    }),
  );
  const ok = results.every((x) => x.ok);
  const lines = [...results.map((x) => `[${x.ok ? 'OK  ' : 'DOWN'}] ${x.cli.padEnd(7)} ${x.detail}`), confinementLine(r.confinement)];
  if (!ok) {
    lines.push('', 'At least one CLI is down. Re-authenticate it, or run with --only on the ones that are up.');
    // D3: a variable the allowlist dropped may be what a CLI needed. Names only, never values.
    if (r.withheld.length) {
      lines.push(`Withheld from the CLIs: ${r.withheld.join(', ')}. To pass one through, name it in ${PASS_ENV_VARIABLE}.`);
    }
  }
  const confinement = { confined: r.confinement.confined, confinement_reason: r.confinement.confined ? null : r.confinement.reason };
  return { tier: r.tier, ok, ...confinement, clis: results, ...(ok ? {} : { withheld: r.withheld }), lines };
}

// ---------------------------------------------------------------------------
// Input and output.
// ---------------------------------------------------------------------------

async function readInput(ctx: SecondOpinionContext, file: string | undefined, flag: '--plan-file' | '--prompt-file'): Promise<string> {
  if (file !== undefined) {
    const absolute = path.resolve(ctx.cwd, file);
    try {
      return readFileSync(absolute, 'utf8');
    } catch (err) {
      throw new SecondOpinionUsageError(`cannot read ${file}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  const piped = await ctx.readStdin();
  if (piped !== null && piped.trim()) return piped;
  throw new SecondOpinionUsageError(`no input: pass ${flag} PATH or pipe it on stdin`);
}

/**
 * serve-the-second-opinion-to-chat-apps D2: with `--print` the answers go to
 * stdout and nothing is written, so no plan or answer is left on the machine.
 */
function outDir(ctx: SecondOpinionContext, out: string | undefined, print: boolean | undefined): string | null {
  if (print) {
    if (out !== undefined) throw new SecondOpinionUsageError('--print writes no files; leave out --out');
    return null;
  }
  const dir = out !== undefined ? path.resolve(ctx.cwd, out) : mkdtempSync(path.join(tmpdir(), 'ctxr-second-opinion-out-'));
  mkdirSync(path.join(dir, 'raw'), { recursive: true });
  return dir;
}

function rng(seed: number | null): () => number {
  if (seed === null || Number.isNaN(seed)) return Math.random;
  let a = seed >>> 0; // mulberry32: deterministic, for tests
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

const tooLong = (prompt: string, cause: string): CliResult | null =>
  Buffer.byteLength(prompt) > MAX_ARGV_BYTES ? { ok: false, stdout: '', stderr: '', cause } : null;

// ---------------------------------------------------------------------------
// Critique.
// ---------------------------------------------------------------------------

export interface CritiqueOptions extends CommonOptions {
  planFile?: string;
  out?: string;
  seed?: string;
  print?: boolean;
}

export interface CritiqueEntry {
  letter: string | null;
  role: Role;
  cli: Cli;
  /** The model the CLI was asked for, and whether the environment, the store or the shipped lineup named it. */
  model_asked: string;
  model_source: LineupSource;
  model_reported: string | null;
  status: 'valid' | 'blind' | 'failed';
  cause: string | null;
  verdict: string | null;
  findings: number;
  veto: boolean;
  duration_ms: number;
}

export interface CritiqueManifest {
  mode: 'critique';
  tier: Tier;
  quorum: number;
  critiques: CritiqueEntry[];
  valid: number;
  partial: boolean;
  confined: boolean;
  confinement_reason: string | null;
}

export interface CritiqueResult {
  /** The output directory, or null with `--print`. */
  out: string | null;
  manifest: CritiqueManifest;
  /** With `--print`: each critique's text by letter. */
  texts?: Record<string, string>;
  lines: string[];
}

export async function critique(ctx: SecondOpinionContext, opts: CritiqueOptions): Promise<CritiqueResult> {
  const plan = await readInput(ctx, opts.planFile, '--plan-file');
  const dir = outDir(ctx, opts.out, opts.print);
  const r = await resolve(ctx, opts, true);
  const seed = opts.seed === undefined ? null : Number(opts.seed);
  const roles = ROLES.filter((role) => r.clis.includes(ROLE_CLI[role]));
  ctx.progress(`plan: ${plan.length} characters (about ${Math.ceil(plan.length / 4)} tokens) · tier: ${r.tier} · critics: ${roles.length} · each may take 1-3 minutes`);

  const runs = await Promise.all(
    roles.map(async (role) => {
      const cli = ROLE_CLI[role];
      const prompt = critiquePrompt(role, plan);
      const cell = lineupCell(ctx.source, ctx.lineup, r.tier, cli);
      const started = Date.now();
      let raw: CliResult;
      const refused = cli === 'agy' ? tooLong(prompt, `prompt is ${Buffer.byteLength(prompt)} bytes; agy takes it as one argument and the limit is ${MAX_ARGV_BYTES}`) : null;
      if (refused) raw = refused;
      else {
        const inv = buildInvocation(cli, prompt, cell);
        raw = await runCli(inv.cmd, inv.args, inv.stdin, r.timeout, r.env, confinedRun(ctx, r, cli));
      }
      if (dir !== null) writeFileSync(path.join(dir, 'raw', `${role}-${cli}.txt`), `${raw.stdout}\n--- stderr ---\n${raw.stderr}\n`);
      const base = { role, cli, asked: cell, duration_ms: Date.now() - started };
      if (!raw.ok) return { ...base, status: 'failed' as const, cause: raw.cause ?? null, model: null, text: '', verdict: null, findings: 0, veto: false };
      const { text, model } = normalize(cli, raw);
      const judged = judgeCritique(text, plan);
      return { ...base, status: judged.status, cause: judged.cause, model, text, verdict: judged.verdict, findings: judged.findings.length, veto: judged.veto };
    }),
  );

  // Letters go to every critique that produced text (valid or blind), in an order that does not follow the roster.
  const answered = runs.filter((x) => x.status !== 'failed');
  const letters = shuffled(answered, rng(seed)).map((x, i) => ({ ...x, letter: String.fromCharCode(65 + i) }));
  if (dir !== null) for (const x of letters) writeFileSync(path.join(dir, `critique-${x.letter}.md`), `${x.text}\n`);

  const valid = runs.filter((x) => x.status === 'valid').length;
  const manifest: CritiqueManifest = {
    mode: 'critique',
    tier: r.tier,
    quorum: QUORUM,
    critiques: runs.map((x) => ({
      letter: letters.find((l) => l.role === x.role)?.letter ?? null,
      role: x.role,
      cli: x.cli,
      model_asked: x.asked.model,
      model_source: x.asked.source,
      model_reported: x.model,
      status: x.status,
      cause: x.cause,
      verdict: x.verdict,
      findings: x.findings,
      veto: x.veto,
      duration_ms: x.duration_ms,
    })),
    valid,
    partial: valid < QUORUM,
    confined: r.confinement.confined,
    confinement_reason: r.confinement.confined ? null : r.confinement.reason,
  };
  if (dir !== null) writeFileSync(path.join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  // stdout names letters, never roles or models; a failed critic has no letter and is named by CLI, since that is what to fix.
  const lines = [...(dir !== null ? [`out: ${dir}`] : []), `valid: ${valid}  blind: ${runs.filter((x) => x.status === 'blind').length}  failed: ${runs.filter((x) => x.status === 'failed').length}`];
  for (const x of [...letters].sort((a, b) => a.letter.localeCompare(b.letter))) {
    lines.push(`  ${x.letter}  ${x.status}  ${x.verdict ?? '-'}  findings=${x.findings}${x.veto ? '  veto' : ''}`);
  }
  for (const x of runs.filter((y) => y.status === 'failed')) lines.push(`  failed  ${x.cli}  ${x.cause}`);
  if (manifest.partial) lines.push(`PARTIAL: fewer than ${QUORUM} valid critiques. Report this as a partial result, not a consensus.`);
  lines.push(confinementLine(r.confinement));
  if (dir !== null) {
    lines.push(`Read the critique files first; open ${path.join(dir, 'manifest.json')} last.`);
    return { out: dir, manifest, lines };
  }
  // D2: the letters first and the table that names them last, so a reader can synthesize before they look.
  const sorted = [...letters].sort((a, b) => a.letter.localeCompare(b.letter));
  for (const x of sorted) lines.push('', `===== critique-${x.letter} =====`, x.text);
  lines.push('', '===== letters (write the synthesis before reading on) =====');
  for (const x of sorted) lines.push(`  ${x.letter}  ${x.role}  ${x.cli}  model=${x.model ?? 'not reported'}`);
  return { out: null, manifest, texts: Object.fromEntries(sorted.map((x) => [x.letter, x.text])), lines };
}

// ---------------------------------------------------------------------------
// Poll.
// ---------------------------------------------------------------------------

export interface PollOptions extends CommonOptions {
  promptFile?: string;
  out?: string;
  lens?: string;
  /** False with `--no-wrap`: the question goes out without the answer scaffold. */
  wrap?: boolean;
  print?: boolean;
}

export interface PollAnswer {
  cli: Cli;
  status: 'valid' | 'failed';
  cause: string | null;
  /** The model the CLI reports having run, where it reports one. */
  model: string | null;
  /** The model the CLI was asked for, and whether the environment, the store or the shipped lineup named it. */
  model_asked: string;
  model_source: LineupSource;
}

export interface PollManifest {
  mode: 'poll';
  tier: Tier;
  lens: string | null;
  quorum: number;
  valid: number;
  partial: boolean;
  answers: PollAnswer[];
  confined: boolean;
  confinement_reason: string | null;
}

export interface PollResult {
  /** The output directory, or null with `--print`. */
  out: string | null;
  manifest: PollManifest;
  /** With `--print`: each answer's text by model CLI. */
  texts?: Record<string, string>;
  lines: string[];
}

export async function poll(ctx: SecondOpinionContext, opts: PollOptions): Promise<PollResult> {
  const question = await readInput(ctx, opts.promptFile, '--prompt-file');
  const dir = outDir(ctx, opts.out, opts.print);
  const r = await resolve(ctx, opts, true);
  const prompt = pollPrompt(question, { lens: opts.lens, wrap: opts.wrap !== false });
  ctx.progress(`question: ${question.length} characters · tier: ${r.tier} · models: ${r.clis.length}${opts.lens ? ` · lenses: ${opts.lens}` : ''}`);

  const runs = await Promise.all(
    r.clis.map(async (cli) => {
      let raw: CliResult;
      const cell = lineupCell(ctx.source, ctx.lineup, r.tier, cli);
      const asked = { model_asked: cell.model, model_source: cell.source };
      const refused = cli === 'agy' ? tooLong(prompt, `prompt exceeds the ${MAX_ARGV_BYTES}-byte argument limit`) : null;
      if (refused) raw = refused;
      else {
        const inv = buildInvocation(cli, prompt, cell);
        raw = await runCli(inv.cmd, inv.args, inv.stdin, r.timeout, r.env, confinedRun(ctx, r, cli));
      }
      if (dir !== null) writeFileSync(path.join(dir, 'raw', `poll-${cli}.txt`), `${raw.stdout}\n--- stderr ---\n${raw.stderr}\n`);
      if (!raw.ok) return { cli, status: 'failed' as const, cause: raw.cause ?? null, model: null, ...asked, text: '' };
      const { text, model } = normalize(cli, raw);
      if (!text) return { cli, status: 'failed' as const, cause: 'empty output', model, ...asked, text };
      return { cli, status: 'valid' as const, cause: null, model, ...asked, text };
    }),
  );

  // A poll is read model against model (the lens grid's columns are models), so files are named by model here.
  if (dir !== null) for (const x of runs.filter((y) => y.status === 'valid')) writeFileSync(path.join(dir, `poll-${x.cli}.md`), `${x.text}\n`);
  const valid = runs.filter((x) => x.status === 'valid').length;
  const manifest: PollManifest = {
    mode: 'poll',
    tier: r.tier,
    lens: opts.lens ?? null,
    quorum: QUORUM,
    valid,
    partial: valid < QUORUM,
    answers: runs.map(({ text: _text, ...rest }) => rest),
    confined: r.confinement.confined,
    confinement_reason: r.confinement.confined ? null : r.confinement.reason,
  };
  if (dir !== null) writeFileSync(path.join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  const lines = [...(dir !== null ? [`out: ${dir}`] : []), `valid: ${valid}  failed: ${runs.length - valid}`];
  for (const x of runs) lines.push(`  ${x.cli}  ${x.status}${x.cause ? `  ${x.cause}` : ''}${x.model ? `  model=${x.model}` : ''}`);
  if (manifest.partial) lines.push(`PARTIAL: fewer than ${QUORUM} answers. Report it as a partial result.`);
  lines.push(confinementLine(r.confinement));
  if (dir !== null) return { out: dir, manifest, lines };
  const answered = runs.filter((x) => x.status === 'valid');
  for (const x of answered) lines.push('', `===== poll-${x.cli} =====`, x.text);
  return { out: null, manifest, texts: Object.fromEntries(answered.map((x) => [x.cli, x.text])), lines };
}
