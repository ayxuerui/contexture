#!/usr/bin/env node
// ctxr-second-opinion runner — fans a plan (critique) or a question (poll) out to
// three different model families' command-line tools, in parallel, and writes what
// comes back. It owns the mechanics only: launching, containment, timeouts,
// validation, anonymizing. Whether to run it, and how to weigh the answers, is the
// skill's judgment (SKILL.md), never this file's.
//
// Zero dependencies: Node's standard library only. Invoked as `node run.mjs`, so the
// file needs no exec bit.
//
// Usage:
//   node run.mjs --preflight [--only claude,codex]
//   node run.mjs --mode critique --plan-file plan.md [--out DIR] [--tier strong|fast]
//   node run.mjs --mode poll --prompt-file q.txt [--lens minimalist,marketer]
//
// Exit codes:  0  at least two valid results
//              2  a partial result: fewer than two valid (preflight: a CLI is down)
//              1  usage or setup error, nothing was run

import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const QUORUM = 2;
const ALL_CLIS = ['claude', 'codex', 'agy'];
const ROLE_CLI = { architect: 'claude', skeptic: 'codex', pragmatist: 'agy' };
const ROLES = Object.keys(ROLE_CLI);
// Linux caps one argv element at 128 KiB; agy is the only CLI given its prompt as argv.
const MAX_ARGV_BYTES = 120_000;

const env = (name, fallback) => process.env[`CTXR_SECOND_OPINION_${name}`] || fallback;

/**
 * Model choice lives here, in one table. Override by environment, never by editing a store.
 *
 * Effort is each provider's own recommended default, not one this runner picked:
 *  - claude: no --effort at all, so Claude Code applies its own default for the model.
 *  - codex: `medium`, the default its model catalog declares (`default_reasoning_level`). It is passed
 *    explicitly because the flag cannot simply be left off: with no pin in config.toml, codex resolves to
 *    `reasoning effort: none` on a ChatGPT login (seen 2026-10-05), which is no review at all. `low` at the
 *    `fast` tier. A machine that pins its own effort in config.toml is overridden by this; set
 *    CTXR_SECOND_OPINION_CODEX_EFFORT to use another.
 *  - agy: the effort is part of the model name; `(High)` is Gemini's default thinking level.
 * For scale: on one short plan Claude took 35 s at `high` and 514 s at `max`, so a deeper pass is a choice
 * (CTXR_SECOND_OPINION_CLAUDE_EFFORT=max), not something to leave on by default.
 */
function tiers() {
  return {
    strong: {
      claude: { model: env('CLAUDE_MODEL', 'opus'), effort: env('CLAUDE_EFFORT', null) },
      codex: { effort: env('CODEX_EFFORT', 'medium') },
      agy: { model: env('AGY_MODEL', 'Gemini 3.1 Pro (High)') },
    },
    fast: {
      claude: { model: env('CLAUDE_MODEL', 'haiku'), effort: env('CLAUDE_EFFORT', null) },
      codex: { effort: env('CODEX_EFFORT', 'low') },
      agy: { model: env('AGY_MODEL', 'Gemini 3.8 Flash (High)') },
    },
  };
}

/**
 * The flags this runner passes, so preflight can confirm each CLI's --help still lists them. Only flags
 * the help text documents belong here: `claude` still accepts a hidden --max-turns, but with `--tools ""`
 * there is no tool turn to bound, so it is not passed at all. --effort is not listed because it is only
 * passed when the environment asks for one.
 */
const FLAGS_USED = {
  claude: { helpArgs: ['--help'], flags: ['--tools', '--model', '--no-session-persistence', '--disable-slash-commands', '--output-format'] },
  codex: { helpArgs: ['exec', '--help'], flags: ['--skip-git-repo-check', '--sandbox', '--ephemeral', '--color', '--config'] },
  agy: { helpArgs: ['--help'], flags: ['--print', '--sandbox', '--disable-slash-commands', '--model'] },
};

class UsageError extends Error {}

