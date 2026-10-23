import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ExitCode } from '../../src/core/exit-codes.js';
import { DIST_BIN } from '../helpers/dist-bin.js';
import { makeTmpDir, type TmpDir } from '../helpers/tmp-store.js';

/**
 * run-the-second-opinion-from-the-cli, harness-portability requirements "The
 * second-opinion skill is an owned skill over external model CLIs" and "No
 * secret in the environment reaches a model CLI", and the cli-contract
 * requirement "`ctxr second-opinion` reports through the shared exit codes".
 *
 * Every stub-CLI scenario the skill's `run.mjs` was tested with, ported to
 * the command (Revisions after critique 2): stub `claude` / `codex` / `agy`
 * executables placed first on PATH, and the built binary spawned as a
 * subprocess, exactly as a skill or a harness runs it. The stubs read their
 * script from `CTXR_SECOND_OPINION_STUB_*` variables because that prefix is
 * on the allowlist (D3): nothing else would reach them.
 */
const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');

/** The stub every CLI name points at: records what it was given, then behaves as scripted. */
const STUB = `#!/usr/bin/env node
const fs = require('node:fs');
const name = require('node:path').basename(process.argv[1]);
const dir = process.env.CTXR_SECOND_OPINION_STUB_DIR;
const args = process.argv.slice(2);
const behavior = JSON.parse(process.env['CTXR_SECOND_OPINION_STUB_' + name.toUpperCase()] || '{"kind":"ok","text":"PONG"}');
const isHelp = args.includes('--help');
let stdin = '';
if (!isHelp && behavior.kind !== 'hang') { try { stdin = fs.readFileSync(0, 'utf8'); } catch {} }
if (!isHelp) {
  const file = dir + '/' + name + '.json';
  const prior = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
  prior.push({ args, stdin, cwd: process.cwd(), ppid: process.ppid, env: process.env });
  fs.writeFileSync(file, JSON.stringify(prior));
}
if (isHelp) { console.log(behavior.help ?? '--tools --model --effort --no-session-persistence --disable-slash-commands --output-format --skip-git-repo-check --sandbox --ephemeral --color --config --print'); process.exit(0); }
if (behavior.kind === 'exit') { console.error(behavior.stderr ?? 'boom'); process.exit(behavior.code ?? 1); }
if (behavior.kind === 'hang') { setInterval(() => {}, 1000); return; }
const text = behavior.text;
if (name === 'claude') console.log(JSON.stringify({ result: text, modelUsage: { 'claude-stub-1': {} } }));
else if (name === 'codex') console.log('OpenAI Codex v0\\n--------\\nmodel: gpt-stub\\nsandbox: read-only\\n--------\\nuser\\n(prompt echo)\\ncodex\\n' + text + '\\ntokens used\\n42\\n' + text);
else console.log(text);
`;

const PLAN = '# Plan: rename the thing\n\n## Steps\nS1. Rename the module and update its callers.\nS2. Delete the old module once nothing imports it.\n\n## Reversibility\nIrreversible: S2.\n';

function critique(role: string, evidence = 'S1', verdict = 'APPROVE_WITH_CHANGES', severity = 'major'): string {
  return `## Role: ${role}\n\n## Verdict: ${verdict}\n\n## Findings\n\n### F1 [${severity}] confidence=0.7\nEvidence: ${evidence}\nIssue: ${role} marker MARK-${role}.\nChange: reword S1.\n\n## Suggested changes\n- reword\n\n## What you would NOT change\n- S2\n`;
}

const ROLE_OF: Record<string, string> = { claude: 'architect', codex: 'skeptic', agy: 'pragmatist' };
const PONG = { claude: { kind: 'ok', text: 'PONG' }, codex: { kind: 'ok', text: 'PONG' }, agy: { kind: 'ok', text: 'PONG' } } as const;

let tmp: TmpDir;
let binDir: string;
let logDir: string;
let outDir: string;

