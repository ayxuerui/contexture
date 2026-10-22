import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { CredentialKind, ForgeCredentials } from './credentials.js';

const execFileAsync = promisify(execFile);

/**
 * approve-from-the-review-page (design.md D10): the forge, read and written
 * through `gh api` — the only module that spawns `gh`. Core code rather than
 * a revived `forge` adapter kind: there is one forge, and
 * session-keeps-only-what-git-cannot-do removed the seam for a second.
 *
 * `{owner}` and `{repo}` are `gh`'s own placeholders, filled from the
 * repository `cwd` sits in, so no remote URL is parsed here. `gh` reads its
 * credential (`GH_TOKEN`, or its own credential file) from the process that
 * runs it; nothing here touches a token.
 */
export interface PullRequest {
  number: number;
  state: 'open' | 'closed';
  merged: boolean;
  title: string;
  body: string;
  url: string;
  author: string;
  headRef: string;
  headSha: string;
  baseRef: string;
  /** null while the forge is still computing it. */
  mergeable: boolean | null;
  mergeCommitSha: string | null;
}

export interface Review {
  author: string;
  state: string;
  body: string;
  commitId: string | null;
  submittedAt: string | null;
}

export interface IssueComment {
  author: string;
  body: string;
  createdAt: string;
}

export type ReviewEvent = 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
export type MergeMethod = 'squash' | 'merge' | 'rebase';

export interface ForgeClient {
  /** The credential kind behind every call — reported by commands, never the credential itself. */
  credential: CredentialKind;
  login(): Promise<string>;
  pull(number: number): Promise<PullRequest>;
  openPulls(): Promise<PullRequest[]>;
  /** Every pull request, open or closed, whose head is `branch` in this repository. */
  pullsForHead(branch: string): Promise<PullRequest[]>;
  /** serve-the-store-over-mcp D9, D13: opens a pull request for `head` against `base`. */
  createPull(input: { head: string; base: string; title: string; body: string }): Promise<PullRequest>;
  reviews(number: number): Promise<Review[]>;
  comments(number: number): Promise<IssueComment[]>;
  createReview(number: number, input: { event: ReviewEvent; body: string; commitId: string }): Promise<void>;
  createComment(number: number, body: string): Promise<void>;
  merge(number: number, input: { method: MergeMethod; sha: string }): Promise<void>;
}

/** A `gh api` call that did not succeed. `status` is the HTTP status when `gh` reported one. */
export class ForgeRequestError extends Error {
  readonly status: number | null;
  constructor(endpoint: string, status: number | null, detail: string) {
    super(`forge request ${endpoint} failed${status === null ? '' : ` (HTTP ${status})`}: ${detail}`);
    this.name = 'ForgeRequestError';
    this.status = status;
  }
}

interface RawPull {
  number: number;
  state: 'open' | 'closed';
  merged?: boolean;
  merged_at?: string | null;
  title: string;
  body: string | null;
  html_url: string;
  user: { login: string } | null;
  head: { ref: string; sha: string };
  base: { ref: string };
  mergeable?: boolean | null;
  merge_commit_sha?: string | null;
}

function toPull(raw: RawPull): PullRequest {
  return {
    number: raw.number,
    state: raw.state,
    merged: raw.merged ?? (raw.merged_at !== undefined && raw.merged_at !== null),
    title: raw.title,
    body: raw.body ?? '',
    url: raw.html_url,
    author: raw.user?.login ?? '',
    headRef: raw.head.ref,
    headSha: raw.head.sha,
    baseRef: raw.base.ref,
    mergeable: raw.mergeable ?? null,
    mergeCommitSha: raw.merge_commit_sha ?? null,
  };
}

/**
 * `credentials` supplies the environment of every `gh` call: the caller's own
 * for `gh`'s credential, or with `GH_TOKEN` set to a fresh installation token
 * for a GitHub App (github-app-recording-identity D3) — fetched per call, so a
 * long-running server never uses an expired one.
 */
export function createGhForgeClient(cwd: string, credentials: ForgeCredentials): ForgeClient {
  async function api(endpoint: string, opts: { method?: string; input?: unknown } = {}): Promise<unknown> {
    const env = await credentials.env();
    const args = ['api', endpoint];
    if (opts.method !== undefined) args.push('--method', opts.method);
    if (opts.input !== undefined) args.push('--input', '-');
    try {
      const child = execFileAsync('gh', args, { cwd, env: env as NodeJS.ProcessEnv, maxBuffer: 64 * 1024 * 1024 });
      if (opts.input !== undefined) child.child.stdin?.end(JSON.stringify(opts.input));
      const { stdout } = await child;
      return stdout.trim() === '' ? null : JSON.parse(stdout);
    } catch (err) {
      const e = err as { stderr?: string; stdout?: string; message?: string };
      const detail = (e.stderr ?? '').trim() || (e.stdout ?? '').trim() || (e.message ?? String(err));
      const status = /\(HTTP (\d{3})\)/.exec(detail)?.[1];
      throw new ForgeRequestError(endpoint, status === undefined ? null : Number.parseInt(status, 10), detail);
    }
  }

  const repo = 'repos/{owner}/{repo}';
  return {
    credential: credentials.kind,
    async login() {
      // An installation token cannot call GET /user; an App's login is its bot login (change-approval spec).
      const bot = await credentials.botLogin();
      if (bot !== null) return bot;
      return ((await api('user')) as { login: string }).login;
    },
    async pull(number) {
      return toPull((await api(`${repo}/pulls/${number}`)) as RawPull);
    },
    async openPulls() {
      return ((await api(`${repo}/pulls?state=open&per_page=100`)) as RawPull[]).map(toPull);
    },
    async pullsForHead(branch) {
      return ((await api(`${repo}/pulls?state=all&per_page=100&head={owner}:${encodeURIComponent(branch)}`)) as RawPull[]).map(toPull);
    },
    async createPull(input) {
      return toPull((await api(`${repo}/pulls`, { method: 'POST', input: { head: input.head, base: input.base, title: input.title, body: input.body } })) as RawPull);
    },
    async reviews(number) {
      const raw = (await api(`${repo}/pulls/${number}/reviews?per_page=100`)) as {
        user: { login: string } | null;
        state: string;
        body: string | null;
        commit_id?: string | null;
        submitted_at?: string | null;
      }[];
      return raw.map((r) => ({
        author: r.user?.login ?? '',
        state: r.state,
        body: r.body ?? '',
        commitId: r.commit_id ?? null,
        submittedAt: r.submitted_at ?? null,
      }));
    },
    async comments(number) {
      const raw = (await api(`${repo}/issues/${number}/comments?per_page=100`)) as {
        user: { login: string } | null;
        body: string | null;
        created_at: string;
      }[];
      return raw.map((c) => ({ author: c.user?.login ?? '', body: c.body ?? '', createdAt: c.created_at }));
    },
    async createReview(number, input) {
      await api(`${repo}/pulls/${number}/reviews`, {
        method: 'POST',
        input: { event: input.event, body: input.body, commit_id: input.commitId },
      });
    },
    async createComment(number, body) {
      await api(`${repo}/issues/${number}/comments`, { method: 'POST', input: { body } });
    },
    async merge(number, input) {
      await api(`${repo}/pulls/${number}/merge`, { method: 'PUT', input: { merge_method: input.method, sha: input.sha } });
    },
  };
}
