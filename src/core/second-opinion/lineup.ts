import { OPENROUTER_FAMILY_MODELS, SECOND_OPINION_TOOL_EFFORT, SECOND_OPINION_TOOL_MODELS } from '../../config/defaults.js';
import type { SecondOpinionLineup } from '../../config/schema.js';
import type { SourceEnv } from './environment.js';

/**
 * run-the-second-opinion-from-the-cli D1: the vendor CLI names and flags stay
 * internal to this directory, behind contexture's own options (`--tier`,
 * `--only`). The preflight still checks each CLI's help text for them, so a
 * drifted flag fails loudly. Ported from the skill's `run.mjs`.
 */
export const ALL_CLIS = ['claude', 'gpt', 'gemini', 'grok'] as const;
export type Cli = (typeof ALL_CLIS)[number];

/**
 * ship-default-openrouter-models D8: a critic is named for its model family,
 * and this is the one place that says which command-line tool runs it. The
 * tool names are the vendors' and are used only to start the tool, to copy its
 * login and in a message about the tool itself. `grok` has no tool: it is
 * answered through OpenRouter or not at all.
 */
export const CRITIC_TOOL = { claude: 'claude', gpt: 'codex', gemini: 'agy' } as const;
export type ToolCritic = keyof typeof CRITIC_TOOL;
export const hasTool = (critic: Cli): critic is ToolCritic => Object.hasOwn(CRITIC_TOOL, critic);

/** The names two critics had through 0.45.0, when they were named for their tools. Refused by name, never read. */
export const RETIRED_CRITIC_NAMES = { codex: 'gpt', agy: 'gemini' } as const satisfies Record<string, Cli>;
const RETIRED_VARIABLE = /^CTXR_SECOND_OPINION_(CODEX|AGY)_(MODEL|EFFORT)$/;
/** ship-default-openrouter-models D9: the per-critic variable that chose a route, under any critic name it ever had. */
const ROUTE_VARIABLE = /^CTXR_SECOND_OPINION_(CLAUDE|GPT|GEMINI|CODEX|AGY)_OPENROUTER$/;

/**
 * The retired variables this run's environment still sets, each with what
 * replaces it. A set one is refused before anything starts: ignoring it would
 * run a model or a route the operator did not ask for. An empty one is unset,
 * which is how a deployment passes a variable it did not set.
 */
export function retiredVariables(source: SourceEnv): Array<{ old: string; now: string }> {
  const set = Object.keys(source)
    .filter((name) => Boolean(source[name]))
    .sort();
  const renamed = set.filter((name) => RETIRED_VARIABLE.test(name)).map((old) => ({ old, now: old.replace('_CODEX_', '_GPT_').replace('_AGY_', '_GEMINI_') }));
  const routes = set
    .filter((name) => ROUTE_VARIABLE.test(name))
    .map((old) => {
      const named = old.split('_')[3]!.toLowerCase();
      const critic = (RETIRED_CRITIC_NAMES as Record<string, string>)[named] ?? named;
      return { old, now: `second_opinion.${critic}.via in the configuration` };
    });
  return [...renamed, ...routes];
}

export const TIERS = ['strong', 'fast'] as const;
export type Tier = (typeof TIERS)[number];

/**
 * Each critic's stance in a critique. `verifier` is grok's, added with it
 * (ship-default-openrouter-models D4): the other three cover structure, risk
 * and simplicity, and it covers whether anyone could tell the plan worked.
 */
export const ROLE_CLI = { architect: 'claude', skeptic: 'gpt', pragmatist: 'gemini', verifier: 'grok' } as const satisfies Record<string, Cli>;
export type Role = keyof typeof ROLE_CLI;
export const ROLES = Object.keys(ROLE_CLI) as Role[];

/** A second opinion needs at least this many valid answers, and this many critics requested. */
export const QUORUM = 2;

/** Linux caps one argv element at 128 KiB; agy, the gemini critic's tool, is the only one given its prompt as argv. */
export const MAX_ARGV_BYTES = 120_000;

/** Where a model came from: this run's environment, the configuration, or contexture's shipped tables. */
export type LineupSource = 'environment' | 'store' | 'default';