beforeEach(async () => {
  tmp = await makeTmpDir('second-opinion-');
  binDir = path.join(tmp.root, 'bin');
  logDir = path.join(tmp.root, 'log');
  outDir = path.join(tmp.root, 'out');
  mkdirSync(binDir);
  mkdirSync(logDir);
  for (const name of ['claude', 'codex', 'agy']) {
    const file = path.join(binDir, name);
    writeFileSync(file, STUB.replace(/^#!.*\n/, '#!/usr/bin/env node\n"use strict";(function(){\n') + '\n})();\n');
    chmodSync(file, 0o755);
  }
});
afterEach(async () => {
  await tmp.cleanup();
});

type Behavior = Record<string, unknown>;

/** `ctxr second-opinion <args>` against the stubs. Usage errors print on stdout, as every ctxr command's do. */
function run(args: string[], behaviors: Record<string, Behavior> = {}, opts: { input?: string; env?: Record<string, string> } = {}) {
  // HOME points at the temp dir so the ~/.local/bin PATH fallback can never reach a real CLI.
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: tmp.root, PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}`, CTXR_SECOND_OPINION_STUB_DIR: logDir };
  for (const cli of ['claude', 'codex', 'agy']) {
    env[`CTXR_SECOND_OPINION_STUB_${cli.toUpperCase()}`] = JSON.stringify(behaviors[cli] ?? { kind: 'ok', text: critique(ROLE_OF[cli]!) });
  }
  const result = spawnSync(process.execPath, [DIST_BIN, 'second-opinion', ...args], { cwd: tmp.root, env: { ...env, ...opts.env }, encoding: 'utf8', input: opts.input ?? '' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, output: result.stdout + result.stderr, pid: result.pid };
}

function planFile(text = PLAN): string {
  const file = path.join(tmp.root, 'plan.md');
  writeFileSync(file, text);
  return file;
}

interface Call {
  args: string[];
  stdin: string;
  cwd: string;
  ppid: number;
  env: Record<string, string>;
}
const calls = (cli: string): Call[] => {
  const file = path.join(logDir, `${cli}.json`);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
};
const allCalls = (): Call[] => ['claude', 'codex', 'agy'].flatMap(calls);
const manifest = () => JSON.parse(readFileSync(path.join(outDir, 'manifest.json'), 'utf8'));
const critiqueArgs = (extra: string[] = []) => ['critique', '--plan-file', planFile(), '--out', outDir, ...extra];

function sourceFilesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? sourceFilesUnder(path.join(dir, e.name)) : e.name.endsWith('.ts') ? [path.join(dir, e.name)] : []));
}

describe('critique: isolation and delivery', () => {
  it('critics never see each other: each receives the plan and exactly one role', () => {
    const r = run(critiqueArgs());
    expect(r.status).toBe(ExitCode.Ok);
    const inputs: Record<string, string> = {
      claude: calls('claude')[0]!.stdin,
      codex: calls('codex')[0]!.stdin,
      agy: calls('agy')[0]!.args[calls('agy')[0]!.args.indexOf('-p') + 1]!,
    };
    for (const [cli, input] of Object.entries(inputs)) {
      expect(input, cli).toContain(PLAN);
      for (const [other, role] of Object.entries(ROLE_OF)) {
        if (other === cli) expect(input, `${cli} has its own role`).toContain(`\n## ${role}\n`);
        else expect(input, `${cli} must not carry ${role}`).not.toContain(`\n## ${role}\n`);
        if (other !== cli) expect(input, `${cli} saw ${other}'s output`).not.toContain(`MARK-${role}`);
      }
    }
  });

  it('passes a large plan full of shell metacharacters byte-identical, with no shell in the path', () => {
    const nasty = '$(touch /tmp/second-opinion-canary) ; `id` "dq" \'sq\' \\ && || > /dev/null *\n';
    const plan = `${PLAN}\n${nasty.repeat(400)}`;
    expect(plan.length).toBeGreaterThan(20_000);
    const big = run(['critique', '--plan-file', planFile(plan), '--out', path.join(tmp.root, 'out2')]);
    expect(big.status).toBe(ExitCode.Ok);
    const claude = calls('claude').at(-1)!;
    const codex = calls('codex').at(-1)!;
    const agy = calls('agy').at(-1)!;
    expect(claude.stdin.endsWith(`PLAN:\n${plan}\n`)).toBe(true);
    expect(codex.stdin.endsWith(`PLAN:\n${plan}\n`)).toBe(true);
    expect(agy.args[agy.args.indexOf('-p') + 1]!.endsWith(`PLAN:\n${plan}\n`)).toBe(true);
    // Each CLI's parent is the ctxr process itself: nothing, least of all a shell, sits between them.
    for (const c of [claude, codex, agy]) expect(c.ppid).toBe(big.pid);
    expect(existsSync('/tmp/second-opinion-canary')).toBe(false);
  });

  it('reads the plan from stdin when no --plan-file is given', () => {
    const r = run(['critique', '--out', outDir], {}, { input: PLAN });
    expect(r.status).toBe(ExitCode.Ok);
    expect(calls('claude')[0]!.stdin.endsWith(`PLAN:\n${PLAN}\n`)).toBe(true);
  });

  it('the command source spawns no shell', () => {
    const files = [...sourceFilesUnder(path.join(SRC, 'core/second-opinion')), path.join(SRC, 'commands/second-opinion.ts')];
    expect(files.length).toBeGreaterThan(3); // anti-vacuity
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).not.toMatch(/shell\s*:\s*true/);
      expect(source, file).not.toMatch(/['"`]sh['"`]|['"`]bash['"`]/);
      // The only child_process import is `spawn`; exec/execSync/execFile all go through a shell or hide argv.
      for (const m of source.matchAll(/import \{([^}]*)\} from 'node:child_process'/g)) expect(m[1]!.trim(), file).toBe('spawn');
    }
  });

  it('runs every CLI in an empty scratch directory, read-only or tool-less where the CLI offers it', () => {
    run(critiqueArgs());
    const claude = calls('claude')[0]!;
    const codex = calls('codex')[0]!;
    const agy = calls('agy')[0]!;
    for (const c of [claude, codex, agy]) {
      expect(c.cwd).not.toBe(tmp.root);
      expect(c.cwd).toMatch(/ctxr-second-opinion-/);
    }
    expect(claude.args).toEqual(expect.arrayContaining(['--tools', '', '--no-session-persistence']));
    expect(claude.args).not.toContain('--max-turns'); // hidden from --help, and moot with no tools
    expect(codex.args).toEqual(expect.arrayContaining(['--sandbox', 'read-only', '--ephemeral', '--skip-git-repo-check']));
    expect(agy.args).toEqual(expect.arrayContaining(['--sandbox', '--disable-slash-commands']));
  });
});

