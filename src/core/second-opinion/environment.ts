import path from 'node:path';

/**
 * run-the-second-opinion-from-the-cli D3: the model CLIs get an environment
 * built from an allowlist, never a copy of the command's own. On a laptop the
 * process environment is the operator's shell; in a deployed store's
 * container it can hold a forge token or the path to an App key, and nothing
 * a critic is handed should point at either.
 *
 * This removes pointers to secrets, not the secrets: a read-only sandbox can
 * still read any file the process can. It is not a sandbox (D3).
 */

/** Variables passed by exact name: search path, home, locale, terminal, proxies and certificates. */
const ALLOWED_NAMES = new Set([
  'PATH',
  'HOME',
  'USER',
  'LANG',
  'TERM',
  'TMPDIR',
  'HTTPS_PROXY',
  'HTTP_PROXY',
  'NO_PROXY',
  // The lowercase spellings are the same proxy settings; many tools read only these.
  'https_proxy',
  'http_proxy',
  'no_proxy',
  'NODE_EXTRA_CA_CERTS',
]);

/** Locale, the model CLIs' own login and configuration variables, and this command's own. */
const ALLOWED_PREFIXES = ['LC_', 'ANTHROPIC_', 'CLAUDE_', 'OPENAI_', 'CODEX_', 'GEMINI_', 'GOOGLE_', 'AGY_', 'CTXR_SECOND_OPINION_'];

/** The forge and contexture prefixes, which take precedence over the pass-through (Revisions after critique, 1). */
export const PROTECTED_PREFIXES = ['GH_', 'GITHUB_', 'CONTEXTURE_'];

/** Names any further variables an operator chooses to pass through, comma- or space-separated. */
export const PASS_ENV_VARIABLE = 'CTXR_SECOND_OPINION_PASS_ENV';

export type SourceEnv = Readonly<Record<string, string | undefined>>;

/** The names listed in the pass-through variable, in order, without duplicates. */
export function passThroughNames(source: SourceEnv): string[] {
  const raw = source[PASS_ENV_VARIABLE] ?? '';
  return [...new Set(raw.split(/[\s,]+/).map((name) => name.trim()).filter(Boolean))];
}

/** Pass-through names that fall under a protected prefix; the command refuses to start while any is listed. */
export function protectedPassThroughNames(source: SourceEnv): string[] {
  return passThroughNames(source).filter((name) => PROTECTED_PREFIXES.some((prefix) => name.startsWith(prefix)));
}

function isAllowed(name: string, passThrough: ReadonlySet<string>): boolean {
  if (PROTECTED_PREFIXES.some((prefix) => name.startsWith(prefix))) return false;
  return ALLOWED_NAMES.has(name) || ALLOWED_PREFIXES.some((prefix) => name.startsWith(prefix)) || passThrough.has(name);
}

export interface ChildEnvironment {
  env: Record<string, string>;
  /** The names of variables set in the source but not passed on, sorted. Names only: never values. */
  withheld: string[];
}

/**
 * The environment every model CLI runs with. `PATH` gets the usual
 * user-install directories appended, so a CLI already on the search path
 * wins and these only rescue one installed under the home directory.
 */
export function childEnvironment(source: SourceEnv, home: string): ChildEnvironment {
  const passThrough = new Set(passThroughNames(source));
  const env: Record<string, string> = {};
  const withheld: string[] = [];
  for (const [name, value] of Object.entries(source)) {
    if (value === undefined) continue;
    if (isAllowed(name, passThrough)) env[name] = value;
    else withheld.push(name);
  }
  const extra = [path.join(home, '.local', 'bin'), path.join(home, '.local', 'share', 'node', 'bin')];
  env.PATH = [source.PATH ?? '', ...extra].filter(Boolean).join(path.delimiter);
  return { env, withheld: withheld.sort() };
}
