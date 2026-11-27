import { createPrivateKey, hkdfSync, sign, type KeyObject } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { ForgeCredentialsError } from '../errors.js';
import type { GitResult, GitRunner } from '../git/exec.js';

/**
 * github-app-recording-identity (design.md D3): the one place every
 * forge-using command gets its credential from. `gh` is `gh`'s own credential
 * (`GH_TOKEN` or its credential file), as before. `github-app` is a GitHub App
 * owned by whoever runs the store, minting installation tokens from the App's
 * private key. `broker` is reserved for a hosted contexture App that would hold
 * the key centrally; nothing selects it yet, and adding it is one more provider
 * behind these same methods.
 *
 * reach-each-owner-with-its-own-token: `owner-token` is a fine-grained token
 * for one GitHub owner, read from that owner's file in the directory
 * `CONTEXTURE_GITHUB_OWNER_TOKENS_DIR` names, for that owner's repositories
 * only (design.md D1-D3).
 */
export type CredentialKind = 'gh' | 'github-app' | 'owner-token' | 'gitlab-token' | 'broker';

/** support-gitlab-as-a-forge D4: what a GitLab client needs from the credential, beside the kind. */
export interface GitLabAccess {
  /** The GitLab host, as the environment or the default names it. */
  host: string;
  /** `https://<host>/api/v4`. */
  apiUrl: string;
  /** The project's full path, subgroups included. */
  project: string;
  /** The token, or a refusal naming the variables when none is set. Never logged or reported. */
  token(): string;
}

export interface ForgeCredentials {
  kind: CredentialKind;
  /** The GitHub owner whose token this is, for `owner-token`; null otherwise. Reported beside the kind, never the token. */
  owner: string | null;
  /** The environment for the next `gh` call — the caller's own, with `GH_TOKEN` set to a fresh token in App mode. */
  env(): Promise<Readonly<Record<string, string | undefined>>>;
  /** The App's bot login (`<slug>[bot]`); null for `gh`, whose login the forge client asks `gh` for. */
  botLogin(): Promise<string | null>;
  /** A token for git's transport (design.md D4); null when git keeps whatever credential it has. */
  gitToken(): Promise<string | null>;
  /**
   * serve-the-store-over-mcp design.md D5: 32 bytes derived (HKDF-SHA256) from
   * the App's private key for `info`, so a secret stable across restarts needs
   * no key of its own and rotates with the App's. Null with `gh`'s credential,
   * which has no key to derive from. The key itself never leaves this module.
   */
  derivedSecret(info: string): Buffer | null;
  /** Set for a repository on the GitLab host (support-gitlab-as-a-forge); absent for every other. */
  gitlab?: GitLabAccess;
}

export const APP_ID_VAR = 'CONTEXTURE_GITHUB_APP_ID';
export const APP_KEY_FILE_VAR = 'CONTEXTURE_GITHUB_APP_PRIVATE_KEY_FILE';
export const APP_KEY_VAR = 'CONTEXTURE_GITHUB_APP_PRIVATE_KEY';
/** `owner/repo`, when the store's `origin` is not a github.com URL this module can read — a mirror, a proxy, a test server. */
export const APP_REPOSITORY_VAR = 'CONTEXTURE_GITHUB_REPOSITORY';
/** The API base; github.com's unless a GitHub-compatible test server is named. */
export const API_URL_VAR = 'CONTEXTURE_GITHUB_API_URL';
/** reach-each-owner-with-its-own-token D1: a directory holding one token file per GitHub owner, named after the owner. */
export const OWNER_TOKENS_DIR_VAR = 'CONTEXTURE_GITHUB_OWNER_TOKENS_DIR';

/** support-gitlab-as-a-forge D2: the one GitLab host; `gitlab.com` when unset. */
export const GITLAB_HOST_VAR = 'CONTEXTURE_GITLAB_HOST';
/** support-gitlab-as-a-forge D4: the GitLab token, as text or as a file; setting both is refused. */
export const GITLAB_TOKEN_VAR = 'CONTEXTURE_GITLAB_TOKEN';
export const GITLAB_TOKEN_FILE_VAR = 'CONTEXTURE_GITLAB_TOKEN_FILE';
const DEFAULT_GITLAB_HOST = 'gitlab.com';

