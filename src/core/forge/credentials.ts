import { createPrivateKey, sign, type KeyObject } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { ForgeCredentialsError } from '../errors.js';
import type { GitRunner } from '../git/exec.js';

/**
 * github-app-recording-identity (design.md D3): the one place every
 * forge-using command gets its credential from. `gh` is `gh`'s own credential
 * (`GH_TOKEN` or its credential file), as before. `github-app` is a GitHub App
 * owned by whoever runs the store, minting installation tokens from the App's
 * private key. `broker` is reserved for a hosted contexture App that would hold
 * the key centrally; nothing selects it yet, and adding it is one more provider
 * behind these same methods.
 */
export type CredentialKind = 'gh' | 'github-app' | 'broker';

export interface ForgeCredentials {
  kind: CredentialKind;
  /** The environment for the next `gh` call — the caller's own, with `GH_TOKEN` set to a fresh token in App mode. */
  env(): Promise<Readonly<Record<string, string | undefined>>>;
  /** The App's bot login (`<slug>[bot]`); null for `gh`, whose login the forge client asks `gh` for. */
  botLogin(): Promise<string | null>;
  /** A token for git's transport (design.md D4); null when git keeps whatever credential it has. */
  gitToken(): Promise<string | null>;
}

export const APP_ID_VAR = 'CONTEXTURE_GITHUB_APP_ID';
export const APP_KEY_FILE_VAR = 'CONTEXTURE_GITHUB_APP_PRIVATE_KEY_FILE';
export const APP_KEY_VAR = 'CONTEXTURE_GITHUB_APP_PRIVATE_KEY';
/** `owner/repo`, when the store's `origin` is not a github.com URL this module can read — a mirror, a proxy, a test server. */
export const APP_REPOSITORY_VAR = 'CONTEXTURE_GITHUB_REPOSITORY';
/** The API base; github.com's unless a GitHub-compatible test server is named. */
export const API_URL_VAR = 'CONTEXTURE_GITHUB_API_URL';

const DEFAULT_API_URL = 'https://api.github.com';
/** design.md D3: a token is replaced once less than this much of its life remains. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

type Env = Readonly<Record<string, string | undefined>>;

export type FetchLike = (
  url: string,
  init: { method?: string; headers: Record<string, string> },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>;

export interface ResolveOptions {
  env: Env;
  git: GitRunner;
  /** A directory inside the store's repository, for reading `origin`. */
  cwd: string;
  fetch?: FetchLike;
  now?: () => Date;
}

/** The credential source a command's forge calls go through, resolved from the command's own environment. */
export function credentialsFor(env: { env: Env; git: GitRunner; now(): Date }, cwd: string): Promise<ForgeCredentials> {
  return resolveForgeCredentials({ env: env.env, git: env.git, cwd, now: () => env.now() });
}

export function ghCredentials(env: Env): ForgeCredentials {
  return {
    kind: 'gh',
    env: async () => env,
    botLogin: async () => null,
    gitToken: async () => null,
  };
}

const set = (value: string | undefined): value is string => value !== undefined && value !== '';

/**
 * change-approval spec ("The recording identity may be a GitHub App with
 * credentials from the environment only"): App mode when the App ID and exactly
 * one key source are set, `gh` mode when none of them is, and a refusal for
 * anything in between — never a guessed precedence (design.md D1).
 */
export async function resolveForgeCredentials(opts: ResolveOptions): Promise<ForgeCredentials> {
  const appId = opts.env[APP_ID_VAR];
  const keyFile = opts.env[APP_KEY_FILE_VAR];
  const keyText = opts.env[APP_KEY_VAR];
  if (!set(appId) && !set(keyFile) && !set(keyText)) return ghCredentials(opts.env);

  if (set(keyFile) && set(keyText)) {
    throw new ForgeCredentialsError(`Both ${APP_KEY_FILE_VAR} and ${APP_KEY_VAR} are set; set one of them.`, [APP_KEY_FILE_VAR, APP_KEY_VAR]);
  }
  if (!set(appId)) throw new ForgeCredentialsError(`A GitHub App private key is set, but ${APP_ID_VAR} is not.`, [APP_ID_VAR]);
  if (!set(keyFile) && !set(keyText)) {
    throw new ForgeCredentialsError(`${APP_ID_VAR} is set, but neither ${APP_KEY_FILE_VAR} nor ${APP_KEY_VAR} is.`, [APP_KEY_FILE_VAR, APP_KEY_VAR]);
  }
  if (/\s/.test(appId)) throw new ForgeCredentialsError(`${APP_ID_VAR} must be the App's ID or client ID.`, [APP_ID_VAR]);

  let pem: string;
  if (set(keyFile)) {
    try {
      pem = await readFile(keyFile, 'utf8');
    } catch (err) {
      throw new ForgeCredentialsError(`${APP_KEY_FILE_VAR} names "${keyFile}", which cannot be read (${(err as NodeJS.ErrnoException).code ?? 'error'}).`, [APP_KEY_FILE_VAR]);
    }
  } else {
    pem = keyText!;
  }
  let key: KeyObject;
  try {
    key = createPrivateKey(pem);
  } catch {
    throw new ForgeCredentialsError('The GitHub App private key is not a readable PEM private key.', [set(keyFile) ? APP_KEY_FILE_VAR : APP_KEY_VAR]);
  }
  if (key.asymmetricKeyType !== 'rsa') {
    throw new ForgeCredentialsError('The GitHub App private key must be an RSA key, as GitHub generates.', [set(keyFile) ? APP_KEY_FILE_VAR : APP_KEY_VAR]);
  }

  return createAppCredentials({
    appId,
    key,
    env: opts.env,
    git: opts.git,
    cwd: opts.cwd,
    fetch: opts.fetch ?? ((url, init) => fetch(url, init)),
    now: opts.now ?? (() => new Date()),
  });
}

