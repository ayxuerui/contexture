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

interface CliModel {
  model: string;
  effort?: string | null;
}

/**
 * Model choice lives here, in one table. Override by environment, never by editing a store.
 *
 * The tiers name a class of model, not a price. `strong` is each family's frontier model and `fast` its
 * workhorse: claude `fable` and `opus`; codex `gpt-6-astra` ("frontier intelligence") and `gpt-6.1-sol`
 * ("latest workhorse"), as codex's model catalog described them on 2026-10-15; agy `Gemini 4 Argon` and
 * `Gemini 3.8 Flash`, once agy offered Argon (2026-10-19). The tiers differ in model only: every model runs at
 * its provider's default effort.
 *
 * Effort is each provider's own recommended default, not one this command picked:
 *  - claude: no --effort at all, so Claude Code applies its own default for the model.
 *  - codex: the default its model catalog declares (`default_reasoning_level`), which was `low` for both
 *    gpt-6-astra and gpt-6.1-sol on 2026-10-15. It is passed explicitly because the flag cannot simply be
 *    left off: with no pin in config.toml, codex resolves to `reasoning effort: none` on a ChatGPT login
 *    (seen 2026-10-05), which is no review at all. Set CTXR_SECOND_OPINION_CODEX_EFFORT to use another.
 *  - agy: the effort is part of the model name. The default thinking level is `(Medium)` for Gemini 4 Argon
 *    and `(High)` for Gemini 3.8 Flash. agy rejects an unknown name, and preflight tests it.
 */
export function tiers(source: SourceEnv): Record<Tier, Record<Cli, CliModel>> {
  const env = (name: string, fallback: string | null): string | null => source[`CTXR_SECOND_OPINION_${name}`] || fallback;
  return {
    strong: {
      claude: { model: env('CLAUDE_MODEL', 'fable')!, effort: env('CLAUDE_EFFORT', null) },
      codex: { model: env('CODEX_MODEL', 'gpt-6-astra')!, effort: env('CODEX_EFFORT', 'low') },
      agy: { model: env('AGY_MODEL', 'Gemini 4 Argon (Medium)')! },
    },
    fast: {
      claude: { model: env('CLAUDE_MODEL', 'opus')!, effort: env('CLAUDE_EFFORT', null) },
      codex: { model: env('CODEX_MODEL', 'gpt-6.1-sol')!, effort: env('CODEX_EFFORT', 'low') },
      agy: { model: env('AGY_MODEL', 'Gemini 3.8 Flash (High)')! },
    },
  };
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
export function buildInvocation(cli: Cli, prompt: string, tier: Tier, source: SourceEnv): Invocation {
  const t = tiers(source)[tier][cli];
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