describe('critique: model and effort defaults', () => {
  const effortOf = (args: string[]) => args[args.indexOf('--effort') + 1];
  const codexEffort = (args: string[]) => args.find((a) => a.startsWith('model_reasoning_effort='));

  it('lets claude apply its own recommended default: no --effort unless the environment asks for one', () => {
    run(critiqueArgs());
    expect(calls('claude')[0]!.args).not.toContain('--effort');
    run(['critique', '--plan-file', planFile(), '--out', path.join(tmp.root, 'deep')], {}, { env: { CTXR_SECOND_OPINION_CLAUDE_EFFORT: 'max' } });
    expect(effortOf(calls('claude')[1]!.args)).toBe('max');
  });

  it('passes codex its catalog default, low, explicitly, because leaving it off can resolve to no reasoning', () => {
    run(critiqueArgs());
    expect(codexEffort(calls('codex')[0]!.args)).toBe('model_reasoning_effort=low');
    run(['critique', '--plan-file', planFile(), '--out', path.join(tmp.root, 'deep')], {}, { env: { CTXR_SECOND_OPINION_CODEX_EFFORT: 'xhigh' } });
    expect(codexEffort(calls('codex')[1]!.args)).toBe('model_reasoning_effort=xhigh');
  });

  it("at the default tier: each family's frontier model — fable and gpt-6-astra", () => {
    run(critiqueArgs());
    const claude = calls('claude')[0]!.args;
    expect(claude[claude.indexOf('--model') + 1]).toBe('fable');
    const codex = calls('codex')[0]!.args;
    expect(codex[codex.indexOf('--model') + 1]).toBe('gpt-6-astra');
  });

  it('takes the codex model from the environment', () => {
    run(critiqueArgs(), {}, { env: { CTXR_SECOND_OPINION_CODEX_MODEL: 'gpt-6-sol' } });
    const codex = calls('codex')[0]!.args;
    expect(codex[codex.indexOf('--model') + 1]).toBe('gpt-6-sol');
  });

  it("keeps gemini's effort in the model name: Argon at its default, Medium", () => {
    run(critiqueArgs());
    const args = calls('agy')[0]!.args;
    expect(args[args.indexOf('--model') + 1]).toBe('Gemini 4 Argon (Medium)');
  });

  it("at the fast tier: each family's workhorse at its default effort — opus with none passed, gpt-6.1-sol at low, flash at high", () => {
    run(critiqueArgs(['--tier', 'fast']));
    const claude = calls('claude')[0]!.args;
    expect(claude).not.toContain('--effort');
    expect(claude[claude.indexOf('--model') + 1]).toBe('opus');
    const codex = calls('codex')[0]!.args;
    expect(codex[codex.indexOf('--model') + 1]).toBe('gpt-6.1-sol');
    expect(codexEffort(codex)).toBe('model_reasoning_effort=low');
    const agy = calls('agy')[0]!.args;
    expect(agy[agy.indexOf('--model') + 1]).toBe('Gemini 3.8 Flash (High)');
  });

  it("does not require --effort in claude's help, since it is only passed on request", () => {
    const noEffort = '--tools --model --no-session-persistence --disable-slash-commands --output-format --skip-git-repo-check --sandbox --ephemeral --color --config --print';
    const r = run(['preflight'], { ...PONG, claude: { kind: 'ok', text: 'PONG', help: noEffort } });
    expect(r.status).toBe(ExitCode.Ok);
  });
});

