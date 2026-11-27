import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { decisionBody, landingBody, resolveReviewState } from '../../src/core/approval/decision.js';
import { ForgeCredentialsError, ForgeUnreachableError } from '../../src/core/errors.js';
import { forgeClientFor } from '../../src/core/forge/client.js';
import { forgeOf, resolveForgeCredentials, runRemoteGit, type FetchLike } from '../../src/core/forge/credentials.js';
import { ForgeRequestError } from '../../src/core/forge/github.js';
import type { GitRunner } from '../../src/core/git/exec.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

const TOKEN = 'glpat-ctxaSECRETtokenvalue';
const HEAD = 'a'.repeat(40);

function originGit(url: string): GitRunner & { calls: { args: string[]; env?: Readonly<Record<string, string | undefined>> }[] } {
  const calls: { args: string[]; env?: Readonly<Record<string, string | undefined>> }[] = [];
  return { calls, run: async (args, opts) => (calls.push({ args: [...args], env: opts.env }), { stdout: `${url}\n`, stderr: '', exitCode: 0 }) };
}

interface Call {
  method: string;
  url: string;
  token: string | undefined;
  body: unknown;
}

/** A fake GitLab: answers by `METHOD path` (query included), records every call, and 404s anything it was not given. */
function fakeGitLab(routes: Record<string, { status?: number; json?: unknown; text?: string }>): { fetch: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init) => {
    const u = new URL(url);
    calls.push({ method: init.method ?? 'GET', url, token: init.headers['PRIVATE-TOKEN'], body: init.body === undefined ? undefined : JSON.parse(init.body) });
    const answer = routes[`${init.method ?? 'GET'} ${u.pathname}${u.search}`] ?? routes[`${init.method ?? 'GET'} ${u.pathname}`];
    const status = answer?.status ?? (answer === undefined ? 404 : 200);
    const text = answer?.text ?? (answer?.json === undefined ? '{"message":"404 Not found"}' : JSON.stringify(answer.json));
    return { ok: status >= 200 && status < 300, status, json: async () => JSON.parse(text), text: async () => text };
  };
  return { fetch, calls };
}

const P = '/api/v4/projects/ctx-a%2Fteam%2Fwork';
const MR = {
  iid: 7,
  state: 'opened',
  title: 'Add ctx-a',
  description: 'Why: ctx-a.',
  web_url: 'https://gitlab.com/ctx-a/team/work/-/merge_requests/7',
  author: { username: 'ctx-agent' },
  source_branch: 'session/ctx-a',
  target_branch: 'main',
  sha: HEAD,
  detailed_merge_status: 'mergeable',
  merge_commit_sha: null,
  squash_commit_sha: null,
};

async function client(routes: Parameters<typeof fakeGitLab>[0], env: Record<string, string> = { CONTEXTURE_GITLAB_TOKEN: TOKEN }) {
  const credentials = await resolveForgeCredentials({ env, git: originGit('https://gitlab.com/ctx-a/team/work.git'), cwd: '/' });
  const gitlab = fakeGitLab(routes);
  return { forge: forgeClientFor('/', credentials, gitlab.fetch), calls: gitlab.calls, credentials };
}

describe('forge recognition (support-gitlab-as-a-forge D1, D2)', () => {
  it('reads the forge from the URL: github.com, the GitLab host, or neither', () => {
    expect(forgeOf('https://github.com/example/ctx-a.git', {})).toEqual({ kind: 'github', host: 'github.com', slug: 'example/ctx-a' });
    expect(forgeOf('https://gitlab.com/ctx-a/work.git', {})).toEqual({ kind: 'gitlab', host: 'gitlab.com', slug: 'ctx-a/work' });
    expect(forgeOf('git@gitlab.com:ctx-a/team/work.git', {})).toEqual({ kind: 'gitlab', host: 'gitlab.com', slug: 'ctx-a/team/work' });
    expect(forgeOf('ssh://git@gitlab.com:2222/ctx-a/work', {})?.slug).toBe('ctx-a/work');
    expect(forgeOf('https://oauth2:x@GitLab.com/ctx-a/work/', {})?.slug).toBe('ctx-a/work');
    // A host nobody named is never assumed to be GitLab.
    expect(forgeOf('https://gitlab.example.com/ctx-a/work.git', {})).toBeNull();
    expect(forgeOf('https://gitlab.example.com/ctx-a/work.git', { CONTEXTURE_GITLAB_HOST: 'gitlab.example.com' })).toMatchObject({ kind: 'gitlab', host: 'gitlab.example.com' });
    // Naming another host leaves gitlab.com unrecognized: one host per deployment.
    expect(forgeOf('https://gitlab.com/ctx-a/work.git', { CONTEXTURE_GITLAB_HOST: 'gitlab.example.com' })).toBeNull();
    expect(forgeOf('/tmp/x/example/ctx-b.git', {})).toBeNull();
    expect(forgeOf('https://gitlab.com/ctx-a', {})).toBeNull();
    // http is not recognized: the token only ever travels over https.
    expect(forgeOf('http://gitlab.com/ctx-a/work.git', {})).toBeNull();
  });
});