/** How a critic is reached: its command-line tool, or one request to OpenRouter (second-opinion-through-openrouter). */
export type Route = 'cli' | 'openrouter';

/** Why a critic has the route it has: the configuration said so, or nothing did and the default applied. */
export type RouteSource = 'store' | 'default';

export interface CliModel {
  route: Route;
  /** Whether the configuration named the route, or it is the default for this machine. */
  route_source: RouteSource;
  /** The tool's own model name on the `cli` route, an OpenRouter slug on the other. */
  model: string;
  /** Null through OpenRouter, when the tool is left to its own default, and for gemini, whose tool takes the effort as part of the model name. */
  effort: string | null;
  source: LineupSource;
}

/** The key an OpenRouter request is signed with. Its presence also sets the default route (D11). */
export const OPENROUTER_KEY = 'OPENROUTER_API_KEY';

/**
 * ship-default-openrouter-models D10, D11: how one critic is reached, or null
 * when it is not in the lineup on this machine.
 *
 * The configuration's `via` decides when it is written: `cli`, `openrouter`,
 * or `off`. With nothing written, a machine that holds an OpenRouter key
 * sends every critic through OpenRouter, and a machine without one runs each
 * critic's tool. `grok` has no tool, so without a key and without `via` it
 * is not in the lineup, which is why a machine with no key runs three.
 */
export function criticRoute(source: SourceEnv, lineup: SecondOpinionLineup, critic: Cli): { route: Route; route_source: RouteSource } | null {
  const via = lineup[critic].via;
  if (via === 'off') return null;
  if (via !== undefined) return { route: via, route_source: 'store' };
  if (source[OPENROUTER_KEY]) return { route: 'openrouter', route_source: 'default' };
  return hasTool(critic) ? { route: 'cli', route_source: 'default' } : null;
}

/** The critics in the lineup on this machine, in roster order. */
export function lineupCritics(source: SourceEnv, lineup: SecondOpinionLineup): Cli[] {
  return ALL_CLIS.filter((critic) => criticRoute(source, lineup, critic) !== null);
}

/**
 * What one critic is asked for at one tier. Call it only for a critic that
 * `lineupCritics` returned.
 *
 * Through OpenRouter the model is the configuration's for that tier, or the
 * slug this release ships for the family. Nothing in the environment names
 * it. On the tool route the model is the environment's
 * `CTXR_SECOND_OPINION_<CRITIC>_MODEL` (both tiers, since it is the narrower
 * scope: this run, on this machine), then the configuration's, then the
 * shipped one; the effort likewise, for the tools that take one. An empty
 * variable is unset, which is how a deployment passes one it did not set.
 */
export function lineupCell(source: SourceEnv, lineup: SecondOpinionLineup, tier: Tier, critic: Cli): CliModel {
  const reached = criticRoute(source, lineup, critic);
  if (reached === null) throw new Error(`${critic} is not in the lineup`);
  const entry = lineup[critic];
  // A written model always has `via` beside it (the schema), so it belongs to the route in force.
  const written = entry[tier];
  if (reached.route === 'openrouter') {
    return { ...reached, model: written ?? OPENROUTER_FAMILY_MODELS[critic][tier], effort: null, source: written === undefined ? 'default' : 'store' };
  }
  if (!hasTool(critic)) throw new Error(`${critic} has no command-line tool`);
  const env = (name: 'MODEL' | 'EFFORT'): string | null => source[`CTXR_SECOND_OPINION_${critic.toUpperCase()}_${name}`] || null;
  const fromEnv = env('MODEL');
  const model = fromEnv ?? written ?? SECOND_OPINION_TOOL_MODELS[critic][tier];
  const from: LineupSource = fromEnv !== null ? 'environment' : written !== undefined ? 'store' : 'default';
  if (critic === 'gemini') return { ...reached, model, effort: null, source: from };
  const shippedEffort = critic === 'gpt' ? SECOND_OPINION_TOOL_EFFORT.gpt : null;
  const writtenEffort = 'effort' in entry ? (entry.effort as string | undefined) : undefined;
  return { ...reached, model, effort: env('EFFORT') ?? writtenEffort ?? shippedEffort, source: from };
}

