import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeTmpDir, type TmpDir } from '../helpers/tmp-store.js';

/**
 * ship-a-cross-model-second-opinion-skill, harness-portability requirement
 * "The second-opinion skill is an owned skill over external model CLIs": one
 * test per runner scenario, run against stub `claude` / `codex` / `agy`
 * executables placed first on PATH. The real runner is spawned as a
 * subprocess, exactly as the skill invokes it.
 */
const RUNNER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../templates/skills/ctxr-second-opinion/run.mjs');

/** The stub every CLI name points at: records what it was given, then behaves as scripted. */
const STUB = `#!/usr/bin/env node
const fs = require('node:fs');
const name = require('node:path').basename(process.argv[1]);
const dir = process.env.STUB_DIR;
const args = process.argv.slice(2);
const behavior = JSON.parse(process.env['STUB_' + name.toUpperCase()] || '{"kind":"ok","text":"PONG"}');
const isHelp = args.includes('--help');
let stdin = '';
if (!isHelp && behavior.kind !== 'hang') { try { stdin = fs.readFileSync(0, 'utf8'); } catch {} }
if (!isHelp) {
  const file = dir + '/' + name + '.json';
  const prior = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
  prior.push({ args, stdin, cwd: process.cwd(), ppid: process.ppid });
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

function run(args: string[], behaviors: Record<string, Behavior> = {}, opts: { input?: string; env?: Record<string, string> } = {}) {
  // HOME points at the temp dir so the runner's ~/.local/bin PATH fallback can never reach a real CLI.
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: tmp.root, PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}`, STUB_DIR: logDir };
  for (const cli of ['claude', 'codex', 'agy']) {
    env[`STUB_${cli.toUpperCase()}`] = JSON.stringify(behaviors[cli] ?? { kind: 'ok', text: critique(ROLE_OF[cli]!) });
  }
  const result = spawnSync('node', [RUNNER, ...args], { env: { ...env, ...opts.env }, encoding: 'utf8', input: opts.input ?? '' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, pid: result.pid };
}

function planFile(text = PLAN): string {
  const file = path.join(tmp.root, 'plan.md');
  writeFileSync(file, text);
  return file;
}

const calls = (cli: string): { args: string[]; stdin: string; cwd: string; ppid: number }[] => {
  const file = path.join(logDir, `${cli}.json`);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
};
const manifest = () => JSON.parse(readFileSync(path.join(outDir, 'manifest.json'), 'utf8'));
const critiqueArgs = (extra: string[] = []) => ['--mode', 'critique', '--plan-file', planFile(), '--out', outDir, ...extra];

describe('critique: isolation and delivery', () => {
  it('critics never see each other: each receives the plan and exactly one role', () => {
    const r = run(critiqueArgs());
    expect(r.status).toBe(0);
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
    const big = run(['--mode', 'critique', '--plan-file', planFile(plan), '--out', path.join(tmp.root, 'out2')]);
    expect(big.status).toBe(0);
    const claude = calls('claude').at(-1)!;
    const codex = calls('codex').at(-1)!;
    const agy = calls('agy').at(-1)!;
    expect(claude.stdin.endsWith(`PLAN:\n${plan}\n`)).toBe(true);
    expect(codex.stdin.endsWith(`PLAN:\n${plan}\n`)).toBe(true);
    expect(agy.args[agy.args.indexOf('-p') + 1]!.endsWith(`PLAN:\n${plan}\n`)).toBe(true);
    // Each CLI's parent is the runner process itself: nothing, least of all a shell, sits between them.
    for (const c of [claude, codex, agy]) expect(c.ppid).toBe(big.pid);
    expect(existsSync('/tmp/second-opinion-canary')).toBe(false);
  });

  it('the runner source spawns no shell', () => {
    const source = readFileSync(RUNNER, 'utf8');
    expect(source).not.toMatch(/shell\s*:\s*true/);
    // The only child_process import is `spawn`; exec/execSync/execFile all go through a shell or hide argv.
    expect([...source.matchAll(/import \{([^}]*)\} from 'node:child_process'/g)].map((m) => m[1]!.trim())).toEqual(['spawn']);
    expect(source).not.toMatch(/['"`]sh['"`]|['"`]bash['"`]/);
  });

  it('runs every CLI in an empty scratch directory, read-only or tool-less where the CLI offers it', () => {
    run(critiqueArgs());
    const claude = calls('claude')[0]!;
    const codex = calls('codex')[0]!;
    const agy = calls('agy')[0]!;
    for (const c of [claude, codex, agy]) {
      expect(c.cwd).not.toBe(process.cwd());
      expect(c.cwd).toMatch(/ctxr-second-opinion-/);
    }
    expect(claude.args).toEqual(expect.arrayContaining(['--tools', '', '--no-session-persistence']));
    expect(claude.args).not.toContain('--max-turns'); // hidden from --help, and moot with no tools
    expect(codex.args).toEqual(expect.arrayContaining(['--sandbox', 'read-only', '--ephemeral', '--skip-git-repo-check']));
    expect(agy.args).toEqual(expect.arrayContaining(['--sandbox', '--disable-slash-commands']));
  });
});

