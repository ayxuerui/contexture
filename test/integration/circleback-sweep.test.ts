import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { makeTmpDir } from '../helpers/tmp-store.js';

/**
 * circleback-sweep: the ctxr-capture-circleback runner, run for real against a git store with a bare origin and stand-in
 * `cb` and `gh` commands. It must route by tag, read tags from `cb meetings read` (search returns none), and
 * render only what the store owes.
 */
const RUNNER = fileURLToPath(new URL('../../templates/skills/ctxr-capture-circleback/sweep.mjs', import.meta.url));
const NOW = Date.now();
const daysAgo = (days: number): string => new Date(NOW - days * 86_400_000).toISOString();

const MEETINGS = [
  { id: 'owedA1', name: 'Pricing review', createdAt: daysAgo(3), tags: ['alpha-store'], notes: '#### Overview\n* agreed   ' },
  { id: 'hereB2', name: 'Already filed', createdAt: daysAgo(10), tags: ['alpha-store'], notes: 'n' },
  { id: 'lockC3', name: 'Too old', createdAt: daysAgo(33), tags: ['alpha-store'], notes: 'This meeting is outside the history available on the Free plan.' },
  { id: 'noneD4', name: 'Nobody decided', createdAt: daysAgo(26), tags: [], notes: 'n' },
  { id: 'bothE5', name: 'Two homes', createdAt: daysAgo(5), tags: ['alpha-store', 'beta-store'], notes: 'n' },
  { id: 'declF6', name: 'Doorstep', createdAt: daysAgo(2), tags: ['no-capture'], notes: 'n' },
  { id: 'elseG7', name: 'Other store', createdAt: daysAgo(4), tags: ['beta-store'], notes: 'n' },
  { id: 'sessH8', name: 'Captured in a session', createdAt: daysAgo(6), tags: ['alpha-store'], notes: 'n' },
].map((m) => ({
  ...m,
  duration: 125,
  attendees: [{ name: 'Rui Xue', email: 'rui@example.test' }, { name: 'Participant 2', email: null }],
  actionItems: [],
  recordingUrl: 'https://storage.example.test/signed?X-Goog-Signature=secret',
}));

/**
 * Stand-in `cb` and `gh`. `rateLimit` makes transcript reads number `after + 1` to `after + times` (counted
 * across calls, retries included) fail as the Free plan's limit does; every read is logged to `transcript-reads`,
 * and the time of every call to `cb-calls`.
 */
function fakeBin(dir: string, meetings: unknown[] = MEETINGS, rateLimit = { after: 0, times: 0 }): void {
  mkdirSync(dir, { recursive: true });
  const fixtures = path.join(dir, 'meetings.json');
  writeFileSync(fixtures, JSON.stringify(meetings));
  const reads = path.join(dir, 'transcript-reads');
  // `cb`: search returns every meeting with its tags blanked, as the real CLI does; read returns them whole.
  writeFileSync(
    path.join(dir, 'cb'),
    `#!/usr/bin/env node
const fs = require('fs');
const all = JSON.parse(fs.readFileSync(${JSON.stringify(fixtures)}, 'utf8'));
fs.appendFileSync(${JSON.stringify(path.join(dir, 'cb-calls'))}, Date.now() + '\\n');
const [noun, verb, ...rest] = process.argv.slice(2);
const ids = rest.filter((a) => !a.startsWith('--') && !/^[0-9]+$/.test(a));
let out;
if (noun === 'meetings' && verb === 'search') out = rest.includes('0') ? all.map((m) => ({ ...m, tags: [] })) : [];
else if (noun === 'meetings' && verb === 'read') out = all.filter((m) => ids.includes(m.id));
else if (noun === 'transcripts' && verb === 'read') {
  fs.appendFileSync(${JSON.stringify(reads)}, ids.join(' ') + '\\n');
  const n = fs.readFileSync(${JSON.stringify(reads)}, 'utf8').trim().split('\\n').length;
  if (n > ${rateLimit.after} && n <= ${rateLimit.after + rateLimit.times}) {
    process.stderr.write(JSON.stringify({ status: 'error', reason: 'rate_limited', message: 'Ratelimit exceeded for the Free plan.', retryable: true }));
    process.exit(1);
  }
  out = ids.map((id) => ({ id, transcript: [{ speaker: 'Rui Xue', text: 'hello   there  ', timestamp: 1.5 }] }));
}
process.stdout.write(JSON.stringify(out));
`,
  );
  writeFileSync(path.join(dir, 'gh'), '#!/bin/sh\n[ "$1 $2" = "pr list" ] && echo "[]"\nexit 0\n');
  chmodSync(path.join(dir, 'cb'), 0o755);
  chmodSync(path.join(dir, 'gh'), 0o755);
}