/** design.md D3: RS256, `iat` backdated 60 s for clock skew, `exp` nine minutes out (GitHub allows ten). */
export function appAssertion(appId: string, key: KeyObject, now: Date): string {
  const seconds = Math.floor(now.getTime() / 1000);
  const encode = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'RS256', typ: 'JWT' });
  // A numeric App ID goes in as a number; a client ID ("Iv1…") as the string it is. GitHub accepts either.
  const payload = encode({ iat: seconds - 60, exp: seconds + 9 * 60, iss: /^\d+$/.test(appId) ? Number(appId) : appId });
  const signature = sign('sha256', Buffer.from(`${header}.${payload}`), key).toString('base64url');
  return `${header}.${payload}.${signature}`;
}

/**
 * design.md D2: `owner/repo` from a github.com remote, https or ssh, with or
 * without `.git`. Anything else is not something App mode can address.
 */
export function githubRepositoryOf(remoteUrl: string): string | null {
  const patterns = [
    /^https:\/\/(?:[^@/]+@)?github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/,
    /^ssh:\/\/git@github\.com(?::\d+)?\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/,
    /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?\/?$/,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(remoteUrl.trim());
    if (match !== null) return `${match[1]}/${match[2]}`;
  }
  return null;
}

interface AppInputs {
  appId: string;
  key: KeyObject;
  env: Env;
  git: GitRunner;
  cwd: string;
  fetch: FetchLike;
  now: () => Date;
}

function createAppCredentials(inputs: AppInputs): ForgeCredentials {
  const apiUrl = (inputs.env[API_URL_VAR] || DEFAULT_API_URL).replace(/\/+$/, '');
  let cached: { token: string; expiresAt: number } | null = null;
  let inFlight: Promise<string> | null = null;
  let slug: string | null = null;

  async function appCall(method: string, route: string): Promise<unknown> {
    const response = await inputs.fetch(`${apiUrl}${route}`, {
      method,
      headers: {
        Authorization: `Bearer ${appAssertion(inputs.appId, inputs.key, inputs.now())}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'ctxr',
      },
    });
    if (response.ok) return response.json();
    const detail = (await response.text().catch(() => '')).slice(0, 300);
    return { __status: response.status, __detail: detail };
  }

  function failed(value: unknown): { status: number; detail: string } | null {
    if (typeof value === 'object' && value !== null && '__status' in value) {
      const v = value as { __status: number; __detail: string };
      return { status: v.__status, detail: v.__detail };
    }
    return null;
  }

  async function repository(): Promise<string> {
    const explicit = inputs.env[APP_REPOSITORY_VAR];
    if (set(explicit)) {
      if (!/^[^/\s]+\/[^/\s]+$/.test(explicit)) throw new ForgeCredentialsError(`${APP_REPOSITORY_VAR} must be "owner/repo".`, [APP_REPOSITORY_VAR]);
      return explicit;
    }
    const remote = await inputs.git.run(['remote', 'get-url', 'origin'], { cwd: inputs.cwd, allowFailure: true });
    const repo = remote.exitCode === 0 ? githubRepositoryOf(remote.stdout) : null;
    if (repo === null) {
      throw new ForgeCredentialsError(
        `GitHub App mode needs a github.com "origin" remote, and this store's is "${remote.stdout.trim() || 'not set'}". Set ${APP_REPOSITORY_VAR} to name the repository.`,
        [APP_REPOSITORY_VAR],
      );
    }
    return repo;
  }

  async function mint(): Promise<string> {
    const repo = await repository();
    const installation = await appCall('GET', `/repos/${repo}/installation`);
    const missing = failed(installation);
    if (missing !== null) {
      if (missing.status === 404) {
        throw new ForgeCredentialsError(`GitHub App ${inputs.appId} is not installed on ${repo}. Install it on that repository.`, [APP_ID_VAR]);
      }
      throw new ForgeCredentialsError(`GitHub refused GitHub App ${inputs.appId} (HTTP ${missing.status}): ${missing.detail}`, [APP_ID_VAR]);
    }
    const id = (installation as { id: number }).id;
    const issued = await appCall('POST', `/app/installations/${id}/access_tokens`);
    const refused = failed(issued);
    if (refused !== null) {
      throw new ForgeCredentialsError(`GitHub would not issue an installation token for ${repo} (HTTP ${refused.status}): ${refused.detail}`, [APP_ID_VAR]);
    }
    const { token, expires_at: expiresAt } = issued as { token: string; expires_at: string };
    cached = { token, expiresAt: Date.parse(expiresAt) };
    return token;
  }

  /** design.md D3: reuse while at least five minutes remain; one refresh in flight, however many callers ask. */
  async function token(): Promise<string> {
    if (cached !== null && cached.expiresAt - inputs.now().getTime() >= REFRESH_MARGIN_MS) return cached.token;
    inFlight ??= mint().finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  return {
    kind: 'github-app',
    async env() {
      return { ...inputs.env, GH_TOKEN: await token() };
    },
    async botLogin() {
      if (slug === null) {
        const app = await appCall('GET', '/app');
        const refused = failed(app);
        if (refused !== null) {
          throw new ForgeCredentialsError(`GitHub refused GitHub App ${inputs.appId}'s signed assertion (HTTP ${refused.status}): ${refused.detail}`, [APP_ID_VAR]);
        }
        slug = (app as { slug: string }).slug;
      }
      return `${slug}[bot]`;
    },
    gitToken: token,
  };
}