function parseArgs(argv) {
  const opts = { mode: 'critique', tier: 'strong', timeout: 600, only: null, lens: null, out: null, planFile: null, promptFile: null, preflight: false, noWrap: false, seed: null };
  const takesValue = new Set(['--mode', '--tier', '--timeout', '--only', '--lens', '--out', '--plan-file', '--prompt-file', '--seed']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--preflight') opts.preflight = true;
    else if (a === '--no-wrap') opts.noWrap = true;
    else if (takesValue.has(a)) {
      const v = argv[++i];
      if (v === undefined) throw new UsageError(`${a} needs a value`);
      const key = a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      opts[key] = a === '--timeout' || a === '--seed' ? Number(v) : v;
    } else throw new UsageError(`unknown argument: ${a}`);
  }
  if (!['critique', 'poll'].includes(opts.mode)) throw new UsageError('--mode is critique or poll');
  if (!['strong', 'fast'].includes(opts.tier)) throw new UsageError('--tier is strong or fast');
  if (!Number.isFinite(opts.timeout) || opts.timeout <= 0) throw new UsageError('--timeout must be a positive number of seconds');
  return opts;
}

function requestedClis(opts) {
  if (!opts.only) return [...ALL_CLIS];
  const clis = opts.only.split(',').map((c) => c.trim()).filter(Boolean);
  const bad = clis.filter((c) => !ALL_CLIS.includes(c));
  if (bad.length) throw new UsageError(`unknown CLI in --only: ${bad.join(', ')} (valid: ${ALL_CLIS.join(', ')})`);
  return [...new Set(clis)];
}

// ---------------------------------------------------------------------------
// Launching. No shell anywhere: an argv array plus stdin, in an empty scratch directory.
// ---------------------------------------------------------------------------

function childEnv() {
  // Appended, so a CLI already on PATH wins; this only rescues the usual user-install spots.
  const extra = [path.join(homedir(), '.local', 'bin'), path.join(homedir(), '.local', 'share', 'node', 'bin')];
  return { ...process.env, PATH: [process.env.PATH ?? '', ...extra].filter(Boolean).join(path.delimiter) };
}

/** Runs one CLI. Resolves {ok, stdout, stderr, cause}; never rejects. */
function runCli(cmd, args, stdin, timeoutSec) {
  return new Promise((resolve) => {
    const scratch = mkdtempSync(path.join(tmpdir(), 'ctxr-second-opinion-'));
    let settled = false;
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const done = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { rmSync(scratch, { recursive: true, force: true }); } catch { /* best effort */ }
      resolve({ stdout, stderr, ...result });
    };
    let child;
    try {
      child = spawn(cmd, args, { cwd: scratch, env: childEnv(), stdio: ['pipe', 'pipe', 'pipe'], detached: true });
    } catch (err) {
      return done({ ok: false, cause: `could not start ${cmd}: ${err.message}` });
    }
    const killGroup = (signal) => { try { process.kill(-child.pid, signal); } catch { /* already gone */ } };
    const timer = setTimeout(() => {
      timedOut = true;
      killGroup('SIGTERM');
      setTimeout(() => killGroup('SIGKILL'), 2000).unref();
    }, timeoutSec * 1000);
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', (err) => done({ ok: false, cause: err.code === 'ENOENT' ? `'${cmd}' not found on PATH` : `could not start ${cmd}: ${err.message}` }));
    child.on('close', (code) => {
      if (timedOut) return done({ ok: false, cause: `timed out after ${timeoutSec}s` });
      if (code !== 0) return done({ ok: false, cause: `exit ${code}: ${firstLines(stderr || stdout, 3)}` });
      return done({ ok: true });
    });
    child.stdin.on('error', () => { /* the CLI closed stdin early; its exit code says why */ });
    child.stdin.end(stdin ?? '');
  });
}

const firstLines = (text, n) => text.trim().split('\n').slice(0, n).join(' | ').slice(0, 400);

/**
 * How each family is contained. Only claude and codex offer a mode that removes the ability to
 * act; agy does not (its headless plan mode still wrote a file), so it is held to an empty working
 * directory and an untrusted plan should run without it.
 */
