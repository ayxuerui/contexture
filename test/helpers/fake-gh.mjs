// A stand-in for `gh`, answering only the `gh api` calls src/core/forge/github.ts makes.
// State lives in the JSON file $FAKE_GH_STATE:
//   { login, pulls: [{ number, title, body, head, base, user, state, merged, merge_commit_sha, mergeable? }],
//     reviews: { "<n>": [...] }, comments: { "<n>": [...] }, fail?: { "<endpoint substring>": status },
//     failCreatePull?: <count of pull-request creations to refuse> }
// Head commits are read live from the bare repository $FAKE_GH_ORIGIN, so a push is seen at once,
// and a merge really lands on the base branch there.
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const statePath = process.env.FAKE_GH_STATE;
const origin = process.env.FAKE_GH_ORIGIN;
const args = process.argv.slice(2);
if (args[0] !== 'api' || statePath === undefined) {
  process.stderr.write(`fake gh: unsupported invocation ${args.join(' ')}\n`);
  process.exit(2);
}
const endpoint = args[1];
const methodIndex = args.indexOf('--method');
const method = methodIndex === -1 ? 'GET' : args[methodIndex + 1];
const state = JSON.parse(readFileSync(statePath, 'utf8'));
const input = args.includes('--input') ? JSON.parse(readFileSync(0, 'utf8') || 'null') : null;

function fail(status, message) {
  process.stderr.write(`gh: ${message} (HTTP ${status})\n`);
  process.exit(1);
}
// Parallel calls (reviews and comments together) read the file at once, so only a mutation writes, and atomically.
function save() {
  const temp = `${statePath}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(state, null, 2));
  renameSync(temp, statePath);
}
function reply(value) {
  if (method !== 'GET') save();
  process.stdout.write(value === undefined ? '' : JSON.stringify(value));
  process.exit(0);
}
function git(gitArgs, cwd) {
  return execFileSync('git', gitArgs, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function headSha(ref) {
  if (origin === undefined) return '0'.repeat(40);
  try {
    return git(['--git-dir', origin, 'rev-parse', `refs/heads/${ref}`]);
  } catch {
    return '0'.repeat(40);
  }
}
function render(pull) {
  return {
    number: pull.number,
    state: pull.state ?? 'open',
    merged: pull.merged ?? false,
    title: pull.title ?? '',
    body: pull.body ?? '',
    html_url: `https://forge.example.test/pull/${pull.number}`,
    user: { login: pull.user ?? 'ctx-agent' },
    head: { ref: pull.head, sha: pull.merged ? pull.merged_head_sha : (pull.stale_head ?? headSha(pull.head)) },
    base: { ref: pull.base ?? 'main' },
    mergeable: pull.mergeable === undefined ? true : pull.mergeable,
    merge_commit_sha: pull.merge_commit_sha ?? null,
  };
}

// App mode: every call must carry an installation token the fake GitHub API minted.
if (state.expectTokenPrefix !== undefined && !(process.env.GH_TOKEN ?? '').startsWith(state.expectTokenPrefix)) {
  fail(401, 'Bad credentials');
}
// Recorded beside the state, never in it: a read that rewrote the state could undo a concurrent write.
if (state.expectTokenPrefix !== undefined) appendFileSync(`${statePath}.tokens`, `${process.env.GH_TOKEN}\n`);

for (const [needle, status] of Object.entries(state.fail ?? {})) {
  if (endpoint.includes(needle)) fail(status, `forced failure for ${needle}`);
}

if (endpoint === 'user') reply({ login: state.login });

const match = /^repos\/\{owner\}\/\{repo\}\/(pulls|issues)(?:\/(\d+))?(?:\/(\w+))?(?:\?.*)?$/.exec(endpoint);
if (match === null) fail(404, `fake gh: no route for ${endpoint}`);
const [, kind, numberText, sub] = match;
const number = numberText === undefined ? null : Number(numberText);
const pull = number === null ? null : (state.pulls ?? []).find((p) => p.number === number);

