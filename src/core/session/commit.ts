import type { GitResult, GitRunner } from '../git/exec.js';

/**
 * bring-the-session-lifecycle-into-the-cli D4: one commit call for both
 * surfaces. Locally it commits as the clone's own git identity, exactly as a
 * hand-run `git commit` does. The MCP surface passes an author override (the
 * member's verified email) with a trailer naming them, and the recording
 * login as committer when the host has no identity of its own — the same
 * fallback `ctxr land` uses. The store's hooks run either way.
 */
export interface CommitOptions {
  message: string;
  /** The commit's author, in place of the clone's identity. */
  author?: { name: string; email: string };
  /** A trailer paragraph, e.g. `Edited-by: <email>`. */
  trailer?: { key: string; value: string };
  /** The committer when neither git config nor the environment names one; omitted, git decides. */
  fallbackCommitter?: string;
}

/** The committer: the host's git identity when it has one, else the given login's noreply address. */
export async function committerEnv(git: GitRunner, cwd: string, env: Readonly<Record<string, string | undefined>>, login: string): Promise<Record<string, string>> {
  const email = (await git.run(['config', '--get', 'user.email'], { cwd, allowFailure: true })).stdout.trim();
  if (email !== '' || env.GIT_COMMITTER_EMAIL || env.EMAIL) return {};
  const address = `${login.replace(/\[bot\]$/, '')}@users.noreply.github.com`;
  return { GIT_COMMITTER_NAME: login, GIT_COMMITTER_EMAIL: address };
}

/** Commits what is staged in `cwd`. Resolves with git's result; the caller decides what a refusal means on its surface. */
export async function commitStaged(git: GitRunner, cwd: string, env: Readonly<Record<string, string | undefined>>, opts: CommitOptions): Promise<GitResult> {
  const identity: Record<string, string> = {};
  if (opts.fallbackCommitter !== undefined) Object.assign(identity, await committerEnv(git, cwd, env, opts.fallbackCommitter));
  if (opts.author !== undefined) Object.assign(identity, { GIT_AUTHOR_NAME: opts.author.name, GIT_AUTHOR_EMAIL: opts.author.email });
  const args = ['commit', '--quiet', '-m', opts.message];
  if (opts.trailer !== undefined) args.push('-m', `${opts.trailer.key}: ${opts.trailer.value}`);
  const overridden = Object.keys(identity).length > 0;
  return git.run(args, { cwd, allowFailure: true, ...(overridden ? { env: { ...env, ...identity } } : {}) });
}