describe('critique: anonymizing and the manifest', () => {
  it('names files by letter, keeps roles and models out of stdout, and maps letters only in the manifest', () => {
    const r = run(critiqueArgs(['--seed', '3']));
    expect(r.status).toBe(ExitCode.Ok);
    expect(readdirSync(outDir).filter((f) => f.startsWith('critique-')).sort()).toEqual(['critique-A.md', 'critique-B.md', 'critique-C.md']);
    expect(r.stdout).not.toMatch(/architect|skeptic|pragmatist|claude|codex|agy|gpt-stub/);
    const m = manifest();
    expect(m.critiques).toHaveLength(3);
    for (const c of m.critiques) {
      const text = readFileSync(path.join(outDir, `critique-${c.letter}.md`), 'utf8');
      expect(text).toContain(`## Role: ${c.role}`);
      expect(c.role).toBe(ROLE_OF[c.cli]);
    }
    const models = Object.fromEntries(m.critiques.map((c: { cli: string; model_reported: string | null }) => [c.cli, c.model_reported]));
    expect(models).toEqual({ claude: 'claude-stub-1', codex: 'gpt-stub', agy: null });
  });

  it('assigns letters independent of the roster order, and reproducibly for one seed', () => {
    const mapping = (seed: number, dir: string) => {
      run(['critique', '--plan-file', planFile(), '--out', dir, '--seed', String(seed)]);
      return JSON.stringify(JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8')).critiques.map((c: { role: string; letter: string }) => `${c.role}=${c.letter}`));
    };
    const seen = new Set<string>();
    for (let seed = 1; seed <= 8; seed++) seen.add(mapping(seed, path.join(tmp.root, `o${seed}`)));
    expect(seen.size).toBeGreaterThan(1);
    expect(mapping(5, path.join(tmp.root, 'r1'))).toBe(mapping(5, path.join(tmp.root, 'r2')));
  }, 60_000);

  it('strips the codex banner and trailer, and keeps the raw output beside it', () => {
    run(critiqueArgs());
    const m = manifest();
    const codexEntry = m.critiques.find((c: { cli: string }) => c.cli === 'codex');
    const stripped = readFileSync(path.join(outDir, `critique-${codexEntry.letter}.md`), 'utf8');
    expect(stripped.startsWith('## Role: skeptic')).toBe(true);
    expect(stripped).not.toMatch(/tokens used|OpenAI Codex|prompt echo/);
    expect(readFileSync(path.join(outDir, 'raw', 'skeptic-codex.txt'), 'utf8')).toMatch(/tokens used/);
  });

  it('--json carries the manifest in the standard envelope, and stdout holds nothing else', () => {
    const r = run([...critiqueArgs(['--seed', '3']), '--json']);
    expect(r.status).toBe(ExitCode.Ok);
    const envelope = JSON.parse(r.stdout);
    expect(envelope).toMatchObject({ envelope_version: 1, command: 'second-opinion.critique', status: 'ok', exit_code: 0 });
    expect(envelope.data.out).toBe(outDir);
    expect(envelope.data.manifest).toEqual(manifest());
  });
});

describe('critique: failure, blindness, quorum', () => {
  it('records a non-zero exit and a timeout as failed with their causes, and substitutes no other model', () => {
    const r = run(critiqueArgs(['--timeout', '2']), { codex: { kind: 'exit', code: 3, stderr: 'auth expired' }, agy: { kind: 'hang' } });
    expect(r.status).toBe(ExitCode.CheckFailed);
    const byCli = Object.fromEntries(manifest().critiques.map((c: { cli: string }) => [c.cli, c]));
    expect(byCli.codex).toMatchObject({ status: 'failed', letter: null });
    expect(byCli.codex.cause).toMatch(/exit 3.*auth expired/);
    expect(byCli.agy).toMatchObject({ status: 'failed', letter: null });
    expect(byCli.agy.cause).toMatch(/timed out after 2s/);
    expect(calls('claude')).toHaveLength(1);
    expect(calls('codex')).toHaveLength(1);
    expect(calls('agy')).toHaveLength(1);
    expect(r.stdout).toMatch(/failed\s+codex\s+exit 3/);
    expect(r.stdout).toMatch(/PARTIAL/);
  });

  it('a missing CLI is a failed critic, not a crash', () => {
    const r = spawnSync(process.execPath, [DIST_BIN, 'second-opinion', ...critiqueArgs()], {
      cwd: tmp.root,
      env: { ...process.env, HOME: tmp.root, PATH: '/nonexistent' },
      encoding: 'utf8',
      input: '',
    });
    expect(r.status).toBe(ExitCode.CheckFailed);
    expect(manifest().critiques.every((c: { status: string; cause: string }) => c.status === 'failed' && /not found on PATH/.test(c.cause))).toBe(true);
  });

  it('marks a well-formed verdict whose findings cite nothing in the plan as blind, and does not count it', () => {
    const r = run(critiqueArgs(), { agy: { kind: 'ok', text: critique('pragmatist', 'S9 and "a sentence the plan never contained"') } });
    expect(r.status).toBe(ExitCode.Ok); // two valid critiques still meet the quorum
    const m = manifest();
    expect(m.critiques.find((c: { cli: string }) => c.cli === 'agy')).toMatchObject({ status: 'blind' });
    expect(m.valid).toBe(2);
    expect(r.stdout).toMatch(/blind: 1/);
  });

  it('accepts a verbatim quotation from the plan as evidence', () => {
    run(critiqueArgs(), { agy: { kind: 'ok', text: critique('pragmatist', '"Delete the old module once nothing imports it"') } });
    expect(manifest().critiques.find((c: { cli: string }) => c.cli === 'agy').status).toBe('valid');
  });

  it('an APPROVE with no findings is valid, not blind', () => {
    const approve = '## Role: pragmatist\n\n## Verdict: APPROVE\n\n## Findings\nNone. The plan is minimal.\n\n## Suggested changes\n- None.\n\n## What you would NOT change\n- S1\n';
    run(critiqueArgs(), { agy: { kind: 'ok', text: approve } });
    expect(manifest().critiques.find((c: { cli: string }) => c.cli === 'agy')).toMatchObject({ status: 'valid', verdict: 'APPROVE', findings: 0 });
  });

  it('a verdict of REJECT or APPROVE_WITH_CHANGES with no parseable findings is failed', () => {
    const empty = '## Role: pragmatist\n\n## Verdict: REJECT\n\nThis is bad.\n';
    run(critiqueArgs(), { agy: { kind: 'ok', text: empty } });
    expect(manifest().critiques.find((c: { cli: string }) => c.cli === 'agy')).toMatchObject({ status: 'failed' });
  });

  it('output with no verdict line is failed', () => {
    run(critiqueArgs(), { agy: { kind: 'ok', text: 'Looks fine to me.' } });
    const agy = manifest().critiques.find((c: { cli: string }) => c.cli === 'agy');
    expect(agy.status).toBe('failed');
    expect(agy.cause).toMatch(/Verdict/);
  });

  it('flags a REJECT carrying a resolved critical finding as a veto', () => {
    run(critiqueArgs(), { codex: { kind: 'ok', text: critique('skeptic', 'S2', 'REJECT', 'critical') } });
    const codex = manifest().critiques.find((c: { cli: string }) => c.cli === 'codex');
    expect(codex).toMatchObject({ status: 'valid', verdict: 'REJECT', veto: true });
  });

  it('reads a finding whose severity has no brackets, so a critical rejection still counts as a veto', () => {
    // Seen from a real critic: `### F1 critical confidence=0.9`, not `### F1 [critical] confidence=0.9`.
    const unbracketed = critique('skeptic', 'S2', 'REJECT', 'critical').replace('[critical] confidence=0.7', 'critical confidence=0.9');
    expect(unbracketed).toContain('### F1 critical confidence=0.9');
    run(critiqueArgs(), { codex: { kind: 'ok', text: unbracketed } });
    expect(manifest().critiques.find((c: { cli: string }) => c.cli === 'codex')).toMatchObject({ status: 'valid', verdict: 'REJECT', veto: true });
  });

  it('exits with the failed-check code when fewer than two critiques are valid, distinct from success and usage', () => {
    const r = run(critiqueArgs(), { codex: { kind: 'exit', code: 1 }, agy: { kind: 'exit', code: 1 } });
    expect(r.status).toBe(ExitCode.CheckFailed);
    expect(r.status).not.toBe(ExitCode.Ok);
    expect(r.status).not.toBe(ExitCode.Usage);
    const m = manifest();
    expect(m.valid).toBe(1);
    expect(m.partial).toBe(true);
  });

  it('a partial critique is a failed check, and its --json envelope carries a manifest marked partial', () => {
    const r = run([...critiqueArgs(), '--json'], { codex: { kind: 'exit', code: 1 }, agy: { kind: 'exit', code: 1 } });
    expect(r.status).toBe(ExitCode.CheckFailed);
    const envelope = JSON.parse(r.stdout);
    expect(envelope).toMatchObject({ status: 'failed', exit_code: ExitCode.CheckFailed });
    expect(envelope.data.manifest).toMatchObject({ partial: true, valid: 1 });
  });

  it('--only restricts the critics to the named CLIs', () => {
    const two = run(critiqueArgs(['--only', 'claude,codex']));
    expect(two.status).toBe(ExitCode.Ok);
    expect(calls('agy')).toHaveLength(0);
    expect(manifest().critiques.map((c: { role: string }) => c.role).sort()).toEqual(['architect', 'skeptic']);
  });

  it('one CLI is not a second opinion: the usage code, and no CLI is invoked', () => {
    const one = run(critiqueArgs(['--only', 'claude']));
    expect(one.status).toBe(ExitCode.Usage);
    expect(one.output).toMatch(/at least 2/);
    expect(allCalls()).toHaveLength(0);
  });
});

describe('poll', () => {
  const answers = { claude: { kind: 'ok', text: 'x' }, codex: { kind: 'ok', text: 'x' }, agy: { kind: 'ok', text: 'x' } };
  const question = (text = 'Pick a name.') => {
    const q = path.join(tmp.root, 'q.txt');
    writeFileSync(q, text);
    return q;
  };

  it('sends the same question with the answer scaffold to every CLI, and names files by model', () => {
    const r = run(['poll', '--prompt-file', question('Which name is better: Alpha or Beta?'), '--out', outDir], {
      claude: { kind: 'ok', text: 'Alpha.' },
      codex: { kind: 'ok', text: 'Alpha.' },
      agy: { kind: 'ok', text: 'Beta.' },
    });
    expect(r.status).toBe(ExitCode.Ok);
    expect(calls('claude')[0]!.stdin).toContain('Which name is better: Alpha or Beta?');
    expect(calls('claude')[0]!.stdin).toContain('Your pick or ranking');
    expect(readdirSync(outDir).filter((f) => f.startsWith('poll-')).sort()).toEqual(['poll-agy.md', 'poll-claude.md', 'poll-codex.md']);
  });

  it('--no-wrap sends the question exactly as written', () => {
    run(['poll', '--prompt-file', question('Just this.'), '--out', outDir, '--no-wrap'], answers);
    expect(calls('claude')[0]!.stdin).toBe('Just this.');
  });

  it('a poll with fewer than two answers is a failed check', () => {
    const r = run(['poll', '--prompt-file', question(), '--out', outDir, '--json'], { claude: { kind: 'ok', text: 'x' }, codex: { kind: 'exit', code: 1 }, agy: { kind: 'exit', code: 1 } });
    expect(r.status).toBe(ExitCode.CheckFailed);
    expect(JSON.parse(r.stdout).data.manifest).toMatchObject({ mode: 'poll', partial: true, valid: 1 });
  });

  it('builds the taste-panel prompt from roster names and an inline lens', () => {
    const r = run(['poll', '--prompt-file', question(), '--out', outDir, '--lens', 'minimalist,Plainspoken:blunt and substance first'], answers);
    expect(r.status).toBe(ExitCode.Ok);
    const prompt = calls('codex')[0]!.stdin;
    expect(prompt).toContain('- minimalist — restraint, clarity, simplicity');
    expect(prompt).toContain('- Plainspoken — blunt and substance first');
    expect(prompt).toContain('PICK:');
    expect(prompt).toContain('QUESTION:\nPick a name.\n');
  });

  it('accepts commas inside an inline lens description, and still counts lenses', () => {
    const r = run(['poll', '--prompt-file', question(), '--out', outDir, '--lens', 'minimalist,Plainspoken:blunt, substance first, distrusts slogans'], answers);
    expect(r.status).toBe(ExitCode.Ok);
    const prompt = calls('codex')[0]!.stdin;
    expect(prompt).toContain('- minimalist — restraint, clarity, simplicity');
    expect(prompt).toContain('- Plainspoken — blunt, substance first, distrusts slogans');
    expect((prompt.match(/^- /gm) ?? []).length).toBe(2); // two lenses, not four fragments
  });

  it('starts a new lens at a roster name or a Name: prefix, wherever the commas fall', () => {
    run(['poll', '--prompt-file', question(), '--out', outDir, '--lens', 'Plain:a, b, minimalist, Blunt:c, d'], answers);
    const prompt = calls('claude')[0]!.stdin;
    expect(prompt).toContain('- Plain — a, b');
    expect(prompt).toContain('- minimalist — restraint');
    expect(prompt).toContain('- Blunt — c, d');
    expect((prompt.match(/^- /gm) ?? []).length).toBe(3);
  });

  it('refuses a description with no lens name before it, instead of guessing', () => {
    const r = run(['poll', '--prompt-file', question(), '--out', outDir, '--lens', 'blunt, substance first,minimalist']);
    expect(r.status).toBe(ExitCode.Usage);
    expect(r.output).toMatch(/unknown lens "blunt, substance first"/);
  });

  it('refuses one lens, four lenses, and an unknown lens name', () => {
    const q = question();
    const lens = (l: string) => run(['poll', '--prompt-file', q, '--out', outDir, '--lens', l]);
    expect(lens('minimalist').status).toBe(ExitCode.Usage);
    expect(lens('minimalist,marketer,contrarian,end-user').status).toBe(ExitCode.Usage);
    const unknown = lens('minimalist,nonsense');
    expect(unknown.status).toBe(ExitCode.Usage);
    expect(unknown.output).toMatch(/unknown lens/);
    expect(calls('claude')).toHaveLength(0);
  });
});

describe('usage and preflight', () => {
  it('refuses to run with no input', () => {
    const r = run(['critique', '--out', outDir]);
    expect(r.status).toBe(ExitCode.Usage);
    expect(r.output).toMatch(/no input/);
  });

  it('refuses an unknown argument, an unknown CLI, an unknown tier and a bad timeout', () => {
    expect(run(['critique', '--nope']).status).toBe(ExitCode.Usage);
    expect(run(['preflight', '--only', 'gemini']).status).toBe(ExitCode.Usage);
    expect(run(['preflight', '--tier', 'huge']).status).toBe(ExitCode.Usage);
    expect(run(['preflight', '--timeout', '0']).status).toBe(ExitCode.Usage);
    expect(allCalls()).toHaveLength(0);
  });

  it('preflight passes when every CLI answers PONG and still lists the flags the command passes', () => {
    const r = run(['preflight'], PONG);
    expect(r.status).toBe(ExitCode.Ok);
    expect(r.stdout.match(/\[OK {2}\]/g)).toHaveLength(3);
  });

  it('preflight pings each CLI with the model of the tier the run will use, and names it', () => {
    const modelOf = (args: readonly string[]) => args[args.indexOf('--model') + 1];
    const strong = run(['preflight'], PONG);
    expect(strong.status).toBe(ExitCode.Ok);
    const pings = () => calls('claude').filter((c) => c.args.includes('--model'));
    expect(modelOf(pings().at(-1)!.args)).toBe('fable');
    expect(strong.stdout).toContain('PONG (fable)');
    expect(strong.stdout).toContain('PONG (Gemini 4 Argon (Medium))');
    expect(run(['preflight', '--tier', 'fast'], PONG).status).toBe(ExitCode.Ok);
    expect(modelOf(pings().at(-1)!.args)).toBe('opus');
  });

  it('preflight reports a CLI that is down, and one whose --help dropped a flag the command passes, as a failed check', () => {
    const r = run(['preflight'], {
      claude: { kind: 'exit', code: 1, stderr: 'Not logged in' },
      codex: { kind: 'ok', text: 'PONG', help: '--skip-git-repo-check --sandbox' },
      agy: { kind: 'ok', text: 'PONG' },
    });
    expect(r.status).toBe(ExitCode.CheckFailed);
    expect(r.stdout).toMatch(/\[DOWN\] claude\s+exit 1.*Not logged in/);
    expect(r.stdout).toMatch(/\[DOWN\] codex\s+answers, but its --help no longer lists: .*--ephemeral/);
    expect(r.stdout).toMatch(/\[OK {2}\] agy/);
  });

  it('preflight --json carries each CLI in the envelope', () => {
    const r = run(['preflight', '--json', '--only', 'claude,agy'], PONG);
    expect(r.status).toBe(ExitCode.Ok);
    const envelope = JSON.parse(r.stdout);
    expect(envelope).toMatchObject({ command: 'second-opinion.preflight', status: 'ok' });
    expect(envelope.data.clis.map((c: { cli: string; ok: boolean }) => [c.cli, c.ok])).toEqual([['claude', true], ['agy', true]]);
    expect(envelope.data.withheld).toBeUndefined();
  });
});

describe('the model CLIs get an allowlisted environment', () => {
  const SECRETS = { GH_TOKEN: 'gh-secret-value', CONTEXTURE_GITHUB_APP_PRIVATE_KEY_FILE: '/run/secrets/github-app-key', GITHUB_TOKEN: 'ghs-secret', SOME_SERVICE_TOKEN: 'svc-secret', ANTHROPIC_API_KEY: 'sk-ant-stub' };

  it('withholds a forge credential and passes the model CLI its own', () => {
    const r = run(critiqueArgs(), {}, { env: SECRETS });
    expect(r.status).toBe(ExitCode.Ok);
    const seen = allCalls();
    expect(seen).toHaveLength(3);
    for (const c of seen) {
      expect(c.env.ANTHROPIC_API_KEY).toBe('sk-ant-stub');
      for (const withheld of ['GH_TOKEN', 'CONTEXTURE_GITHUB_APP_PRIVATE_KEY_FILE', 'GITHUB_TOKEN', 'SOME_SERVICE_TOKEN']) expect(c.env[withheld], withheld).toBeUndefined();
      expect(c.env.HOME).toBe(tmp.root);
      expect(c.env.PATH!.split(path.delimiter)[0]).toBe(binDir);
    }
  });

  it('passes nothing outside the allowlist', () => {
    run(critiqueArgs(), {}, { env: { ...SECRETS, LC_ALL: 'C.UTF-8', HTTPS_PROXY: 'http://proxy:3128', OPENAI_BASE_URL: 'http://x', RANDOM_THING: '1' } });
    const allowed = /^(PATH|HOME|USER|LANG|TERM|TMPDIR|HTTPS?_PROXY|NO_PROXY|https?_proxy|no_proxy|NODE_EXTRA_CA_CERTS|(LC|ANTHROPIC|CLAUDE|OPENAI|CODEX|GEMINI|GOOGLE|AGY|CTXR_SECOND_OPINION)_.*)$/;
    for (const c of allCalls()) {
      // Node's own launcher may add variables of its own to a child's view; none of the source's others pass.
      const extras = Object.keys(c.env).filter((k) => !allowed.test(k) && k in process.env);
      expect(extras).toEqual([]);
      expect(c.env.RANDOM_THING).toBeUndefined();
      expect(c.env.LC_ALL).toBe('C.UTF-8');
      expect(c.env.HTTPS_PROXY).toBe('http://proxy:3128');
      expect(c.env.OPENAI_BASE_URL).toBe('http://x');
    }
  });

  it('passes a variable an operator names in the pass-through list', () => {
    const r = run(critiqueArgs(), {}, { env: { CTXR_SECOND_OPINION_PASS_ENV: 'CORP_CONFIG, OTHER_ONE', CORP_CONFIG: '/etc/corp.toml', OTHER_ONE: 'y' } });
    expect(r.status).toBe(ExitCode.Ok);
    for (const c of allCalls()) {
      expect(c.env.CORP_CONFIG).toBe('/etc/corp.toml');
      expect(c.env.OTHER_ONE).toBe('y');
    }
  });

  it('the pass-through cannot name a protected variable: the usage code naming it, and no CLI is invoked', () => {
    for (const sub of [critiqueArgs(), ['preflight'], ['poll', '--prompt-file', planFile(), '--out', outDir]]) {
      const r = run(sub, {}, { env: { CTXR_SECOND_OPINION_PASS_ENV: 'CORP_CONFIG,GH_TOKEN', GH_TOKEN: 'gh-secret-value' } });
      expect(r.status, sub[0]).toBe(ExitCode.Usage);
      expect(r.output).toContain('GH_TOKEN');
      expect(r.output).not.toContain('gh-secret-value');
    }
    const json = run(['preflight', '--json'], {}, { env: { CTXR_SECOND_OPINION_PASS_ENV: 'CONTEXTURE_GITHUB_APP_PRIVATE_KEY_FILE' } });
    expect(JSON.parse(json.stdout).findings[0]).toMatchObject({ code: 'second_opinion.usage', details: { variables: ['CONTEXTURE_GITHUB_APP_PRIVATE_KEY_FILE'] } });
    expect(allCalls()).toHaveLength(0);
  });

  it('a failing preflight names the variables it withheld, never their values', () => {
    const r = run(['preflight', '--json'], { ...PONG, codex: { kind: 'exit', code: 1, stderr: 'no auth' } }, { env: SECRETS });
    expect(r.status).toBe(ExitCode.CheckFailed);
    const data = JSON.parse(r.stdout).data;
    expect(data.withheld).toEqual(expect.arrayContaining(['GH_TOKEN', 'CONTEXTURE_GITHUB_APP_PRIVATE_KEY_FILE', 'SOME_SERVICE_TOKEN']));
    expect(data.withheld).not.toContain('ANTHROPIC_API_KEY');
    const human = run(['preflight'], { ...PONG, codex: { kind: 'exit', code: 1, stderr: 'no auth' } }, { env: SECRETS });
    expect(human.stdout).toMatch(/Withheld from the CLIs: .*GH_TOKEN/);
    expect(human.stdout).toContain('CTXR_SECOND_OPINION_PASS_ENV');
    for (const value of Object.values(SECRETS)) {
      expect(r.output).not.toContain(value);
      expect(human.output).not.toContain(value);
    }
  });
});

describe('no other command depends on the second opinion', () => {
  it('only the command and its registration import the second-opinion modules', () => {
    const importers = sourceFilesUnder(SRC)
      .filter((file) => !file.includes(`${path.sep}core${path.sep}second-opinion${path.sep}`))
      .filter((file) => /from '[^']*second-opinion[^']*'/.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(SRC, file).split(path.sep).join('/'))
      .sort();
    expect(importers).toEqual(['commands/second-opinion.ts', 'run.ts']);
  });
});