function buildInvocation(cli, prompt, tier) {
  const t = tiers()[tier][cli];
  if (cli === 'claude') {
    const args = ['-p', '--tools', '', '--model', t.model, '--no-session-persistence', '--disable-slash-commands', '--output-format', 'json'];
    if (t.effort) args.push('--effort', t.effort);
    return { cmd: 'claude', args, stdin: prompt };
  }
  if (cli === 'codex') {
    const args = ['exec', '--skip-git-repo-check', '--sandbox', 'read-only', '--ephemeral', '--color', 'never'];
    if (t.effort) args.push('-c', `model_reasoning_effort=${t.effort}`);
    args.push('-');
    return { cmd: 'codex', args, stdin: prompt };
  }
  return { cmd: 'agy', args: ['-p', prompt, '--sandbox', '--disable-slash-commands', '--model', t.model], stdin: '' };
}

/** Normalizes a CLI's raw output to answer text plus the model it says it ran. */
function normalize(cli, raw) {
  if (cli === 'claude') {
    try {
      const j = JSON.parse(raw.stdout);
      const models = Object.keys(j.modelUsage ?? {});
      return { text: String(j.result ?? '').trim(), model: models.length ? models.join(', ') : null };
    } catch {
      return { text: raw.stdout.trim(), model: null };
    }
  }
  if (cli === 'codex') {
    const model = /^model:\s*(.+)$/m.exec(raw.stdout + '\n' + raw.stderr)?.[1]?.trim() ?? null;
    return { text: stripCodexNoise(raw.stdout), model };
  }
  return { text: raw.stdout.trim(), model: null };
}

/**
 * Codex wraps its answer in a session banner and repeats it after a `tokens used` trailer.
 * The answer starts at the first line of the required shape; failing that, the trailer is cut and
 * everything else is kept, so real content is never eaten.
 */
function stripCodexNoise(text) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => /^## (Role|Verdict):/.test(l));
  let body = start >= 0 ? lines.slice(start) : lines;
  const trailer = body.findIndex((l) => /^tokens used\b/i.test(l.trim()));
  if (trailer >= 0) body = body.slice(0, trailer);
  return body.join('\n').trim();
}

// ---------------------------------------------------------------------------
// Critique validation.
// ---------------------------------------------------------------------------

const normalizeWs = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();