describe('the GitLab token (support-gitlab-as-a-forge D4)', () => {
  it('comes from the variable or the file it names, is reported by kind only, and never reads the GitHub variables', async () => {
    const tmp = await makeTmpDir();
    try {
      const file = path.join(tmp.root, 'token');
      await writeFile(file, `${TOKEN}\n`);
      const git = originGit('https://gitlab.com/ctx-a/work.git');
      const fromFile = await resolveForgeCredentials({ env: { CONTEXTURE_GITLAB_TOKEN_FILE: file, CONTEXTURE_GITHUB_APP_ID: '1' }, git, cwd: '/' });
      expect(fromFile.kind).toBe('gitlab-token');
      expect(fromFile.owner).toBeNull();
      expect(await fromFile.gitToken()).toBe(TOKEN);
      expect(fromFile.gitlab).toMatchObject({ host: 'gitlab.com', apiUrl: 'https://gitlab.com/api/v4', project: 'ctx-a/work' });
      expect(JSON.stringify(fromFile)).not.toContain(TOKEN);
      expect(fromFile.derivedSecret('x')).toHaveLength(32);
      expect(fromFile.derivedSecret('x')).toEqual(fromFile.derivedSecret('x'));
      expect(fromFile.derivedSecret('x')).not.toEqual(fromFile.derivedSecret('y'));

      const refused = async (env: Record<string, string>) => resolveForgeCredentials({ env, git, cwd: '/' }).catch((err: unknown) => err);
      const both = (await refused({ CONTEXTURE_GITLAB_TOKEN: TOKEN, CONTEXTURE_GITLAB_TOKEN_FILE: file })) as ForgeCredentialsError;
      expect(both).toBeInstanceOf(ForgeCredentialsError);
      expect(both.message).toContain('CONTEXTURE_GITLAB_TOKEN_FILE');
      expect(both.message).not.toContain(TOKEN);
      expect(await refused({ CONTEXTURE_GITLAB_TOKEN_FILE: path.join(tmp.root, 'missing') })).toBeInstanceOf(ForgeCredentialsError);
      await writeFile(file, '\n');
      expect(await refused({ CONTEXTURE_GITLAB_TOKEN_FILE: file })).toBeInstanceOf(ForgeCredentialsError);
    } finally {
      await tmp.cleanup();
    }
  });

  it('with no token leaves git alone, and names both variables before any API request', async () => {
    const git = originGit('git@gitlab.com:ctx-a/team/work.git');
    const credentials = await resolveForgeCredentials({ env: {}, git, cwd: '/' });
    expect(credentials.kind).toBe('gitlab-token');
    expect(await credentials.gitToken()).toBeNull();
    expect(credentials.derivedSecret('x')).toBeNull();
    await runRemoteGit(git, credentials, {}, ['fetch', 'origin'], { cwd: '/' });
    expect(git.calls.at(-1)).toEqual({ args: ['fetch', 'origin'], env: undefined });

    const gitlab = fakeGitLab({});
    const error = await forgeClientFor('/', credentials, gitlab.fetch).openPulls().catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ForgeCredentialsError);
    expect((error as Error).message).toMatch(/CONTEXTURE_GITLAB_TOKEN.*CONTEXTURE_GITLAB_TOKEN_FILE/);
    expect(gitlab.calls).toEqual([]);
  });

  it('reaches git through the one-command helper, never the URL or the command line', async () => {
    const git = originGit('https://gitlab.com/ctx-a/work.git');
    const credentials = await resolveForgeCredentials({ env: { CONTEXTURE_GITLAB_TOKEN: TOKEN }, git, cwd: '/' });
    await runRemoteGit(git, credentials, {}, ['push', 'origin', 'session/ctx-a'], { cwd: '/' });
    const call = git.calls.at(-1)!;
    expect(call.args.join(' ')).not.toContain(TOKEN);
    expect(call.env?.CTXR_GIT_TOKEN).toBe(TOKEN);
  });
});