describe('critique: model and effort defaults', () => {
  it('asks claude for high effort by default, and max only when the environment says so', () => {
    run(critiqueArgs());
    const dflt = calls('claude')[0]!.args;
    expect(dflt[dflt.indexOf('--effort') + 1]).toBe('high');
    run(['--mode', 'critique', '--plan-file', planFile(), '--out', path.join(tmp.root, 'deep')], {}, { env: { CTXR_SECOND_OPINION_CLAUDE_EFFORT: 'max' } });
    const deep = calls('claude')[1]!.args;
    expect(deep[deep.indexOf('--effort') + 1]).toBe('max');
  });

  it('passes no effort to claude at the fast tier, and the cheaper model', () => {
    run(critiqueArgs(['--tier', 'fast']));
    const args = calls('claude')[0]!.args;
    expect(args).not.toContain('--effort');
    expect(args[args.indexOf('--model') + 1]).toBe('haiku');
  });
});

describe('critique: anonymizing and the manifest', () => {
  it('names files by letter, keeps roles and models out of stdout, and maps letters only in the manifest', () => {
    const r = run(critiqueArgs(['--seed', '3']));
    expect(r.status).toBe(0);
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
      run(['--mode', 'critique', '--plan-file', planFile(), '--out', dir, '--seed', String(seed)]);
      return JSON.stringify(JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8')).critiques.map((c: { role: string; letter: string }) => `${c.role}=${c.letter}`));
    };
    const seen = new Set<string>();
    for (let seed = 1; seed <= 8; seed++) seen.add(mapping(seed, path.join(tmp.root, `o${seed}`)));
    expect(seen.size).toBeGreaterThan(1);
    expect(mapping(5, path.join(tmp.root, 'r1'))).toBe(mapping(5, path.join(tmp.root, 'r2')));
  });

  it('strips the codex banner and trailer, and keeps the raw output beside it', () => {
    run(critiqueArgs());
    const m = manifest();
    const codexEntry = m.critiques.find((c: { cli: string }) => c.cli === 'codex');
    const stripped = readFileSync(path.join(outDir, `critique-${codexEntry.letter}.md`), 'utf8');
    expect(stripped.startsWith('## Role: skeptic')).toBe(true);
    expect(stripped).not.toMatch(/tokens used|OpenAI Codex|prompt echo/);
    expect(readFileSync(path.join(outDir, 'raw', 'skeptic-codex.txt'), 'utf8')).toMatch(/tokens used/);
  });
});

