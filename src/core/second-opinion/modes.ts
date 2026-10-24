import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SecondOpinionUsageError } from '../errors.js';
import { childEnvironment, PASS_ENV_VARIABLE, protectedPassThroughNames, type SourceEnv } from './environment.js';
import { judgeCritique } from './judge.js';
import { firstLines, runCli, type CliResult } from './launch.js';
import { ALL_CLIS, buildInvocation, FLAGS_USED, MAX_ARGV_BYTES, normalize, QUORUM, ROLE_CLI, ROLES, TIERS, tiers, type Cli, type Role, type Tier } from './lineup.js';
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
}

interface Resolved {
  tier: Tier;
  timeout: number;
  clis: Cli[];
  env: Record<string, string>;
  withheld: string[];
}

/** Every refusal happens here, before any CLI launches. */
function resolve(ctx: SecondOpinionContext, opts: CommonOptions, needQuorum: boolean): Resolved {
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
}

export interface PreflightResult {
  tier: Tier;
  ok: boolean;
  clis: PreflightEntry[];
  /** On a failing preflight only: the variables withheld from the CLIs, by name. Never values. */
  withheld?: string[];
  lines: string[];
}

export async function preflight(ctx: SecondOpinionContext, opts: CommonOptions): Promise<PreflightResult> {
  const r = resolve(ctx, opts, false);
  const results = await Promise.all(
    r.clis.map(async (cli): Promise<PreflightEntry> => {
      const spec = FLAGS_USED[cli];
      const help = await runCli(cli, spec.helpArgs, '', 30, r.env);
      if (!help.ok) return { cli, ok: false, detail: help.cause ?? 'failed' };
      const helpText = help.stdout + help.stderr;
      const missing = spec.flags.filter((f) => !helpText.includes(f));
      // The ping runs at the tier the run will use. A fixed tier left the other tier's model untested, so a
      // model name agy no longer accepted passed preflight and failed the critique (2026-10-13).
      const inv = buildInvocation(cli, 'say PONG only', r.tier, ctx.source);
      const ping = await runCli(inv.cmd, inv.args, inv.stdin, Math.min(r.timeout, 60), r.env);
      if (!ping.ok) return { cli, ok: false, detail: ping.cause ?? 'failed' };
      const { text } = normalize(cli, ping);
      if (!/pong/i.test(text)) return { cli, ok: false, detail: `unexpected reply: ${firstLines(text, 2)}` };
      if (missing.length) return { cli, ok: false, detail: `answers, but its --help no longer lists: ${missing.join(' ')}` };
      const model = tiers(ctx.source)[r.tier][cli].model;
      return { cli, ok: true, detail: model ? `PONG (${model})` : 'PONG' };
    }),
  );
  const ok = results.every((x) => x.ok);
  const lines = results.map((x) => `[${x.ok ? 'OK  ' : 'DOWN'}] ${x.cli.padEnd(7)} ${x.detail}`);
  if (!ok) {
    lines.push('', 'At least one CLI is down. Re-authenticate it, or run with --only on the ones that are up.');
    // D3: a variable the allowlist dropped may be what a CLI needed. Names only, never values.
    if (r.withheld.length) {
      lines.push(`Withheld from the CLIs: ${r.withheld.join(', ')}. To pass one through, name it in ${PASS_ENV_VARIABLE}.`);
    }
  }
  return { tier: r.tier, ok, clis: results, ...(ok ? {} : { withheld: r.withheld }), lines };
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

function outDir(ctx: SecondOpinionContext, out: string | undefined): string {
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
}

export interface CritiqueEntry {
  letter: string | null;
  role: Role;
  cli: Cli;
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
}

export interface CritiqueResult {
  out: string;
  manifest: CritiqueManifest;
  lines: string[];
}

export async function critique(ctx: SecondOpinionContext, opts: CritiqueOptions): Promise<CritiqueResult> {
  const r = resolve(ctx, opts, true);
  const seed = opts.seed === undefined ? null : Number(opts.seed);
  const plan = await readInput(ctx, opts.planFile, '--plan-file');
  const roles = ROLES.filter((role) => r.clis.includes(ROLE_CLI[role]));
  const dir = outDir(ctx, opts.out);
  ctx.progress(`plan: ${plan.length} characters (about ${Math.ceil(plan.length / 4)} tokens) · tier: ${r.tier} · critics: ${roles.length} · each may take 1-3 minutes`);

  const runs = await Promise.all(
    roles.map(async (role) => {
      const cli = ROLE_CLI[role];
      const prompt = critiquePrompt(role, plan);
      const started = Date.now();
      let raw: CliResult;
      const refused = cli === 'agy' ? tooLong(prompt, `prompt is ${Buffer.byteLength(prompt)} bytes; agy takes it as one argument and the limit is ${MAX_ARGV_BYTES}`) : null;
      if (refused) raw = refused;
      else {
        const inv = buildInvocation(cli, prompt, r.tier, ctx.source);
        raw = await runCli(inv.cmd, inv.args, inv.stdin, r.timeout, r.env);
      }
      writeFileSync(path.join(dir, 'raw', `${role}-${cli}.txt`), `${raw.stdout}\n--- stderr ---\n${raw.stderr}\n`);
      const base = { role, cli, duration_ms: Date.now() - started };
      if (!raw.ok) return { ...base, status: 'failed' as const, cause: raw.cause ?? null, model: null, text: '', verdict: null, findings: 0, veto: false };
      const { text, model } = normalize(cli, raw);
      const judged = judgeCritique(text, plan);
      return { ...base, status: judged.status, cause: judged.cause, model, text, verdict: judged.verdict, findings: judged.findings.length, veto: judged.veto };
    }),
  );

  // Letters go to every critique that produced text (valid or blind), in an order that does not follow the roster.
  const answered = runs.filter((x) => x.status !== 'failed');
  const letters = shuffled(answered, rng(seed)).map((x, i) => ({ ...x, letter: String.fromCharCode(65 + i) }));
  for (const x of letters) writeFileSync(path.join(dir, `critique-${x.letter}.md`), `${x.text}\n`);

  const valid = runs.filter((x) => x.status === 'valid').length;
  const manifest: CritiqueManifest = {
    mode: 'critique',
    tier: r.tier,
    quorum: QUORUM,
    critiques: runs.map((x) => ({
      letter: letters.find((l) => l.role === x.role)?.letter ?? null,
      role: x.role,
      cli: x.cli,
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
  };
  writeFileSync(path.join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  // stdout names letters, never roles or models; a failed critic has no letter and is named by CLI, since that is what to fix.
  const lines = [`out: ${dir}`, `valid: ${valid}  blind: ${runs.filter((x) => x.status === 'blind').length}  failed: ${runs.filter((x) => x.status === 'failed').length}`];
  for (const x of [...letters].sort((a, b) => a.letter.localeCompare(b.letter))) {
    lines.push(`  ${x.letter}  ${x.status}  ${x.verdict ?? '-'}  findings=${x.findings}${x.veto ? '  veto' : ''}`);
  }
  for (const x of runs.filter((y) => y.status === 'failed')) lines.push(`  failed  ${x.cli}  ${x.cause}`);
  if (manifest.partial) lines.push(`PARTIAL: fewer than ${QUORUM} valid critiques. Report this as a partial result, not a consensus.`);
  lines.push(`Read the critique files first; open ${path.join(dir, 'manifest.json')} last.`);
  return { out: dir, manifest, lines };
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
}

export interface PollAnswer {
  cli: Cli;
  status: 'valid' | 'failed';
  cause: string | null;
  model: string | null;
}

export interface PollManifest {
  mode: 'poll';
  tier: Tier;
  lens: string | null;
  quorum: number;
  valid: number;
  partial: boolean;
  answers: PollAnswer[];
}

export interface PollResult {
  out: string;
  manifest: PollManifest;
  lines: string[];
}

export async function poll(ctx: SecondOpinionContext, opts: PollOptions): Promise<PollResult> {
  const r = resolve(ctx, opts, true);
  const question = await readInput(ctx, opts.promptFile, '--prompt-file');
  const prompt = pollPrompt(question, { lens: opts.lens, wrap: opts.wrap !== false });
  const dir = outDir(ctx, opts.out);
  ctx.progress(`question: ${question.length} characters · tier: ${r.tier} · models: ${r.clis.length}${opts.lens ? ` · lenses: ${opts.lens}` : ''}`);

  const runs = await Promise.all(
    r.clis.map(async (cli) => {
      let raw: CliResult;
      const refused = cli === 'agy' ? tooLong(prompt, `prompt exceeds the ${MAX_ARGV_BYTES}-byte argument limit`) : null;
      if (refused) raw = refused;
      else {
        const inv = buildInvocation(cli, prompt, r.tier, ctx.source);
        raw = await runCli(inv.cmd, inv.args, inv.stdin, r.timeout, r.env);
      }
      writeFileSync(path.join(dir, 'raw', `poll-${cli}.txt`), `${raw.stdout}\n--- stderr ---\n${raw.stderr}\n`);
      if (!raw.ok) return { cli, status: 'failed' as const, cause: raw.cause ?? null, model: null, text: '' };
      const { text, model } = normalize(cli, raw);
      if (!text) return { cli, status: 'failed' as const, cause: 'empty output', model, text };
      return { cli, status: 'valid' as const, cause: null, model, text };
    }),
  );

  // A poll is read model against model (the lens grid's columns are models), so files are named by model here.
  for (const x of runs.filter((y) => y.status === 'valid')) writeFileSync(path.join(dir, `poll-${x.cli}.md`), `${x.text}\n`);
  const valid = runs.filter((x) => x.status === 'valid').length;
  const manifest: PollManifest = {
    mode: 'poll',
    tier: r.tier,
    lens: opts.lens ?? null,
    quorum: QUORUM,
    valid,
    partial: valid < QUORUM,
    answers: runs.map(({ text: _text, ...rest }) => rest),
  };
  writeFileSync(path.join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  const lines = [`out: ${dir}`, `valid: ${valid}  failed: ${runs.length - valid}`];
  for (const x of runs) lines.push(`  ${x.cli}  ${x.status}${x.cause ? `  ${x.cause}` : ''}${x.model ? `  model=${x.model}` : ''}`);
  if (manifest.partial) lines.push(`PARTIAL: fewer than ${QUORUM} answers. Report it as a partial result.`);
  return { out: dir, manifest, lines };
}