describe('the GitLab forge client (support-gitlab-as-a-forge D3, D5, D6)', () => {
  it('reads merge requests in a pull request’s fields, addressing a subgroup project by its full path', async () => {
    const { forge, calls } = await client({
      'GET /api/v4/user': { json: { id: 3, username: 'ctx-a-approvals' } },
      [`GET ${P}/merge_requests/7`]: { json: MR },
      [`GET ${P}/merge_requests?state=opened&per_page=100&page=1`]: { json: [MR] },
      [`GET ${P}/merge_requests?state=all&source_branch=session%2Fctx-a&per_page=100&page=1`]: { json: [{ ...MR, state: 'merged', merge_commit_sha: 'b'.repeat(40) }] },
    });
    expect(forge.kind).toBe('gitlab');
    expect(forge.credential).toBe('gitlab-token');
    expect(await forge.login()).toBe('ctx-a-approvals');
    expect(await forge.pull(7)).toEqual({
      number: 7,
      state: 'open',
      merged: false,
      title: 'Add ctx-a',
      body: 'Why: ctx-a.',
      url: MR.web_url,
      author: 'ctx-agent',
      headRef: 'session/ctx-a',
      headSha: HEAD,
      baseRef: 'main',
      mergeable: true,
      mergeCommitSha: null,
    });
    expect((await forge.openPulls()).map((p) => p.number)).toEqual([7]);
    expect(await forge.pullsForHead('session/ctx-a')).toEqual([expect.objectContaining({ state: 'closed', merged: true, mergeCommitSha: 'b'.repeat(40) })]);
    expect(calls.every((c) => c.token === TOKEN && c.url.startsWith('https://gitlab.com/api/v4/'))).toBe(true);
  });

  it('reads every page of a list', async () => {
    const page = (from: number, count: number) => Array.from({ length: count }, (_, i) => ({ ...MR, iid: from + i }));
    const { forge } = await client({
      [`GET ${P}/merge_requests?state=opened&per_page=100&page=1`]: { json: page(1, 100) },
      [`GET ${P}/merge_requests?state=opened&per_page=100&page=2`]: { json: page(101, 3) },
    });
    expect(await forge.openPulls()).toHaveLength(103);
  });

  it('maps the merge status: still checking is null, a conflict is false, any other blocker is the merge call’s to report', async () => {
    const status = async (detailed_merge_status: string) => (await client({ [`GET ${P}/merge_requests/7`]: { json: { ...MR, detailed_merge_status } } })).forge.pull(7).then((p) => p.mergeable);
    expect(await status('checking')).toBeNull();
    expect(await status('unchecked')).toBeNull();
    expect(await status('conflict')).toBe(false);
    expect(await status('not_approved')).toBe(true);
  });

  it('opens, updates and closes a merge request', async () => {
    const { forge, calls } = await client({ [`POST ${P}/merge_requests`]: { status: 201, json: MR }, [`PUT ${P}/merge_requests/7`]: { json: { ...MR, state: 'closed' } } });
    expect((await forge.createPull({ head: 'session/ctx-a', base: 'main', title: 'Add ctx-a', body: 'Why: ctx-a.' })).number).toBe(7);
    expect(calls[0]!.body).toEqual({ source_branch: 'session/ctx-a', target_branch: 'main', title: 'Add ctx-a', description: 'Why: ctx-a.' });
    await forge.updatePull(7, { title: 'New', body: 'B' });
    expect(calls[1]!.body).toEqual({ title: 'New', description: 'B' });
    expect((await forge.updatePull(7, { state: 'closed' })).state).toBe('closed');
    expect(calls[2]!.body).toEqual({ state_event: 'close' });
  });

  it('returns people’s notes as both reviews and comments, and never GitLab’s own activity notes', async () => {
    const { forge } = await client({
      [`GET ${P}/merge_requests/7/notes?sort=asc&order_by=created_at&per_page=100&page=1`]: {
        json: [
          { body: 'approved the merge request', author: { username: 'ctx-a-approvals' }, created_at: '2026-10-23T07:00:00Z', system: true },
          { body: 'a decision', author: { username: 'ctx-a-approvals' }, created_at: '2026-10-23T07:01:00Z', system: false },
        ],
      },
    });
    expect(await forge.reviews(7)).toEqual([{ author: 'ctx-a-approvals', state: 'COMMENTED', body: 'a decision', commitId: null, submittedAt: '2026-10-23T07:01:00Z' }]);
    expect(await forge.comments(7)).toEqual([{ author: 'ctx-a-approvals', body: 'a decision', createdAt: '2026-10-23T07:01:00Z' }]);
  });

  it('records an approval as a note, then mirrors it as an approval of that head', async () => {
    const { forge, calls } = await client({ [`POST ${P}/merge_requests/7/notes`]: { status: 201, json: {} }, [`POST ${P}/merge_requests/7/approve`]: { status: 201, json: {} } });
    expect(await forge.createReview(7, { event: 'APPROVE', body: 'decision body', commitId: HEAD })).toEqual({ notMirrored: null });
    expect(calls.map((c) => `${c.method} ${new URL(c.url).pathname.slice(P.length)}`)).toEqual(['POST /merge_requests/7/notes', 'POST /merge_requests/7/approve']);
    expect(calls[0]!.body).toEqual({ body: 'decision body' });
    expect(calls[1]!.body).toEqual({ sha: HEAD });
  });

  it('a request for changes withdraws the approval, and one never given is not a failure', async () => {
    const given = await client({ [`POST ${P}/merge_requests/7/notes`]: { status: 201, json: {} }, [`POST ${P}/merge_requests/7/unapprove`]: { status: 201, json: {} } });
    expect(await given.forge.createReview(7, { event: 'REQUEST_CHANGES', body: 'b', commitId: HEAD })).toEqual({ notMirrored: null });
    expect(given.calls.map((c) => new URL(c.url).pathname.slice(P.length))).toEqual(['/merge_requests/7/notes', '/merge_requests/7/unapprove']);
    const never = await client({ [`POST ${P}/merge_requests/7/notes`]: { status: 201, json: {} } });
    expect(await never.forge.createReview(7, { event: 'REQUEST_CHANGES', body: 'b', commitId: HEAD })).toEqual({ notMirrored: null });
  });

  it('a refused mirror leaves the decision standing and says why; a refused note fails the decision', async () => {
    const refused = await client({ [`POST ${P}/merge_requests/7/notes`]: { status: 201, json: {} }, [`POST ${P}/merge_requests/7/approve`]: { status: 409, text: '{"message":"SHA does not match"}' } });
    const recorded = await refused.forge.createReview(7, { event: 'APPROVE', body: 'b', commitId: HEAD });
    expect(recorded).toEqual({ notMirrored: expect.stringContaining('HTTP 409') });
    const noNote = await client({ [`POST ${P}/merge_requests/7/notes`]: { status: 403, text: 'forbidden' } });
    await expect(noNote.forge.createReview(7, { event: 'APPROVE', body: 'b', commitId: HEAD })).rejects.toBeInstanceOf(ForgeRequestError);
    expect(noNote.calls).toHaveLength(1);
  });

  it('merges only at the approved head, squashing or not, and never as a rebase', async () => {
    const { forge, calls } = await client({ [`PUT ${P}/merge_requests/7/merge`]: { json: MR } });
    await forge.merge(7, { method: 'squash', sha: HEAD });
    await forge.merge(7, { method: 'merge', sha: HEAD });
    expect(calls.map((c) => c.body)).toEqual([{ sha: HEAD, squash: true }, { sha: HEAD, squash: false }]);
    await expect(forge.merge(7, { method: 'rebase', sha: HEAD })).rejects.toBeInstanceOf(ForgeRequestError);
    expect(calls).toHaveLength(2);

    const moved = await client({ [`PUT ${P}/merge_requests/7/merge`]: { status: 409, text: '{"message":"SHA does not match HEAD of source branch"}' } });
    const error = (await moved.forge.merge(7, { method: 'squash', sha: HEAD }).catch((err: unknown) => err)) as ForgeRequestError;
    expect(error.status).toBe(409);
  });

  it('reads a file at a ref as text, and null when it is not there', async () => {
    const { forge } = await client({ [`GET ${P}/repository/files/docs%2Fa%20note.md/raw?ref=main`]: { text: '# A note\n' } });
    expect(await forge.fileAt('docs/a note.md', 'main')).toBe('# A note\n');
    expect(await forge.fileAt('missing.md', 'main')).toBeNull();
  });

  it('names GitLab and its host in a failure, never gh and never the token', async () => {
    const { forge } = await client({ [`GET ${P}/merge_requests/9`]: { status: 401, text: `{"message":"401 Unauthorized ${TOKEN}"}` } });
    const error = (await forge.pull(9).catch((err: unknown) => err)) as ForgeRequestError;
    expect(error).toBeInstanceOf(ForgeRequestError);
    expect(error.status).toBe(401);
    expect(error.message).toContain('GitLab (gitlab.com)');
    expect(error.message).not.toContain(TOKEN);
    const unreachable = new ForgeUnreachableError(error.message).finding.message;
    expect(unreachable).toContain('GitLab (gitlab.com)');
    expect(unreachable).not.toContain('"gh"');
    // A GitHub failure reads as it always did.
    expect(new ForgeUnreachableError('forge request user failed').finding.message).toContain('through "gh"');
  });

  it('reports a host that cannot be reached with no status', async () => {
    const credentials = await resolveForgeCredentials({ env: { CONTEXTURE_GITLAB_TOKEN: TOKEN }, git: originGit('https://gitlab.com/ctx-a/work.git'), cwd: '/' });
    const forge = forgeClientFor('/', credentials, async () => {
      throw new TypeError('fetch failed', { cause: new Error('getaddrinfo ENOTFOUND gitlab.com') });
    });
    const error = (await forge.login().catch((err: unknown) => err)) as ForgeRequestError;
    expect(error.status).toBeNull();
    expect(error.message).toContain('ENOTFOUND');
  });
});

