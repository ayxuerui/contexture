import { SHIPPED_DEFAULTS } from '../../config/defaults.js';
import type { SecondOpinionLineup } from '../../config/schema.js';
import type { SourceEnv } from './environment.js';

/**
 * run-the-second-opinion-from-the-cli D1: the vendor CLI names and flags stay
 * internal to this directory, behind contexture's own options (`--tier`,
 * `--only`). The preflight still checks each CLI's help text for them, so a
 * drifted flag fails loudly. Ported from the skill's `run.mjs`.
 */
export const ALL_CLIS = ['claude', 'codex', 'agy'] as const;
export type Cli = (typeof ALL_CLIS)[number];

export const TIERS = ['strong', 'fast'] as const;
export type Tier = (typeof TIERS)[number];

export const ROLE_CLI = { architect: 'claude', skeptic: 'codex', pragmatist: 'agy' } as const satisfies Record<string, Cli>;
export type Role = keyof typeof ROLE_CLI;
export const ROLES = Object.keys(ROLE_CLI) as Role[];

/** A second opinion needs at least this many valid answers, and this many CLIs requested. */
export const QUORUM = 2;

/** Linux caps one argv element at 128 KiB; agy is the only CLI given its prompt as argv. */
export const MAX_ARGV_BYTES = 120_000;

/** Where a model came from: this run's environment, the store's configuration, or contexture's shipped lineup. */
export type LineupSource = 'environment' | 'store' | 'default';

export interface CliModel {
  model: string;
  /** Null when the CLI is left to its own default, and for agy, whose effort is part of the model name. */
  effort: string | null;
  source: LineupSource;
}

/**
 * second-opinion-lineup-in-store-config D2, D3: what one model CLI is asked
 * for at one tier. The lineup is the store's `second_opinion` block, or the
 * schema's own defaults outside a store; the shipped values live in
 * `config/defaults.ts` and nowhere here.
 *
 * A non-empty `CTXR_SECOND_OPINION_<CLI>_MODEL` or `_EFFORT` wins, for both
 * tiers, since it is the narrower scope: this run, on this machine. An empty
 * one is unset, which is how a deployment passes a variable it did not set. A
 * store's value equal to the shipped one reports `default`: the loaded
 * configuration cannot tell the two apart, and nothing depends on it.
 */
export function lineupCell(source: SourceEnv, lineup: SecondOpinionLineup, tier: Tier, cli: Cli): CliModel {
  const env = (name: 'MODEL' | 'EFFORT'): string | null => source[`CTXR_SECOND_OPINION_${cli.toUpperCase()}_${name}`] || null;
  const fromEnv = env('MODEL');
  const configured = lineup[tier][cli].model;
  const model = fromEnv ?? configured;
  const from: LineupSource = fromEnv !== null ? 'environment' : configured === SHIPPED_DEFAULTS.second_opinion[tier][cli].model ? 'default' : 'store';
  if (cli === 'agy') return { model, effort: null, source: from };
  return { model, effort: env('EFFORT') ?? lineup[tier][cli].effort ?? null, source: from };
}

/**
 * The flags this command passes, so preflight can confirm each CLI's --help still lists them. Only flags
 * the help text documents belong here: `claude` still accepts a hidden --max-turns, but with `--tools ""`
 * there is no tool turn to bound, so it is not passed at all. --effort is not listed because it is only
 * passed when the environment asks for one.
 */
export const FLAGS_USED: Record<Cli, { helpArgs: string[]; flags: string[] }> = {
  claude: { helpArgs: ['--help'], flags: ['--tools', '--model', '--no-session-persistence', '--disable-slash-commands', '--output-format'] },
  codex: { helpArgs: ['exec', '--help'], flags: ['--skip-git-repo-check', '--sandbox', '--ephemeral', '--color', '--config', '--model'] },
  agy: { helpArgs: ['--help'], flags: ['--print', '--sandbox', '--disable-slash-commands', '--model'] },
};

/**
 * serve-the-second-opinion-to-chat-apps D1: what a confined run copies into a
 * CLI's fresh home, and how much of its install it may read. The logins are
 * the files each CLI keeps its sign-in in, relative to the home (seen
 * 2026-11-11). The install directory is counted up from the directory holding
 * the binary's real path: claude's `share/claude/versions/<v>` reads
 * `share/claude`, codex's `releases/<v>/bin/codex` reads `releases/<v>`, and
 * agy is one self-contained file.
 */
export const LOGIN_FILES: Record<Cli, readonly string[]> = {
  claude: ['.claude/.credentials.json'],
  codex: ['.codex/auth.json'],
  agy: ['.gemini/antigravity-cli/antigravity-oauth-token'],
};
export const INSTALL_LEVELS: Record<Cli, number> = { claude: 2, codex: 2, agy: 0 };

export interface Invocation {
  cmd: Cli;
  args: string[];
  stdin: string;
}

/**
 * How each family is contained. Only claude and codex offer a mode that removes the ability to
 * act; agy does not (its headless plan mode still wrote a file), so it is held to an empty working
 * directory and an untrusted plan should run without it.
 */
export function buildInvocation(cli: Cli, prompt: string, t: CliModel): Invocation {
  if (cli === 'claude') {
    const args = ['-p', '--tools', '', '--model', t.model, '--no-session-persistence', '--disable-slash-commands', '--output-format', 'json'];
    if (t.effort) args.push('--effort', t.effort);
    return { cmd: 'claude', args, stdin: prompt };
  }
  if (cli === 'codex') {
    const args = ['exec', '--skip-git-repo-check', '--sandbox', 'read-only', '--ephemeral', '--color', 'never', '--model', t.model];
    if (t.effort) args.push('-c', `model_reasoning_effort=${t.effort}`);
    args.push('-');
    return { cmd: 'codex', args, stdin: prompt };
  }
  return { cmd: 'agy', args: ['-p', prompt, '--sandbox', '--disable-slash-commands', '--model', t.model], stdin: '' };
}

/** Normalizes a CLI's raw output to answer text plus the model it says it ran. */
export function normalize(cli: Cli, raw: { stdout: string; stderr: string }): { text: string; model: string | null } {
  if (cli === 'claude') {
    try {
      const j = JSON.parse(raw.stdout) as { result?: unknown; modelUsage?: Record<string, unknown> };
      const models = Object.keys(j.modelUsage ?? {});
      return { text: String(j.result ?? '').trim(), model: models.length ? models.join(', ') : null };
    } catch {
      return { text: raw.stdout.trim(), model: null };
    }
  }
  if (cli === 'codex') {
    const model = /^model:\s*(.+)$/m.exec(`${raw.stdout}\n${raw.stderr}`)?.[1]?.trim() ?? null;
    return { text: stripCodexNoise(raw.stdout), model };
  }
  return { text: raw.stdout.trim(), model: null };
}

/**
 * Codex wraps its answer in a session banner and repeats it after a `tokens used` trailer.
 * The answer starts at the first line of the required shape; failing that, the trailer is cut and
 * everything else is kept, so real content is never eaten.
 */
export function stripCodexNoise(text: string): string {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => /^## (Role|Verdict):/.test(l));
  let body = start >= 0 ? lines.slice(start) : lines;
  const trailer = body.findIndex((l) => /^tokens used\b/i.test(l.trim()));
  if (trailer >= 0) body = body.slice(0, trailer);
  return body.join('\n').trim();
}