describe('ctxr-capture-circleback runner', () => {
  it('routes by tag, renders only what the store owes, and reports the rest', async () => {
    const tmp = await makeTmpDir();
    try {
      const git = (cwd: string, ...args: string[]): string =>
        execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
      const origin = path.join(tmp.root, 'origin.git');
      const store = path.join(tmp.root, 'store');
      git(tmp.root, 'init', '-q', '--bare', '-b', 'trunk', origin);
      git(tmp.root, 'clone', '-q', origin, store);
      mkdirSync(path.join(store, 'raw'), { recursive: true });
      writeFileSync(path.join(store, 'raw', 'filed.md'), '---\nsource_id: circleback/hereB2\n---\n');
      git(store, 'add', '.');
      git(store, 'commit', '-q', '-m', 'seed');
      git(store, 'push', '-q', 'origin', 'HEAD:trunk');
      // An agent's session that captured a meeting and has not committed it: work in flight, not a gap.
      const session = path.join(tmp.root, 'session');
      git(store, 'worktree', 'add', '-q', '-b', 'session/one', session, 'HEAD');
      mkdirSync(path.join(session, 'raw', 'inbox'), { recursive: true });
      writeFileSync(path.join(session, 'raw', 'inbox', 'held.md'), '---\nsource_id: circleback/sessH8\n---\n');

      const skill = path.join(tmp.root, 'skill');
      mkdirSync(skill);
      copyFileSync(RUNNER, path.join(skill, 'sweep.mjs'));
      writeFileSync(
        path.join(skill, 'settings.json'),
        JSON.stringify({ tag: 'alpha-store', other_tags: ['beta-store'], decline_tag: 'no-capture', inbox_path: 'raw/inbox/', default_branch: 'trunk', required_section: 'Transcript' }),
      );
      const bin = path.join(tmp.root, 'bin');
      fakeBin(bin);
      const scratch = path.join(tmp.root, 'scratch');
      mkdirSync(scratch);

      const report = execFileSync('node', [path.join(skill, 'sweep.mjs')], {
        encoding: 'utf8',
        env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, CONTEXTURE_STORE_ROOT: store, TMPDIR: scratch, CTXR_CIRCLEBACK_WAIT_SCALE: '0' },
      });

      expect(report).not.toContain('COLLECTION FAILED');
      expect(report).toContain('Already in this store, an open pull request or a local worktree: 2.');
      const toCapture = report.split('TO CAPTURE')[1]?.split('\n\n')[0] ?? '';
      expect(toCapture).toContain('owedA1');
      for (const id of ['hereB2', 'lockC3', 'noneD4', 'bothE5', 'declF6', 'elseG7', 'sessH8']) expect(toCapture, id).not.toContain(id);
      expect(report.split('UNPUSHED')[1]?.split('\n\n')[0]).toMatch(/sessH8 .*\(in .*session\)/);
      expect(report.split('LOCKED')[1]).toMatch(/lockC3/);
      expect(report.split('UNTAGGED')[1]).toMatch(/noneD4 \| Nobody decided \(URGENT, locks soon\)/);
      expect(report.split('TAGGED FOR MORE THAN ONE STORE')[1]).toMatch(/bothE5 .*\(also beta-store\)/);
      expect(report.split('DECLINED IN THE LAST 8 DAYS')[1]).toMatch(/declF6/);

      const worktree = path.join(scratch, 'ctxr-capture-circleback-store');
      expect(git(worktree, 'rev-parse', '--abbrev-ref', 'HEAD').trim()).toBe('circleback-capture');
      const inbox = path.join(worktree, 'raw', 'inbox');
      const files = readdirSync(inbox);
      expect(files).toHaveLength(1);
      const capture = readFileSync(path.join(inbox, files[0] ?? ''), 'utf8');
      expect(capture).toContain('source_type: circleback\nsource_id: circleback/owedA1\n');
      expect(capture).toContain('## Transcript');
      expect(capture).toContain('**Rui Xue** (1.5): hello there');
      expect(capture).not.toContain('secret');
      expect(capture).not.toMatch(/[ \t]$/m);

      // A second run reuses the fixed worktree path instead of colliding with the first.
      const again = execFileSync('node', [path.join(skill, 'sweep.mjs')], {
        encoding: 'utf8',
        env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, CONTEXTURE_STORE_ROOT: store, TMPDIR: scratch, CTXR_CIRCLEBACK_WAIT_SCALE: '0' },
      });
      expect(again).not.toContain('COLLECTION FAILED');
      // Its own review worktree, holding last run's capture, is not counted as the meeting being present.
      expect(again.split('TO CAPTURE')[1]?.split('\n\n')[0]).toContain('owedA1');
    } finally {
      await tmp.cleanup();
    }
  });

  const OWED = ['owedP1', 'owedQ2', 'owedR3'].map((id, i) => ({
    id,
    name: `Backlog ${i + 1}`,
    createdAt: daysAgo(20 - i),
    tags: ['alpha-store'],
    notes: 'n',
    duration: 60,
    attendees: [],
    actionItems: [],
  }));

  /** A store owing three meetings, swept once with transcript reads rate-limited as `rateLimit` says. */
  async function sweepBacklog(
    rateLimit: { after: number; times: number },
    waitScale = '0',
    meetings: unknown[] = OWED,
  ): Promise<{ report: string; reads: string[]; inbox: string[]; ids: (string | undefined)[]; callTimes: number[] }> {
    const tmp = await makeTmpDir();
    try {
      const git = (cwd: string, ...args: string[]): string =>
        execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
      const origin = path.join(tmp.root, 'origin.git');
      const store = path.join(tmp.root, 'store');
      git(tmp.root, 'init', '-q', '--bare', '-b', 'trunk', origin);
      git(tmp.root, 'clone', '-q', origin, store);
      writeFileSync(path.join(store, 'README.md'), 'store\n');
      git(store, 'add', '.');
      git(store, 'commit', '-q', '-m', 'seed');
      git(store, 'push', '-q', 'origin', 'HEAD:trunk');
      const skill = path.join(tmp.root, 'skill');
      mkdirSync(skill);
      copyFileSync(RUNNER, path.join(skill, 'sweep.mjs'));
      writeFileSync(
        path.join(skill, 'settings.json'),
        JSON.stringify({ tag: 'alpha-store', other_tags: [], decline_tag: 'no-capture', inbox_path: 'raw/inbox/', default_branch: 'trunk', required_section: 'Transcript' }),
      );
      const bin = path.join(tmp.root, 'bin');
      fakeBin(bin, meetings, rateLimit);
      const scratch = path.join(tmp.root, 'scratch');
      mkdirSync(scratch);
      const report = execFileSync('node', [path.join(skill, 'sweep.mjs')], {
        encoding: 'utf8',
        env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, CONTEXTURE_STORE_ROOT: store, TMPDIR: scratch, CTXR_CIRCLEBACK_WAIT_SCALE: waitScale },
      });
      const callTimes = readFileSync(path.join(bin, 'cb-calls'), 'utf8').trim().split('\n').map(Number);
      const readsFile = path.join(bin, 'transcript-reads');
      const reads = existsSync(readsFile) ? readFileSync(readsFile, 'utf8').trim().split('\n') : [];
      const inboxDir = path.join(scratch, 'ctxr-capture-circleback-store', 'raw', 'inbox');
      const inbox = existsSync(inboxDir) ? readdirSync(inboxDir).sort() : [];
      const ids = inbox.map((file) => /source_id: circleback\/(\S+)/.exec(readFileSync(path.join(inboxDir, file), 'utf8'))?.[1]);
      return { report, reads, inbox, ids, callTimes };
    } finally {
      await tmp.cleanup();
    }
  }

  it('retries a rate-limited transcript read and retrieves everything owed', async () => {
    const { report, reads, inbox } = await sweepBacklog({ after: 1, times: 2 });
    expect(report).not.toContain('COLLECTION FAILED');
    // The second meeting's read is refused twice, then succeeds; nothing is skipped.
    expect(reads).toEqual(['owedP1', 'owedQ2', 'owedQ2', 'owedQ2', 'owedR3']);
    expect(inbox).toHaveLength(3);
    expect(report).toMatch(/DEFERRED[^\n]*\(0\):\n\(none\)/);
  });

  it('keeps what it read and defers the rest when the rate limit outlasts every retry', async () => {
    const { report, reads, inbox } = await sweepBacklog({ after: 1, times: 1000 });
    expect(report).not.toContain('COLLECTION FAILED');
    // One read, then the first try and three retries of the second; the third is not attempted this run.
    expect(reads).toEqual(['owedP1', ...Array(4).fill('owedQ2')]);
    expect(inbox).toEqual([expect.stringContaining('backlog-1')]);
    const retrieved = report.split('RETRIEVED')[1]?.split('\nDEFERRED')[0] ?? '';
    expect(retrieved).toContain('backlog-1');
    const deferred = report.split('DEFERRED')[1]?.split('\n\n')[0] ?? '';
    expect(deferred).toContain('(2):');
    expect(deferred).toContain('owedQ2');
    expect(deferred).toContain('owedR3');
    expect(deferred).not.toContain('owedP1');
    // The rest of the report still prints.
    expect(report).toContain('UNTAGGED');
  });

  it('spaces every cb call to stay under the Free plan limit of 20 a minute', async () => {
    // At a twentieth of real time, the 3.5 s spacing is 175 ms.
    const { callTimes } = await sweepBacklog({ after: 0, times: 0 }, '0.05');
    // The search, the meetings read and three transcript reads.
    expect(callTimes).toHaveLength(5);
    const gaps = callTimes.slice(1).map((t, i) => t - (callTimes[i] ?? 0));
    for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(170);
  });

  it('gives two meetings whose titles reduce to the same name a file each', async () => {
    // Titles mostly in another script keep only their ASCII letters: both slug to `aon`.
    const twins = ['aonOne11', 'aonTwo22'].map((id, i) => ({
      ...OWED[0],
      id,
      name: i === 0 ? 'AON 检索算法优化方案讨论' : 'AON 推荐召回率优化方案',
      createdAt: daysAgo(14),
    }));
    const { inbox, ids } = await sweepBacklog({ after: 0, times: 0 }, '0', twins);
    expect(inbox).toHaveLength(2);
    expect(inbox).toContain(`circleback-${daysAgo(14).slice(0, 10)}-aon.md`);
    expect(inbox).toContain(`circleback-${daysAgo(14).slice(0, 10)}-aon-aonTwo22.md`);
    expect([...ids].sort()).toEqual(['aonOne11', 'aonTwo22']);
  });
});