describe('critique: failure, blindness, quorum', () => {
  it('records a non-zero exit and a timeout as failed with their causes, and substitutes no other model', () => {
    const r = run(critiqueArgs(['--timeout', '2']), { codex: { kind: 'exit', code: 3, stderr: 'auth expired' }, agy: { kind: 'hang' } });
    expect(r.status).toBe(2);
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
  }, 20_000);

  it('a missing CLI is a failed critic, not a crash', () => {
    const r = spawnSync(process.execPath, [RUNNER, ...critiqueArgs()], {
      env: { ...process.env, HOME: tmp.root, PATH: '/nonexistent', STUB_DIR: logDir },
      encoding: 'utf8',
    });
    expect(r.status).toBe(2);
    expect(manifest().critiques.every((c: { status: string; cause: string }) => c.status === 'failed' && /not found on PATH/.test(c.cause))).toBe(true);
  });

  it('marks a well-formed verdict whose findings cite nothing in the plan as blind, and does not count it', () => {
    const r = run(critiqueArgs(), { agy: { kind: 'ok', text: critique('pragmatist', 'S9 and "a sentence the plan never contained"') } });
    expect(r.status).toBe(0); // two valid critiques still meet the quorum
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

  it('exits with the partial-result status when fewer than two critiques are valid', () => {
    const r = run(critiqueArgs(), { codex: { kind: 'exit', code: 1 }, agy: { kind: 'exit', code: 1 } });
    expect(r.status).toBe(2);
    const m = manifest();
    expect(m.valid).toBe(1);
    expect(m.partial).toBe(true);
  });

  it('--only restricts the critics to the named CLIs and refuses a single one', () => {
    const two = run(critiqueArgs(['--only', 'claude,codex']));
    expect(two.status).toBe(0);
    expect(calls('agy')).toHaveLength(0);
    expect(manifest().critiques.map((c: { role: string }) => c.role).sort()).toEqual(['architect', 'skeptic']);
    const one = run(critiqueArgs(['--only', 'claude']));
    expect(one.status).toBe(1);
    expect(one.stderr).toMatch(/at least 2/);
  });
});

describe('poll', () => {
  it('sends the same question with the answer scaffold to every CLI, and names files by model', () => {
    const q = path.join(tmp.root, 'q.txt');
    writeFileSync(q, 'Which name is better: Alpha or Beta?');
    const r = run(['--mode', 'poll', '--prompt-file', q, '--out', outDir], {
      claude: { kind: 'ok', text: 'Alpha.' },
      codex: { kind: 'ok', text: 'Alpha.' },
      agy: { kind: 'ok', text: 'Beta.' },
    });
    expect(r.status).toBe(0);
    expect(calls('claude')[0]!.stdin).toContain('Which name is better: Alpha or Beta?');
    expect(calls('claude')[0]!.stdin).toContain('Your pick or ranking');
    expect(readdirSync(outDir).filter((f) => f.startsWith('poll-')).sort()).toEqual(['poll-agy.md', 'poll-claude.md', 'poll-codex.md']);
  });

  it('builds the taste-panel prompt from roster names and an inline lens', () => {
    const q = path.join(tmp.root, 'q.txt');
    writeFileSync(q, 'Pick a name.');
    const r = run(['--mode', 'poll', '--prompt-file', q, '--out', outDir, '--lens', 'minimalist,Plainspoken:blunt and substance first'], {
      claude: { kind: 'ok', text: 'x' },
      codex: { kind: 'ok', text: 'x' },
      agy: { kind: 'ok', text: 'x' },
    });
    expect(r.status).toBe(0);
    const prompt = calls('codex')[0]!.stdin;
    expect(prompt).toContain('- minimalist — restraint, clarity, simplicity');
    expect(prompt).toContain('- Plainspoken — blunt and substance first');
    expect(prompt).toContain('PICK:');
  });

  it('refuses one lens, four lenses, and an unknown lens name', () => {
    const q = path.join(tmp.root, 'q.txt');
    writeFileSync(q, 'Pick a name.');
    const lens = (l: string) => run(['--mode', 'poll', '--prompt-file', q, '--out', outDir, '--lens', l]);
    expect(lens('minimalist').status).toBe(1);
    expect(lens('minimalist,marketer,contrarian,end-user').status).toBe(1);
    const unknown = lens('minimalist,nonsense');
    expect(unknown.status).toBe(1);
    expect(unknown.stderr).toMatch(/unknown lens/);
    expect(calls('claude')).toHaveLength(0);
  });
});

describe('usage and preflight', () => {
  it('refuses to run with no input', () => {
    const r = run(['--mode', 'critique', '--out', outDir]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/no input/);
  });

  it('refuses an unknown argument and an unknown CLI', () => {
    expect(run(['--nope']).status).toBe(1);
    expect(run(['--preflight', '--only', 'gemini']).status).toBe(1);
  });

  it('preflight passes when every CLI answers PONG and still lists the flags the runner passes', () => {
    const r = run(['--preflight'], { claude: { kind: 'ok', text: 'PONG' }, codex: { kind: 'ok', text: 'PONG' }, agy: { kind: 'ok', text: 'PONG' } });
    expect(r.status).toBe(0);
    expect(r.stdout.match(/\[OK  \]/g)).toHaveLength(3);
  });

  it('preflight reports a CLI that is down, and one whose --help dropped a flag the runner passes', () => {
    const r = run(['--preflight'], {
      claude: { kind: 'exit', code: 1, stderr: 'Not logged in' },
      codex: { kind: 'ok', text: 'PONG', help: '--skip-git-repo-check --sandbox' },
      agy: { kind: 'ok', text: 'PONG' },
    });
    expect(r.status).toBe(2);
    expect(r.stdout).toMatch(/\[DOWN\] claude\s+exit 1.*Not logged in/);
    expect(r.stdout).toMatch(/\[DOWN\] codex\s+answers, but its --help no longer lists: .*--ephemeral/);
    expect(r.stdout).toMatch(/\[OK  \] agy/);
  });
});
