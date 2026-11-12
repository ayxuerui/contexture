import type { StoreConfig } from '../../config/schema.js';
import type { GitRunner } from '../git/exec.js';
import { mountingStoreOf } from '../shared-stores.js';
import { githubRepositoryOf } from '../forge/credentials.js';
import { worktreeDirNameFor } from '../session.js';
import { marker, parseMarker } from './decision.js';

/**
 * approve-sessions-across-stores (design.md D1, D2; the second critique's
 * revisions 2 and 3): a session's identity is its home store's forge slug
 * (`owner/repo`) and the home session's branch. It is derived from the
 * session's own branch, worktree and repository alone — no identity file.
 *
 * A joined session (one started inside a mount with `ctxr session start
 * --joins`) carries its home in its branch, `<prefix><owner>/<repo>/<home
 * branch without its prefix>`, and in its worktree directory, where `/` cannot
 * appear: `<prefix as a directory name><owner>--<repo>--<home branch without
 * its prefix>`. A GitHub owner never contains `--`, and a generated session
 * name never does, so the directory name splits back unambiguously. The
 * directory keeps the identity after `ctxr session submit --branch` renames
 * the branch.
 *
 * The pull request marker, appended by `ctxr session submit`, is what groups a
 * session's pull requests across stores; branch names never are.
 */
export const SESSION_MARKER = 'ctxr-session';

export interface SessionIdentity {
  /** The home store's forge repository slug, `owner/repo`. */
  home: string;
  /** The home session's branch, with the home store's prefix. */
  branch: string;
}

const SLUG = /^[^/\s]+\/[^/\s]+$/;
const NO_SPACE = /^\S+$/;

/** One string per session, for grouping and comparison. Branches cannot contain `:`, so it is unambiguous. */
export function sessionKey(identity: SessionIdentity): string {
  return `${identity.home}:${identity.branch}`;
}

export function parseSessionKey(key: string): SessionIdentity | null {
  const at = key.lastIndexOf(':');
  if (at <= 0) return null;
  const home = key.slice(0, at);
  const branch = key.slice(at + 1);
  return SLUG.test(home) && branch !== '' && NO_SPACE.test(branch) ? { home, branch } : null;
}

export function sessionsEqual(a: SessionIdentity | null, b: SessionIdentity | null): boolean {
  return a !== null && b !== null && a.home === b.home && a.branch === b.branch;
}

/** The marker `ctxr session submit` appends to a pull request body. */
export function sessionMarker(identity: SessionIdentity): string {
  return marker(SESSION_MARKER, { home: identity.home, branch: identity.branch });
}

/**
 * The session a pull request body names, or null — a body with no well-formed
 * marker ending it is a session of its own (write-lifecycle spec). Like the
 * decision marker, only a marker that ends the body counts.
 */
export function parseSessionMarker(body: string): SessionIdentity | null {
  const fields = parseMarker(SESSION_MARKER, body);
  if (fields === null) return null;
  const { home, branch } = fields;
  if (home === undefined || !SLUG.test(home) || branch === undefined || branch === '' || !NO_SPACE.test(branch)) return null;
  return { home, branch };
}

/** Any session marker anywhere in `body`, well-formed or not — what `ctxr session submit` refuses in an agent's body. */
export function findSessionMarker(body: string): string | null {
  const found = new RegExp(`<!--\\s*${SESSION_MARKER}\\b[^>]*?-->`).exec(body);
  return found === null ? null : found[0];
}

/**
 * The forge slug of a remote URL: GitHub's `owner/repo` for a github.com URL,
 * and otherwise the URL's last two path segments without `.git` — the same
 * shape for a mirror, a proxy, or a test's bare repository.
 */
export function forgeSlugOf(remoteUrl: string): string | null {
  const github = githubRepositoryOf(remoteUrl);
  if (github !== null) return github;
  const segments = remoteUrl
    .trim()
    .replace(/\/+$/, '')
    .replace(/\.git$/, '')
    .split(/[/:\\]/)
    .filter((s) => s !== '');
  if (segments.length < 2) return null;
  const slug = `${segments[segments.length - 2]}/${segments[segments.length - 1]}`;
  return SLUG.test(slug) ? slug : null;
}