/** Step ids a plan numbers as S1, S2, ... at the start of a line, list item, or heading. */
export function planStepIds(plan) {
  const ids = new Set();
  for (const m of plan.matchAll(/^[ \t]*(?:[-*][ \t]+|#{1,6}[ \t]+)?\**S(\d+)\b/gm)) ids.add(`S${m[1]}`);
  return ids;
}

export function parseCritique(text) {
  const verdict = /^## Verdict:\s*(APPROVE_WITH_CHANGES|APPROVE|REJECT)\b/m.exec(text)?.[1] ?? null;
  const findings = [];
  const blocks = text.split(/^### F\d+\b/m).slice(1);
  for (const block of blocks) {
    // Brackets around the severity are what the contract asks for, and models drop them: accept both.
    const head = /^\s*\[?(critical|major|minor)\]?\s*(?:confidence\s*[=:]\s*([01](?:\.\d+)?))?/i.exec(block);
    const evidence = /^Evidence:\s*(.+)$/im.exec(block)?.[1] ?? '';
    findings.push({
      severity: head?.[1]?.toLowerCase() ?? null,
      confidence: head?.[2] !== undefined ? Number(head[2]) : null,
      evidence,
    });
  }
  return { verdict, findings };
}

/** True if a finding's evidence points at something the plan actually contains. */
export function evidenceResolves(evidence, plan, stepIds) {
  for (const m of evidence.matchAll(/\bS(\d+)\b/g)) if (stepIds.has(`S${m[1]}`)) return true;
  const haystack = normalizeWs(plan);
  for (const m of evidence.matchAll(/["“`]([^"”`]{12,})["”`]/g)) if (haystack.includes(normalizeWs(m[1]))) return true;
  for (const m of evidence.matchAll(/([\w./-]+\.[a-z]{1,6}):\d+/gi)) if (plan.includes(m[1])) return true;
  return false;
}

/** valid | blind | failed, with the cause when failed. */
export function judgeCritique(text, plan) {
  if (!text) return { status: 'failed', cause: 'empty output', verdict: null, findings: [], veto: false };
  const { verdict, findings } = parseCritique(text);
  if (!verdict) return { status: 'failed', cause: 'output has no "## Verdict:" line', verdict, findings, veto: false };
  if (verdict !== 'APPROVE' && findings.length === 0) return { status: 'failed', cause: `${verdict} with no parseable findings`, verdict, findings, veto: false };
  const stepIds = planStepIds(plan);
  const resolved = findings.filter((f) => evidenceResolves(f.evidence, plan, stepIds));
  // An APPROVE with no findings has nothing to cite and is valid. Findings that exist but resolve to
  // nothing in the plan mean the critic answered without reading it.
  const blind = findings.length > 0 && resolved.length === 0;
  const veto = verdict === 'REJECT' && findings.some((f) => f.severity === 'critical' && resolved.includes(f));
  return { status: blind ? 'blind' : 'valid', cause: blind ? 'no finding cites anything in the plan' : null, verdict, findings, veto };
}

// ---------------------------------------------------------------------------
// Prompts.
// ---------------------------------------------------------------------------

const read = (...p) => readFileSync(path.join(HERE, ...p), 'utf8');

function critiquePrompt(role, plan) {
  return `${read('critic-contract.md').trimEnd()}\n\n---\n${read('personas', `${role}.md`).trimEnd()}\n\nPLAN:\n${plan}\n`;
}

function loadLensRoster() {
  const roster = new Map();
  for (const m of read('lenses.md').matchAll(/^- \*\*([a-z-]+)\*\* — (.+)$/gm)) roster.set(m[1], m[2].trim());
  return roster;
}

/**
 * Splits `--lens` into one string per lens. Lenses are comma-separated, but an inline description may itself
 * contain commas: a fragment starts a NEW lens only when it is exactly a roster name or begins `Name:`;
 * any other fragment continues the lens before it. So `minimalist,House taste:blunt, anti-slogan` is two
 * lenses, and a description must not contain a colon (that would read as the start of another lens).
 */
export function splitLenses(spec, roster) {
  const lenses = [];
  for (const fragment of spec.split(',').map((f) => f.trim()).filter(Boolean)) {
    const startsLens = roster.has(fragment.toLowerCase()) || /^[^:,]{1,40}:/.test(fragment);
    if (startsLens || lenses.length === 0) lenses.push(fragment);
    else lenses[lenses.length - 1] += `, ${fragment}`;
  }
  return lenses;
}

function lensBlock(spec) {
  const roster = loadLensRoster();
  const described = [];
  for (const s of splitLenses(spec, roster)) {
    if (roster.has(s.toLowerCase())) described.push(`- ${s.toLowerCase()} — ${roster.get(s.toLowerCase())}`);
    else if (/^[^:,]{1,40}:/.test(s)) {
      const [name, ...rest] = s.split(':');
      described.push(`- ${name.trim()} — ${rest.join(':').trim()}`);
    } else throw new UsageError(`unknown lens "${s}" (known: ${[...roster.keys()].join(', ')}; or pass "Name:description")`);
  }
  if (described.length < 2 || described.length > 3) throw new UsageError('--lens takes two or three lenses; keep them orthogonal');
  return described.join('\n');
}

const POLL_TAIL = `

Please answer:
1. Your pick or ranking
2. Two or three reasons
3. Anything surprising about this choice
4. What you would recommend instead, if anything

Be direct and brief: about 200 to 300 words.`;

function pollPrompt(question, opts) {
  if (opts.lens) {
    return `You are running a taste panel. Answer the question below once as EACH lens. Reason only from that lens's values; do not blend them. A lens judges which option is better, never whether it will work.

Lenses:
${lensBlock(opts.lens)}

QUESTION:
${question}

For EACH lens output exactly:
PICK: <option>
WHY: <two sentences, that lens's values only>
REJECT: <the option this lens most dislikes, and a four-word reason>

Only the lens blocks. No preamble, no summary.
`;
  }
  return opts.noWrap ? question : question + POLL_TAIL;
}

// ---------------------------------------------------------------------------
// Anonymizing.
// ---------------------------------------------------------------------------

function rng(seed) {
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

function shuffled(items, random) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------------------------------------------------------------------
// Modes.
// ---------------------------------------------------------------------------

async function preflight(clis, opts) {
  let allUp = true;
  const results = await Promise.all(
    clis.map(async (cli) => {
      const spec = FLAGS_USED[cli];
      const help = await runCli(cli, spec.helpArgs, '', 30);
      if (!help.ok) return { cli, ok: false, detail: help.cause };
      const helpText = help.stdout + help.stderr;
      const missing = spec.flags.filter((f) => !helpText.includes(f));
      const inv = buildInvocation(cli, 'say PONG only', 'fast');
      const ping = await runCli(inv.cmd, inv.args, inv.stdin, Math.min(opts.timeout, 60));
      if (!ping.ok) return { cli, ok: false, detail: ping.cause };
      const { text } = normalize(cli, ping);
      if (!/pong/i.test(text)) return { cli, ok: false, detail: `unexpected reply: ${firstLines(text, 2)}` };
      if (missing.length) return { cli, ok: false, detail: `answers, but its --help no longer lists: ${missing.join(' ')}` };
      return { cli, ok: true, detail: 'PONG' };
    }),
  );
  for (const r of results) {
    if (!r.ok) allUp = false;
    console.log(`[${r.ok ? 'OK  ' : 'DOWN'}] ${r.cli.padEnd(7)} ${r.detail}`);
  }
  if (!allUp) console.log('\nAt least one CLI is down. Re-authenticate it, or run with --only on the ones that are up.');
  return allUp ? 0 : 2;
}

function readInput(opts, flag) {
  const file = flag === 'plan' ? opts.planFile : opts.promptFile;
  if (file) {
    try { return readFileSync(file, 'utf8'); } catch (err) { throw new UsageError(`cannot read ${file}: ${err.message}`); }
  }
  if (!process.stdin.isTTY) {
    const text = readFileSync(0, 'utf8');
    if (text.trim()) return text;
  }
  throw new UsageError(`no input: pass --${flag === 'plan' ? 'plan' : 'prompt'}-file PATH or pipe it on stdin`);
}

function outDir(opts) {
  const dir = opts.out ?? mkdtempSync(path.join(tmpdir(), 'ctxr-second-opinion-out-'));
  mkdirSync(path.join(dir, 'raw'), { recursive: true });
  return dir;
}

async function runCritique(opts, clis) {
  const plan = readInput(opts, 'plan');
  const roles = ROLES.filter((r) => clis.includes(ROLE_CLI[r]));
  const dir = outDir(opts);
  console.error(`plan: ${plan.length} characters (about ${Math.ceil(plan.length / 4)} tokens) · tier: ${opts.tier} · critics: ${roles.length} · each may take 1-3 minutes`);

  const runs = await Promise.all(
    roles.map(async (role) => {
      const cli = ROLE_CLI[role];
      const prompt = critiquePrompt(role, plan);
      const started = Date.now();
      let raw;
      if (cli === 'agy' && Buffer.byteLength(prompt) > MAX_ARGV_BYTES) {
        raw = { ok: false, stdout: '', stderr: '', cause: `prompt is ${Buffer.byteLength(prompt)} bytes; agy takes it as one argument and the limit is ${MAX_ARGV_BYTES}` };
      } else {
        const inv = buildInvocation(cli, prompt, opts.tier);
        raw = await runCli(inv.cmd, inv.args, inv.stdin, opts.timeout);
      }
      writeFileSync(path.join(dir, 'raw', `${role}-${cli}.txt`), `${raw.stdout}\n--- stderr ---\n${raw.stderr}\n`);
      const base = { role, cli, duration_ms: Date.now() - started };
      if (!raw.ok) return { ...base, status: 'failed', cause: raw.cause, model: null, text: '', verdict: null, findings: 0, veto: false };
      const { text, model } = normalize(cli, raw);
      const judged = judgeCritique(text, plan);
      return { ...base, status: judged.status, cause: judged.cause, model, text, verdict: judged.verdict, findings: judged.findings.length, veto: judged.veto };
    }),
  );

  // Letters go to every critique that produced text (valid or blind), in an order that does not follow the roster.
  const answered = runs.filter((r) => r.status !== 'failed');
  const letters = shuffled(answered, rng(opts.seed)).map((r, i) => ({ ...r, letter: String.fromCharCode(65 + i) }));
  for (const r of letters) writeFileSync(path.join(dir, `critique-${r.letter}.md`), `${r.text}\n`);

  const manifest = {
    mode: 'critique',
    tier: opts.tier,
    quorum: QUORUM,
    critiques: runs.map((r) => ({
      letter: letters.find((l) => l.role === r.role)?.letter ?? null,
      role: r.role,
      cli: r.cli,
      model_reported: r.model,
      status: r.status,
      cause: r.cause,
      verdict: r.verdict,
      findings: r.findings,
      veto: r.veto,
      duration_ms: r.duration_ms,
    })),
  };
  const valid = runs.filter((r) => r.status === 'valid').length;
  manifest.valid = valid;
  manifest.partial = valid < QUORUM;
  writeFileSync(path.join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  // stdout names letters, never roles or models; a failed critic has no letter and is named by CLI, since that is what to fix.
  console.log(`out: ${dir}`);
  console.log(`valid: ${valid}  blind: ${runs.filter((r) => r.status === 'blind').length}  failed: ${runs.filter((r) => r.status === 'failed').length}`);
  for (const r of [...letters].sort((a, b) => a.letter.localeCompare(b.letter))) {
    console.log(`  ${r.letter}  ${r.status}  ${r.verdict ?? '-'}  findings=${r.findings}${r.veto ? '  veto' : ''}`);
  }
  for (const r of runs.filter((x) => x.status === 'failed')) console.log(`  failed  ${r.cli}  ${r.cause}`);
  if (manifest.partial) console.log(`PARTIAL: fewer than ${QUORUM} valid critiques. Report this as a partial result, not a consensus.`);
  console.log(`Read the critique files first; open ${path.join(dir, 'manifest.json')} last.`);
  return manifest.partial ? 2 : 0;
}

async function runPoll(opts, clis) {
  const question = readInput(opts, 'prompt');
  const prompt = pollPrompt(question, opts);
  const dir = outDir(opts);
  console.error(`question: ${question.length} characters · tier: ${opts.tier} · models: ${clis.length}${opts.lens ? ` · lenses: ${opts.lens}` : ''}`);
  const runs = await Promise.all(
    clis.map(async (cli) => {
      let raw;
      if (cli === 'agy' && Buffer.byteLength(prompt) > MAX_ARGV_BYTES) raw = { ok: false, stdout: '', stderr: '', cause: `prompt exceeds the ${MAX_ARGV_BYTES}-byte argument limit` };
      else {
        const inv = buildInvocation(cli, prompt, opts.tier);
        raw = await runCli(inv.cmd, inv.args, inv.stdin, opts.timeout);
      }
      writeFileSync(path.join(dir, 'raw', `poll-${cli}.txt`), `${raw.stdout}\n--- stderr ---\n${raw.stderr}\n`);
      if (!raw.ok) return { cli, status: 'failed', cause: raw.cause, model: null, text: '' };
      const { text, model } = normalize(cli, raw);
      if (!text) return { cli, status: 'failed', cause: 'empty output', model, text };
      return { cli, status: 'valid', cause: null, model, text };
    }),
  );
  // A poll is read model against model (the lens grid's columns are models), so files are named by model here.
  for (const r of runs.filter((x) => x.status === 'valid')) writeFileSync(path.join(dir, `poll-${r.cli}.md`), `${r.text}\n`);
  const valid = runs.filter((r) => r.status === 'valid').length;
  const manifest = { mode: 'poll', tier: opts.tier, lens: opts.lens, quorum: QUORUM, valid, partial: valid < QUORUM, answers: runs.map(({ text: _t, ...rest }) => rest) };
  writeFileSync(path.join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`out: ${dir}`);
  console.log(`valid: ${valid}  failed: ${runs.length - valid}`);
  for (const r of runs) console.log(`  ${r.cli}  ${r.status}${r.cause ? `  ${r.cause}` : ''}${r.model ? `  model=${r.model}` : ''}`);
  if (manifest.partial) console.log(`PARTIAL: fewer than ${QUORUM} answers. Report it as a partial result.`);
  return manifest.partial ? 2 : 0;
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
    const clis = requestedClis(opts);
    if (opts.preflight) return await preflight(clis, opts);
    if (clis.length < QUORUM) throw new UsageError(`--only names ${clis.length} CLI; a second opinion needs at least ${QUORUM}`);
    return opts.mode === 'critique' ? await runCritique(opts, clis) : await runPoll(opts, clis);
  } catch (err) {
    if (!(err instanceof UsageError)) throw err;
    console.error(`run.mjs: ${err.message}`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