describe('decisions on GitLab are notes by the recording identity (support-gitlab-as-a-forge D5)', () => {
  const decision = (by: string, kind: 'approve' | 'request-changes' = 'approve') =>
    decisionBody({ decision: kind, head: HEAD, by, at: '2026-10-23T07:00:00.000Z', carriedFrom: null, comment: kind === 'approve' ? null : 'fix the second section' });
  const note = (username: string, body: string, minute: number, system = false) => ({ body, author: { username }, created_at: `2026-10-23T07:${String(minute).padStart(2, '0')}:00Z`, system });

  async function stateOf(notes: unknown[]) {
    const { forge } = await client({ [`GET ${P}/merge_requests/7/notes?sort=asc&order_by=created_at&per_page=100&page=1`]: { json: notes } });
    const [reviews, comments] = await Promise.all([forge.reviews(7), forge.comments(7)]);
    return resolveReviewState({ reviews, comments, recordingLogin: 'ctx-a-approvals', head: HEAD });
  }

  it('reads the latest decision note by the recording login', async () => {
    expect((await stateOf([note('ctx-a-approvals', decision('a@example.com'), 1)])).state).toBe('approved');
    const later = await stateOf([note('ctx-a-approvals', decision('a@example.com'), 1), note('ctx-a-approvals', decision('b@example.com', 'request-changes'), 2)]);
    expect(later.state).toBe('changes-requested');
    expect(later.decision).toMatchObject({ by: 'b@example.com', comment: 'fix the second section' });
  });

  it('ignores a marker from another user, a note GitLab wrote, and GitLab’s own approval', async () => {
    expect((await stateOf([note('ctx-agent', decision('a@example.com'), 1)])).state).toBe('awaiting');
    expect((await stateOf([note('ctx-a-approvals', decision('a@example.com'), 1, true)])).state).toBe('awaiting');
    // A member approving in GitLab's interface leaves only a system note; no decision note exists.
    expect((await stateOf([note('ctx-a-member', 'approved this merge request', 1, true)])).state).toBe('awaiting');
  });

  it('tells a landing record from a decision by its marker, though both are notes', async () => {
    const blocked = landingBody({ state: 'blocked', reason: 'conflict', head: HEAD, at: '2026-10-23T07:05:00.000Z' }, 'Landing stopped.');
    const state = await stateOf([note('ctx-a-approvals', decision('a@example.com'), 1), note('ctx-a-approvals', blocked, 5)]);
    expect(state.state).toBe('blocked');
    expect(state.decision?.by).toBe('a@example.com');
  });
});