/** The forge slug of the repository `cwd` is in, from its `origin`; null without one. */
export async function repositorySlug(git: GitRunner, cwd: string): Promise<string | null> {
  const remote = await git.run(['remote', 'get-url', 'origin'], { cwd, allowFailure: true });
  return remote.exitCode === 0 ? forgeSlugOf(remote.stdout) : null;
}

function withoutPrefix(branch: string, prefix: string): string {
  return branch.startsWith(prefix) ? branch.slice(prefix.length) : branch;
}

/** write-lifecycle spec: the joined session's branch — this store's prefix, the home slug, the home branch without its prefix. */
export function joinedBranchName(prefix: string, home: SessionIdentity, homePrefix: string): string {
  return `${prefix}${home.home}/${withoutPrefix(home.branch, homePrefix)}`;
}

/** The joined session's worktree directory name, which splits back into its home (see the module comment). */
export function joinedWorktreeName(prefix: string, home: SessionIdentity, homePrefix: string): string {
  const [owner, repo] = home.home.split('/') as [string, string];
  return `${worktreeDirNameFor(prefix)}${owner}--${repo}--${worktreeDirNameFor(withoutPrefix(home.branch, homePrefix))}`;
}

export interface IdentityInput {
  /** The branch prefix of the store the session is in. */
  prefix: string;
  /** The branch prefix of the store that mounts it, when it is a mount; else the store's own. */
  homePrefix: string;
  /** This store's own forge slug; null without an `origin`. */
  ownSlug: string | null;
  /** The session worktree's directory name. */
  worktreeName: string;
  /** The session's current branch. */
  branch: string;
}

/**
 * A session's identity, derived from its worktree and branch alone. The
 * worktree name decides first, because `ctxr session submit --branch` can
 * rename the branch to anything, including a name shaped like a joined one,
 * while the worktree keeps the name it was started with: a joined worktree
 * name carries its home, and any other session worktree is its own home. Only
 * a worktree whose name ctxr did not give falls back to the branch.
 */
export function sessionIdentityFor(input: IdentityInput): SessionIdentity | null {
  const dirPrefix = worktreeDirNameFor(input.prefix);
  if (input.worktreeName.startsWith(dirPrefix) && input.worktreeName.length > dirPrefix.length) {
    const rest = input.worktreeName.slice(dirPrefix.length);
    const first = rest.indexOf('--');
    const last = rest.lastIndexOf('--');
    if (first > 0 && last > first + 2 && last + 2 < rest.length) {
      return { home: `${rest.slice(0, first)}/${rest.slice(first + 2, last)}`, branch: `${input.homePrefix}${rest.slice(last + 2)}` };
    }
    if (input.ownSlug === null) return null;
    return { home: input.ownSlug, branch: `${input.prefix}${rest}` };
  }
  if (input.branch.startsWith(input.prefix)) {
    const joined = /^([^/]+)\/([^/]+)\/(.+)$/.exec(input.branch.slice(input.prefix.length));
    if (joined !== null) return { home: `${joined[1]}/${joined[2]}`, branch: `${input.homePrefix}${joined[3]}` };
  }
  if (input.ownSlug === null) return null;
  return { home: input.ownSlug, branch: input.branch };
}

/** The identity of the session checked out in `worktreePath`, reading only its repository and, for a mount, the mounting store's configuration. */
export async function identityOfWorktree(git: GitRunner, config: StoreConfig, worktreePath: string, worktreeName: string, branch: string): Promise<SessionIdentity | null> {
  const mounting = await mountingStoreOf(worktreePath);
  return sessionIdentityFor({
    prefix: config.session.branch_prefix,
    homePrefix: mounting?.config.session.branch_prefix ?? config.session.branch_prefix,
    ownSlug: await repositorySlug(git, worktreePath),
    worktreeName,
    branch,
  });
}

/** The approval route name of a session homed in a store: its home branch as a worktree directory name. */
export function sessionRouteName(identity: SessionIdentity): string {
  return worktreeDirNameFor(identity.branch);
}