const DEFAULT_API_URL = 'https://api.github.com';
/** design.md D3: a token is replaced once less than this much of its life remains. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

type Env = Readonly<Record<string, string | undefined>>;

export type FetchLike = (
  url: string,
  init: { method?: string; headers: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>;

export interface ResolveOptions {
  env: Env;
  git: GitRunner;
  /** A directory inside the store's repository, for reading `origin`. */
  cwd: string;
  /**
   * The repository's URL, when there is no clone to read `origin` from yet: a
   * mount before `shared-stores sync` clones it (reach-each-owner-with-its-own-token D2).
   */
  url?: string;
  fetch?: FetchLike;
  now?: () => Date;
}

/**
 * The credential source a command's forge calls go through, resolved from the
 * command's own environment, for the repository `cwd` is in — or, given `url`,
 * for the repository at that URL.
 */
export function credentialsFor(env: { env: Env; git: GitRunner; now(): Date }, cwd: string, url?: string): Promise<ForgeCredentials> {
  return resolveForgeCredentials({ env: env.env, git: env.git, cwd, ...(url === undefined ? {} : { url }), now: () => env.now() });
}

export function ghCredentials(env: Env): ForgeCredentials {
  return {
    kind: 'gh',
    owner: null,
    env: async () => env,
    botLogin: async () => null,
    gitToken: async () => null,
    derivedSecret: () => null,
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
  // support-gitlab-as-a-forge D1: a repository on the GitLab host never reads the GitHub variables.
  const declared = opts.url ?? (await originUrl(opts.git, opts.cwd));
  const forge = declared === null ? null : forgeOf(declared, opts.env);
  if (forge?.kind === 'gitlab') return gitlabCredentials(opts.env, forge);

  const appId = opts.env[APP_ID_VAR];
  const keyFile = opts.env[APP_KEY_FILE_VAR];
  const keyText = opts.env[APP_KEY_VAR];
  // reach-each-owner-with-its-own-token D6: App mode never reads the owner tokens directory.
  if (!set(appId) && !set(keyFile) && !set(keyText)) return ownerOrGhCredentials(opts);

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
    url: opts.url,
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

/** The GitLab host this environment names, lower-cased; `gitlab.com` when it names none. */
export function gitlabHostOf(env: Env): string {
  const named = env[GITLAB_HOST_VAR];
  return set(named) ? named.trim().toLowerCase() : DEFAULT_GITLAB_HOST;
}

export type ForgeKind = 'github' | 'gitlab';

export interface ForgeLocation {
  kind: ForgeKind;
  host: string;
  /** `owner/repo` on GitHub; the project's full path on GitLab. */
  slug: string;
}

/** The host (with any port) and path of an https, ssh or scp-style remote URL; null for anything else, a local path included. */
function hostAndPath(remoteUrl: string): { host: string; path: string } | null {
  const url = remoteUrl.trim();
  const full = /^(?:https|ssh):\/\/(?:[^@/]+@)?([^/]+)\/(.+)$/.exec(url);
  const scp = full === null ? /^[^@/\s]+@([^:/\s]+):(?!\/)(.+)$/.exec(url) : null;
  const match = full ?? scp;
  if (match === null) return null;
  const path = match[2]!.replace(/\/+$/, '').replace(/\.git$/, '');
  return { host: match[1]!.toLowerCase(), path };
}

/**
 * support-gitlab-as-a-forge D1: the forge a remote URL is on. `github.com` is
 * GitHub; the GitLab host is GitLab, and its slug is the whole project path.
 * Null for any other URL, which is then handled as it always was.
 */
export function forgeOf(remoteUrl: string, env: Env): ForgeLocation | null {
  const github = githubRepositoryOf(remoteUrl);
  if (github !== null) return { kind: 'github', host: 'github.com', slug: github };
  const parsed = hostAndPath(remoteUrl);
  if (parsed === null) return null;
  const host = gitlabHostOf(env);
  // An ssh URL may carry a port the https host does not, so the host name alone decides there.
  if (parsed.host !== host && parsed.host.replace(/:\d+$/, '') !== host.replace(/:\d+$/, '')) return null;
  const segments = parsed.path.split('/');
  if (segments.length < 2 || segments.some((segment) => segment === '' || /\s/.test(segment))) return null;
  return { kind: 'gitlab', host, slug: segments.join('/') };
}

/**
 * support-gitlab-as-a-forge D4: the token in the file one variable names, or
 * the text of the other. Both set, or a file that cannot be read or is empty,
 * is refused naming the variables. Neither set is not refused here: git may
 * reach the repository with its own credential, and only a call that needs
 * GitLab's API asks for the token.
 */
async function gitlabCredentials(env: Env, forge: ForgeLocation): Promise<ForgeCredentials> {
  const text = env[GITLAB_TOKEN_VAR];
  const file = env[GITLAB_TOKEN_FILE_VAR];
  if (set(text) && set(file)) {
    throw new ForgeCredentialsError(`Both ${GITLAB_TOKEN_VAR} and ${GITLAB_TOKEN_FILE_VAR} are set; set one of them.`, [GITLAB_TOKEN_VAR, GITLAB_TOKEN_FILE_VAR]);
  }
  let token: string | null = set(text) ? text.trim() : null;
  if (set(file)) {
    try {
      token = (await readFile(file, 'utf8')).trim();
    } catch (err) {
      throw new ForgeCredentialsError(`${GITLAB_TOKEN_FILE_VAR} names "${file}", which cannot be read (${(err as NodeJS.ErrnoException).code ?? 'error'}).`, [GITLAB_TOKEN_FILE_VAR]);
    }
    if (token === '') throw new ForgeCredentialsError(`${GITLAB_TOKEN_FILE_VAR} names "${file}", which is empty.`, [GITLAB_TOKEN_FILE_VAR]);
  }
  if (token === '') token = null;
  const held = token;
  return {
    kind: 'gitlab-token',
    owner: null,
    env: async () => env,
    botLogin: async () => null,
    // GitLab takes the token as the password of an https request with any username, so `runRemoteGit`'s helper serves as it is.
    gitToken: async () => held,
    derivedSecret: (info) => (held === null ? null : Buffer.from(hkdfSync('sha256', Buffer.from(held, 'utf8'), Buffer.alloc(0), Buffer.from(info, 'utf8'), 32))),
    gitlab: {
      host: forge.host,
      apiUrl: `https://${forge.host}/api/v4`,
      project: forge.slug,
      token() {
        if (held === null) {
          throw new ForgeCredentialsError(
            `GitLab's API on ${forge.host} needs a token, and neither ${GITLAB_TOKEN_VAR} nor ${GITLAB_TOKEN_FILE_VAR} is set.`,
            [GITLAB_TOKEN_VAR, GITLAB_TOKEN_FILE_VAR],
          );
        }
        return held;
      },
    },
  };
}

/** The owner of a github.com repository URL, as `githubRepositoryOf` reads it; null for any other URL (design.md D2). */
export function githubOwnerOf(remoteUrl: string): string | null {
  return githubRepositoryOf(remoteUrl)?.split('/')[0] ?? null;
}

/**
 * reach-each-owner-with-its-own-token D2: a clone's `origin` as configured,
 * before any `url.<base>.insteadOf` rewriting — the URL the store declared,
 * whose owner is the one GitHub enforces. Null when there is none.
 */
async function originUrl(git: GitRunner, cwd: string): Promise<string | null> {
  const remote = await git.run(['config', '--get', 'remote.origin.url'], { cwd, allowFailure: true });
  return remote.exitCode === 0 && remote.stdout.trim() !== '' ? remote.stdout.trim() : null;
}

/**
 * reach-each-owner-with-its-own-token D1, D5: outside App mode, the token in
 * the file named after the repository's owner, compared without regard to
 * case, when `CONTEXTURE_GITHUB_OWNER_TOKENS_DIR` is set and holds one;
 * otherwise `gh`'s own credential, exactly as before. A directory that cannot
 * be read, an owner file that cannot be read or is empty, and two names that
 * differ only by case are refused, naming the variable or the paths and never
 * a token. A missing file is not an error: `gh`'s credential may reach the
 * repository.
 */
async function ownerOrGhCredentials(opts: ResolveOptions): Promise<ForgeCredentials> {
  const dir = opts.env[OWNER_TOKENS_DIR_VAR];
  if (!set(dir)) return ghCredentials(opts.env);

  let names: string[];
  try {
    names = await readdir(dir);
  } catch (err) {
    throw new ForgeCredentialsError(
      `${OWNER_TOKENS_DIR_VAR} names "${dir}", which is not a readable directory (${(err as NodeJS.ErrnoException).code ?? 'error'}).`,
      [OWNER_TOKENS_DIR_VAR],
    );
  }
  const url = opts.url ?? (await originUrl(opts.git, opts.cwd));
  const owner = url === null ? null : githubOwnerOf(url);
  if (owner === null) return ghCredentials(opts.env);

  const matching = names.filter((name) => name.toLowerCase() === owner.toLowerCase()).sort();
  if (matching.length === 0) return ghCredentials(opts.env);
  const files = matching.map((name) => path.join(dir, name));
  if (files.length > 1) {
    throw new ForgeCredentialsError(
      `${OWNER_TOKENS_DIR_VAR} holds ${files.map((f) => `"${f}"`).join(' and ')}, whose names differ only by case; keep one token file for GitHub owner ${owner}.`,
      [OWNER_TOKENS_DIR_VAR],
    );
  }
  const file = files[0]!;
  let token: string;
  try {
    token = (await readFile(file, 'utf8')).trim();
  } catch (err) {
    throw new ForgeCredentialsError(`The token file "${file}" for GitHub owner ${owner} cannot be read (${(err as NodeJS.ErrnoException).code ?? 'error'}).`, [OWNER_TOKENS_DIR_VAR]);
  }
  if (token === '') throw new ForgeCredentialsError(`The token file "${file}" for GitHub owner ${owner} is empty.`, [OWNER_TOKENS_DIR_VAR]);
  return ownerTokenCredentials(opts.env, owner, token);
}

/**
 * reach-each-owner-with-its-own-token D3: one token for both sides of the
 * forge — `GH_TOKEN` in each `gh` call's environment only, and the same token
 * to git through `runRemoteGit`'s command-line helper.
 */
function ownerTokenCredentials(env: Env, owner: string, token: string): ForgeCredentials {
  return {
    kind: 'owner-token',
    owner,
    env: async () => ({ ...env, GH_TOKEN: token }),
    botLogin: async () => null,
    gitToken: async () => token,
    derivedSecret: () => null,
  };
}

interface AppInputs {
  appId: string;
  key: KeyObject;
  env: Env;
  git: GitRunner;
  cwd: string;
  /** The repository's URL when it has no clone yet; otherwise its installation is found from `origin`. */
  url: string | undefined;
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
    if (inputs.url !== undefined) {
      const declared = githubRepositoryOf(inputs.url);
      if (declared === null) {
        throw new ForgeCredentialsError(`GitHub App mode needs a github.com repository, and "${inputs.url}" is not one. Set ${APP_REPOSITORY_VAR} to name the repository.`, [APP_REPOSITORY_VAR]);
      }
      return declared;
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
    owner: null,
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
    derivedSecret(info) {
      const material = inputs.key.export({ type: 'pkcs8', format: 'der' });
      return Buffer.from(hkdfSync('sha256', material, Buffer.alloc(0), Buffer.from(info, 'utf8'), 32));
    },
  };
}

/**
 * write-lifecycle spec ("In App mode, landing's git transport authenticates as
 * the App"; design.md D4): a fetch or push against `origin`. With an App, the
 * host's credential helpers are cleared for this one command and replaced by
 * one that answers with the installation token, read from this process's
 * environment only — never a remote URL, a config file, or the command line.
 * Otherwise git uses the credential it already has. Shared by `ctxr land` and
 * the MCP surface's fetch and push (serve-the-store-over-mcp D6, D9).
 *
 * reach-each-owner-with-its-own-token D3, D4: an owner's token reaches git
 * the same way, and every fetch, push, `ls-remote` and clone ctxr runs goes
 * through here, so `gh` and git use one token for one repository.
 */
const TOKEN_HELPER = '!f() { echo username=x-access-token; echo "password=$CTXR_GIT_TOKEN"; }; f';

export async function runRemoteGit(
  git: GitRunner,
  credentials: ForgeCredentials,
  env: Env,
  args: readonly string[],
  opts: { cwd: string; allowFailure?: boolean },
): Promise<GitResult> {
  const token = await credentials.gitToken();
  if (token === null) return git.run(args, opts);
  return git.run(['-c', 'credential.helper=', '-c', `credential.helper=${TOKEN_HELPER}`, ...args], {
    ...opts,
    env: { ...env, CTXR_GIT_TOKEN: token, GIT_TERMINAL_PROMPT: '0' },
  });
}