if (kind === 'pulls' && number === null && method === 'POST') {
  // `failCreatePull`: how many creations to refuse before one succeeds (failure injection for retry tests).
  if ((state.failCreatePull ?? 0) > 0) {
    state.failCreatePull -= 1;
    save();
    fail(502, 'forced failure creating a pull request');
  }
  const created = { number: Math.max(0, ...(state.pulls ?? []).map((p) => p.number)) + 1, title: input.title, body: input.body, head: input.head, base: input.base, user: state.login, state: 'open' };
  (state.pulls ??= []).push(created);
  reply(render(created));
}
if (kind === 'pulls' && number === null) {
  const query = new URLSearchParams(endpoint.split('?')[1] ?? '');
  const wanted = query.get('state') ?? 'open';
  const head = query.get('head');
  reply(
    (state.pulls ?? [])
      .filter((p) => wanted === 'all' || (p.state ?? 'open') === wanted)
      .filter((p) => head === null || p.head === head.slice(head.indexOf(':') + 1))
      .map(render),
  );
}
if (pull === undefined) fail(404, 'Not Found');

if (kind === 'pulls' && sub === undefined && method === 'PATCH') {
  for (const key of ['title', 'body', 'state']) if (input[key] !== undefined) pull[key] = input[key];
  reply(render(pull));
}
if (kind === 'pulls' && sub === undefined) reply(render(pull));

if (kind === 'pulls' && sub === 'reviews') {
  state.reviews ??= {};
  const list = (state.reviews[number] ??= []);
  if (method === 'POST') {
    if (input.event === 'APPROVE' && pull.user === state.login) fail(422, 'Can not approve your own pull request');
    list.push({
      user: { login: state.login },
      state: { APPROVE: 'APPROVED', REQUEST_CHANGES: 'CHANGES_REQUESTED', COMMENT: 'COMMENTED' }[input.event],
      body: input.body,
      commit_id: input.commit_id,
      submitted_at: new Date(Date.now() + list.length).toISOString(),
    });
    reply({});
  }
  reply(list);
}

if (kind === 'issues' && sub === 'comments') {
  state.comments ??= {};
  const list = (state.comments[number] ??= []);
  if (method === 'POST') {
    list.push({ user: { login: state.login }, body: input.body, created_at: new Date(Date.now() + list.length).toISOString() });
    reply({});
  }
  reply(list);
}

if (kind === 'pulls' && sub === 'merge' && method === 'PUT') {
  if ((pull.state ?? 'open') !== 'open') fail(405, 'Pull Request is not mergeable');
  const head = headSha(pull.head);
  if (input.sha !== head) fail(409, 'Head branch was modified');
  const work = mkdtempSync(path.join(tmpdir(), 'fake-gh-merge-'));
  try {
    git(['clone', '--quiet', '--branch', pull.base ?? 'main', origin, work]);
    git(['fetch', '--quiet', 'origin', pull.head], work);
    if (input.merge_method === 'squash') {
      git(['merge', '--squash', 'FETCH_HEAD'], work);
      git(['commit', '--quiet', '--no-verify', '-m', `${pull.title} (#${pull.number})`], work);
    } else {
      git(['merge', '--no-ff', '--no-verify', '--quiet', '-m', `Merge #${pull.number}`, 'FETCH_HEAD'], work);
    }
    git(['push', '--quiet', '--no-verify', 'origin', `HEAD:refs/heads/${pull.base ?? 'main'}`], work);
    pull.merge_commit_sha = git(['rev-parse', 'HEAD'], work);
  } catch (err) {
    fail(405, `merge failed: ${err.message}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  pull.merged_head_sha = head;
  pull.state = 'closed';
  pull.merged = true;
  if (state.failAfterMerge) {
    save();
    fail(502, 'Bad Gateway');
  }
  reply({ merged: true });
}

fail(404, `fake gh: no route for ${method} ${endpoint}`);
