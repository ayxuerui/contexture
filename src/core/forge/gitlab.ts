import type { FetchLike, ForgeCredentials, GitLabAccess } from './credentials.js';
import { ForgeRequestError, type ForgeClient, type IssueComment, type PullRequest, type Review } from './github.js';

/**
 * support-gitlab-as-a-forge (design.md D3, D5, D6): GitLab behind the same
 * `ForgeClient`, called over its HTTP API with `fetch` — no `glab`. A merge
 * request is reported in a pull request's fields, with its project-scoped
 * `iid` as the number.
 *
 * GitLab has no review that carries a body, so a decision is a note by the
 * recording identity: `createReview` posts one and `reviews` returns the
 * merge request's notes, which the decision readers filter by author and
 * marker exactly as they filter GitHub's reviews. An approval is then
 * mirrored as that identity's own GitLab approval, and a request for changes
 * withdraws it; the note stays the only record anything reads.
 *
 * The token goes in the `PRIVATE-TOKEN` header of requests to the one
 * configured host, and nowhere else.
 */
interface RawMergeRequest {
  iid: number;
  state: string;
  title: string;
  description: string | null;
  web_url: string;
  author: { username: string } | null;
  source_branch: string;
  target_branch: string;
  sha: string | null;
  detailed_merge_status?: string | null;
  merge_commit_sha?: string | null;
  squash_commit_sha?: string | null;
}

interface RawNote {
  body: string | null;
  author: { username: string } | null;
  created_at: string;
  system?: boolean;
}

/** GitLab's statuses for a merge request it has not finished checking. */
const STILL_CHECKING = new Set(['unchecked', 'checking', 'preparing', 'approvals_syncing']);
/** The statuses that mean the branches themselves do not merge; any other blocker is the merge call's to report. */
const CANNOT_MERGE = new Set(['conflict', 'need_rebase']);
const PAGE_SIZE = 100;
/** A bound on paging, so a forge that never returns a short page cannot hold a command forever. */
const MAX_PAGES = 50;

function toPull(raw: RawMergeRequest): PullRequest {
  const status = raw.detailed_merge_status ?? null;
  return {
    number: raw.iid,
    // `locked` is a merge in progress, which is still open to a reader.
    state: raw.state === 'opened' || raw.state === 'locked' ? 'open' : 'closed',
    merged: raw.state === 'merged',
    title: raw.title,
    body: raw.description ?? '',
    url: raw.web_url,
    author: raw.author?.username ?? '',
    headRef: raw.source_branch,
    headSha: raw.sha ?? '',
    baseRef: raw.target_branch,
    mergeable: status === null || STILL_CHECKING.has(status) ? null : !CANNOT_MERGE.has(status),
    // What the target branch's tip became: the merge commit, or the squash commit on a fast-forward project.
    mergeCommitSha: raw.merge_commit_sha ?? raw.squash_commit_sha ?? null,
  };
}