/**
 * ship-default-openrouter-models D9: the requested critics that go through
 * OpenRouter while the environment names a tool model for them. The variable
 * cannot apply, and moving the critic back to its tool would let the
 * environment choose where a plan is sent, so the command refuses instead.
 */
export function routeConflicts(source: SourceEnv, lineup: SecondOpinionLineup, clis: readonly Cli[]): Array<{ critic: Cli; variable: string }> {
  return clis
    .filter((critic) => criticRoute(source, lineup, critic)?.route === 'openrouter')
    .map((critic) => ({ critic, variable: `CTXR_SECOND_OPINION_${critic.toUpperCase()}_MODEL` }))
    .filter((v) => Boolean(source[v.variable]));
}

/**
 * The flags this command passes, so preflight can confirm each CLI's --help still lists them. Only flags
 * the help text documents belong here: `claude` still accepts a hidden --max-turns, but with `--tools ""`
 * there is no tool turn to bound, so it is not passed at all. --effort is not listed because it is only
 * passed when the environment asks for one.
 */
export const FLAGS_USED: Record<ToolCritic, { helpArgs: string[]; flags: string[] }> = {
  claude: { helpArgs: ['--help'], flags: ['--tools', '--model', '--no-session-persistence', '--disable-slash-commands', '--output-format'] },
  gpt: { helpArgs: ['exec', '--help'], flags: ['--skip-git-repo-check', '--sandbox', '--ephemeral', '--color', '--config', '--model'] },
  gemini: { helpArgs: ['--help'], flags: ['--print', '--sandbox', '--disable-slash-commands', '--model'] },
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
export const LOGIN_FILES: Record<ToolCritic, readonly string[]> = {
  claude: ['.claude/.credentials.json'],
  gpt: ['.codex/auth.json'],
  gemini: ['.gemini/antigravity-cli/antigravity-oauth-token'],
};
export const INSTALL_LEVELS: Record<ToolCritic, number> = { claude: 2, gpt: 2, gemini: 0 };

export interface Invocation {
  /** The tool to start, from `CRITIC_TOOL`. */
  cmd: string;
  args: string[];
  stdin: string;
}

/**
 * How each family is contained. Only claude and codex offer a mode that removes the ability to
 * act; agy does not (its headless plan mode still wrote a file), so it is held to an empty working
 * directory and an untrusted plan should run without it.
 */
export function buildInvocation(cli: ToolCritic, prompt: string, t: CliModel): Invocation {
  if (cli === 'claude') {
    const args = ['-p', '--tools', '', '--model', t.model, '--no-session-persistence', '--disable-slash-commands', '--output-format', 'json'];
    if (t.effort) args.push('--effort', t.effort);
    return { cmd: CRITIC_TOOL.claude, args, stdin: prompt };
  }
  if (cli === 'gpt') {
    const args = ['exec', '--skip-git-repo-check', '--sandbox', 'read-only', '--ephemeral', '--color', 'never', '--model', t.model];
    if (t.effort) args.push('-c', `model_reasoning_effort=${t.effort}`);
    args.push('-');
    return { cmd: CRITIC_TOOL.gpt, args, stdin: prompt };
  }
  return { cmd: CRITIC_TOOL.gemini, args: ['-p', prompt, '--sandbox', '--disable-slash-commands', '--model', t.model], stdin: '' };
}

/** Normalizes a CLI's raw output to answer text plus the model it says it ran. */
export function normalize(cli: ToolCritic, raw: { stdout: string; stderr: string }): { text: string; model: string | null } {
  if (cli === 'claude') {
    try {
      const j = JSON.parse(raw.stdout) as { result?: unknown; modelUsage?: Record<string, unknown> };
      const models = Object.keys(j.modelUsage ?? {});
      return { text: String(j.result ?? '').trim(), model: models.length ? models.join(', ') : null };
    } catch {
      return { text: raw.stdout.trim(), model: null };
    }
  }
  if (cli === 'gpt') {
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
