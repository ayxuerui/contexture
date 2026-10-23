import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
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

function fakeBin(dir: string): void {
  mkdirSync(dir, { recursive: true });
  const fixtures = path.join(dir, 'meetings.json');
  writeFileSync(fixtures, JSON.stringify(MEETINGS));
  // `cb`: search returns every meeting with its tags blanked, as the real CLI does; read returns them whole.
  writeFileSync(
    path.join(dir, 'cb'),
    `#!/usr/bin/env node
const all = JSON.parse(require('fs').readFileSync(${JSON.stringify(fixtures)}, 'utf8'));
const [noun, verb, ...rest] = process.argv.slice(2);
const ids = rest.filter((a) => !a.startsWith('--') && !/^[0-9]+$/.test(a));
let out;
if (noun === 'meetings' && verb === 'search') out = rest.includes('0') ? all.map((m) => ({ ...m, tags: [] })) : [];
else if (noun === 'meetings' && verb === 'read') out = all.filter((m) => ids.includes(m.id));
else if (noun === 'transcripts' && verb === 'read') out = ids.map((id) => ({ id, transcript: [{ speaker: 'Rui Xue', text: 'hello   there  ', timestamp: 1.5 }] }));
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
        env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, CONTEXTURE_STORE_ROOT: store, TMPDIR: scratch },
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
        env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, CONTEXTURE_STORE_ROOT: store, TMPDIR: scratch },
      });
      expect(again).not.toContain('COLLECTION FAILED');
      // Its own review worktree, holding last run's capture, is not counted as the meeting being present.
      expect(again.split('TO CAPTURE')[1]?.split('\n\n')[0]).toContain('owedA1');
    } finally {
      await tmp.cleanup();
    }
  });
});