export function createGitLabForgeClient(credentials: ForgeCredentials, fetchImpl: FetchLike = (url, init) => fetch(url, init)): ForgeClient {
  const access: GitLabAccess = credentials.gitlab!;
  const via = `GitLab (${access.host})`;
  const project = `/projects/${encodeURIComponent(access.project)}`;

  async function call(route: string, opts: { method?: string; input?: unknown; raw?: boolean } = {}): Promise<unknown> {
    const token = access.token();
    const init: { method?: string; headers: Record<string, string>; body?: string } = {
      method: opts.method ?? 'GET',
      headers: { 'PRIVATE-TOKEN': token, Accept: 'application/json', 'User-Agent': 'ctxr' },
    };
    if (opts.input !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.input);
    }
    let response: Awaited<ReturnType<FetchLike>>;
    try {
      response = await fetchImpl(`${access.apiUrl}${route}`, init);
    } catch (err) {
      const cause = (err as { cause?: { message?: string } }).cause?.message;
      throw new ForgeRequestError(route, null, cause ?? (err as Error).message ?? String(err), via);
    }
    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 300).replaceAll(token, '[token]');
      throw new ForgeRequestError(route, response.status, detail, via);
    }
    if (opts.raw === true) return response.text();
    const text = await response.text();
    return text.trim() === '' ? null : JSON.parse(text);
  }

  /** Every page of a list route, in the forge's order. */
  async function list<T>(route: string): Promise<T[]> {
    const all: T[] = [];
    const join = route.includes('?') ? '&' : '?';
    for (let page = 1; page <= MAX_PAGES; page++) {
      const batch = (await call(`${route}${join}per_page=${PAGE_SIZE}&page=${page}`)) as T[];
      all.push(...batch);
      if (batch.length < PAGE_SIZE) break;
    }
    return all;
  }

  /** Notes people or ctxr wrote, oldest first; GitLab's own activity notes are never read (D5). */
  async function notes(number: number): Promise<RawNote[]> {
    return (await list<RawNote>(`${project}/merge_requests/${number}/notes?sort=asc&order_by=created_at`)).filter((note) => note.system !== true);
  }

  async function note(number: number, body: string): Promise<void> {
    await call(`${project}/merge_requests/${number}/notes`, { method: 'POST', input: { body } });
  }

  return {
    kind: 'gitlab',
    credential: credentials.kind,
    credentialOwner: credentials.owner,
    async login() {
      return ((await call('/user')) as { username: string }).username;
    },
    async pull(number) {
      return toPull((await call(`${project}/merge_requests/${number}`)) as RawMergeRequest);
    },
    async openPulls() {
      return (await list<RawMergeRequest>(`${project}/merge_requests?state=opened`)).map(toPull);
    },
    async pullsForHead(branch) {
      return (await list<RawMergeRequest>(`${project}/merge_requests?state=all&source_branch=${encodeURIComponent(branch)}`)).map(toPull);
    },
    async createPull(input) {
      return toPull(
        (await call(`${project}/merge_requests`, {
          method: 'POST',
          input: { source_branch: input.head, target_branch: input.base, title: input.title, description: input.body },
        })) as RawMergeRequest,
      );
    },
    async updatePull(number, input) {
      const body: Record<string, string> = {};
      if (input.title !== undefined) body.title = input.title;
      if (input.body !== undefined) body.description = input.body;
      if (input.state !== undefined) body.state_event = input.state === 'closed' ? 'close' : 'reopen';
      return toPull((await call(`${project}/merge_requests/${number}`, { method: 'PUT', input: body })) as RawMergeRequest);
    },
    async reviews(number): Promise<Review[]> {
      return (await notes(number)).map((n) => ({ author: n.author?.username ?? '', state: 'COMMENTED', body: n.body ?? '', commitId: null, submittedAt: n.created_at }));
    },
    async comments(number): Promise<IssueComment[]> {
      return (await notes(number)).map((n) => ({ author: n.author?.username ?? '', body: n.body ?? '', createdAt: n.created_at }));
    },
    async createReview(number, input) {
      await note(number, input.body);
      if (input.event === 'COMMENT') return { notMirrored: null };
      try {
        if (input.event === 'APPROVE') {
          await call(`${project}/merge_requests/${number}/approve`, { method: 'POST', input: { sha: input.commitId } });
        } else {
          await call(`${project}/merge_requests/${number}/unapprove`, { method: 'POST' });
        }
      } catch (err) {
        if (!(err instanceof ForgeRequestError)) throw err;
        // Withdrawing an approval that was never given is not a failure to mirror.
        if (input.event === 'REQUEST_CHANGES' && err.status === 404) return { notMirrored: null };
        return { notMirrored: err.message };
      }
      return { notMirrored: null };
    },
    async createComment(number, body) {
      await note(number, body);
    },
    async merge(number, input) {
      // D6: the request can ask for a squash or not, and nothing else; `rebase` is refused before this is reached.
      if (input.method === 'rebase') throw new ForgeRequestError(`${project}/merge_requests/${number}/merge`, null, 'GitLab cannot rebase-merge on request; merge_method must be squash or merge', via);
      await call(`${project}/merge_requests/${number}/merge`, { method: 'PUT', input: { sha: input.sha, squash: input.method === 'squash' } });
    },
    async fileAt(filePath, ref) {
      try {
        return (await call(`${project}/repository/files/${encodeURIComponent(filePath)}/raw?ref=${encodeURIComponent(ref)}`, { raw: true })) as string;
      } catch (err) {
        if (err instanceof ForgeRequestError && err.status === 404) return null;
        throw err;
      }
    },
  };
}
