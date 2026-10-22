#!/usr/bin/env node
// Work out which Circleback meetings this store owes, and write each into the inbox on a review branch as the
// verbatim record, for ctxr-capture to continue from its step 2.
//
// Shipped by contexture as part of the ctxr-capture-circleback skill; `ctxr update` rewrites it, so do not
// edit it in a store. Node standard library only. It drives Circleback's own CLI (`cb`), which holds its own
// credential, plus `git` and `gh`; it never reads or stores a credential itself.
//
// The store's routing is in settings.json beside this file. The store is CONTEXTURE_STORE_ROOT, or the
// git repository the current directory is in.
//
// Two facts about `cb` shape this file: search results carry no tags (every `tags` field is empty), so
// tags come from `cb meetings read`; and a meeting older than the plan's history window reads back with
// a notice in place of its notes, which is how a locked meeting is recognised.

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LOOKBACK_DAYS = 35;
const URGENT_DAYS = 25;
const DECLINE_REPORT_DAYS = 8;
const PAGE_SIZE = 20;
const READ_BATCH = 50;
const BRANCH = 'circleback-capture';
const LOCKED_NOTICE = 'outside the history available';

function run(command, args, { cwd, check = true } = {}) {
  try {
    return execFileSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: 180_000, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    if (!check) return error.stdout ?? '';
    const detail = String(error.stderr || error.message).trim().slice(0, 300);
    throw new Error(`${command} ${args.slice(0, 2).join(' ')} failed: ${detail}`);
  }
}

function cb(args) {
  return JSON.parse(run('cb', [...args, '--json']));
}

function storeRoot() {
  const fromEnv = process.env.CONTEXTURE_STORE_ROOT;
  if (fromEnv) return fromEnv;
  return run('git', ['rev-parse', '--show-toplevel']).trim();
}

function tagNames(meeting) {
  return new Set((meeting.tags ?? []).map((tag) => (typeof tag === 'string' ? tag : tag.name)));
}

function asList(value) {
  return Array.isArray(value) ? value : [value];
}

function line(meeting) {
  return `${meeting.createdAt.slice(0, 10)} | ${meeting.id} | ${meeting.name.trim()}`;
}

/** Every meeting from the lookback window, read in full so its tags are present. */
function recentMeetings() {
  const ids = [];
  for (let page = 0; ; page += 1) {
    const batch = cb(['meetings', 'search', '--last', String(LOOKBACK_DAYS), '--page', String(page)]);
    ids.push(...batch.map((meeting) => meeting.id));
    if (batch.length < PAGE_SIZE) break;
  }
  const meetings = [];
  for (let i = 0; i < ids.length; i += READ_BATCH) meetings.push(...asList(cb(['meetings', 'read', ...ids.slice(i, i + READ_BATCH)])));
  return meetings.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Circleback ids already in the default branch, and in each open pull request's diff. */
function presence(root, settings) {
  run('git', ['fetch', '-q', 'origin'], { cwd: root });
  const onMain = new Set(
    run('git', ['grep', '-h', '-o', '-E', 'circleback/[A-Za-z0-9_-]+', `origin/${settings.default_branch}`], { cwd: root, check: false })
      .split('\n')
      .filter(Boolean)
      .map((match) => match.slice('circleback/'.length)),
  );
  const inPullRequest = new Map();
  for (const pr of JSON.parse(run('gh', ['pr', 'list', '--state', 'open', '--json', 'number'], { cwd: root }))) {
    const diff = run('gh', ['pr', 'diff', String(pr.number)], { cwd: root, check: false });
    for (const match of diff.matchAll(/circleback\/([A-Za-z0-9_-]+)/g)) if (!inPullRequest.has(match[1])) inPullRequest.set(match[1], pr.number);
  }
  return { onMain, inPullRequest };
}

/**
 * The review worktree, at a fixed path so a later run finds it: continuing the open pull request's branch
 * when there is one, else fresh from the default branch. Whatever an earlier run left there is cleared
 * first, because an agent running unattended may not be allowed to delete it.
 */
function prepareWorktree(root, settings) {
  const worktree = path.join(tmpdir(), `ctxr-capture-circleback-${path.basename(root)}`);
  run('git', ['worktree', 'remove', '--force', worktree], { cwd: root, check: false });
  rmSync(worktree, { recursive: true, force: true });
  run('git', ['worktree', 'prune'], { cwd: root });
  const open = JSON.parse(run('gh', ['pr', 'list', '--head', BRANCH, '--state', 'open', '--json', 'number'], { cwd: root }));
  if (open.length > 0) {
    run('git', ['fetch', '-q', 'origin', BRANCH], { cwd: root });
    run('git', ['worktree', 'add', '-B', BRANCH, worktree, `origin/${BRANCH}`], { cwd: root });
    run('git', ['merge', '-q', '--no-edit', `origin/${settings.default_branch}`], { cwd: worktree });
  } else {
    run('git', ['push', '-q', 'origin', '--delete', BRANCH], { cwd: root, check: false });
    run('git', ['worktree', 'add', '-B', BRANCH, worktree, `origin/${settings.default_branch}`], { cwd: root });
  }
  return { worktree, continuing: open[0]?.number };
}

function captureFileName(meeting) {
  const slug = meeting.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || meeting.id;
  return `circleback-${meeting.createdAt.slice(0, 10)}-${slug}.md`;
}

/** The mechanical part of a capture. The speaker judgment is the agent's, added afterwards. */
function renderCapture(meeting, transcript, settings) {
  const segments = asList(transcript)[0]?.transcript ?? [];
  const seconds = Math.round(Number(meeting.duration ?? 0));
  const out = [
    '---',
    `title: ${JSON.stringify(meeting.name.trim())}`,
    'source_type: circleback',
    `source_id: circleback/${meeting.id}`,
    'capture_type: meeting',
    '---',
    `# ${meeting.name.trim()}`,
    '',
    `Circleback meeting \`${meeting.id}\`, ${meeting.createdAt} (upload time, UTC), duration ${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, '0')}s, ${segments.length} transcript segments.`,
    '',
    '*The recording URL Circleback exposes is a signed, expiring link, so it is deliberately not recorded here. Retrieve it from Circleback by meeting id if it is needed.*',
    '',
    '## Attendees',
    ...(meeting.attendees ?? []).map((a) => `- ${a.name || '(unnamed)'}${a.email ? ` (${a.email})` : ''}`),
    '',
    '## Action items (Circleback)',
  ];
  const items = meeting.actionItems ?? [];
  for (const item of items) {
    const description = (item.description ?? '').split(/\s+/).filter(Boolean).join(' ');
    out.push(`- **${(item.title ?? '').trim()}** — assignee ${item.assignee?.name ?? 'unassigned'}, status ${item.status ?? '?'}.${description ? ` "${description}"` : ''}`);
  }
  if (items.length === 0) out.push('(none)');
  out.push(
    '',
    "## Summary (Circleback's own, not the record)",
    '',
    (meeting.notes ?? '(none)').trim(),
    '',
    `## ${settings.required_section ?? 'Transcript'}`,
    '',
    "*Verbatim from Circleback, speaker-labelled, with start timestamps in seconds. Unedited: mis-transcriptions and speaker-attribution slips are the service's own.*",
    '',
  );
  for (const segment of segments) {
    const text = (segment.text ?? '').split(/\s+/).filter(Boolean).join(' ');
    out.push(`**${segment.speaker || 'Unknown'}** (${segment.timestamp ?? 0}): ${text}`, '');
  }
  return `${out.map((l) => l.replace(/\s+$/, '')).join('\n').trimEnd()}\n`;
}

function section(title, lines) {
  return [`\n${title} (${lines.length}):`, ...(lines.length > 0 ? lines : ['(none)'])];
}

function main() {
  const settings = JSON.parse(readFileSync(path.join(HERE, 'settings.json'), 'utf8'));
  const root = storeRoot();
  const otherTags = new Set(settings.other_tags);
  const { onMain, inPullRequest } = presence(root, settings);
  const meetings = recentMeetings();
  const now = Date.now();
  const ageDays = (meeting) => (now - Date.parse(meeting.createdAt)) / 86_400_000;

  const owed = [];
  const locked = [];
  const untagged = [];
  const multiStore = [];
  const declined = [];
  let present = 0;
  for (const meeting of meetings) {
    const tags = tagNames(meeting);
    const isLocked = (meeting.notes ?? '').includes(LOCKED_NOTICE);
    const here = onMain.has(meeting.id) || inPullRequest.has(meeting.id);
    const others = [...tags].filter((tag) => otherTags.has(tag));
    if (tags.has(settings.tag) && here) present += 1;
    if (tags.size === 0 && !here) untagged.push(`${line(meeting)}${isLocked ? ' (locked)' : ageDays(meeting) >= URGENT_DAYS ? ' (URGENT, locks soon)' : ''}`);
    if (tags.has(settings.tag) && others.length > 0) multiStore.push(`${line(meeting)} (also ${others.join(', ')})`);
    if (tags.has(settings.decline_tag) && ageDays(meeting) <= DECLINE_REPORT_DAYS) declined.push(line(meeting));
    const isOwed = tags.has(settings.tag) && others.length === 0 && !tags.has(settings.decline_tag) && !here;
    if (isOwed && isLocked) locked.push(line(meeting));
    else if (isOwed) owed.push(meeting);
  }

  const report = [
    `Store tag \`${settings.tag}\`. Meetings in the last ${LOOKBACK_DAYS} days: ${meetings.length}. Already in this store or an open pull request: ${present}.`,
    ...section('TO CAPTURE — date | id | title', owed.map(line)),
  ];
  if (owed.length > 0) {
    const { worktree, continuing } = prepareWorktree(root, settings);
    const inbox = path.join(worktree, settings.inbox_path);
    mkdirSync(inbox, { recursive: true });
    report.push(`\nWORKTREE: ${worktree} (branch \`${BRANCH}\`, ${continuing ? `continuing pull request #${continuing}` : `fresh from origin/${settings.default_branch}`})`);
    report.push('RETRIEVED (verbatim records in the inbox; continue with ctxr-capture from step 2):');
    for (const meeting of owed) {
      const transcript = cb(['transcripts', 'read', meeting.id]);
      const file = path.join(inbox, captureFileName(meeting));
      writeFileSync(file, renderCapture(meeting, transcript, settings));
      report.push(file);
    }
  }
  report.push(
    ...section(`LOCKED — tagged \`${settings.tag}\`, never captured, no longer readable in full`, locked),
    ...section('UNTAGGED', untagged),
    ...section('TAGGED FOR MORE THAN ONE STORE', multiStore),
    ...section(`DECLINED IN THE LAST ${DECLINE_REPORT_DAYS} DAYS — tagged \`${settings.decline_tag}\`, for confirmation`, declined),
  );
  process.stdout.write(`${report.join('\n')}\n`);
}

try {
  main();
} catch (error) {
  // A scheduled job puts this output in the agent's prompt; it must see a failure, not an empty list.
  process.stdout.write(`COLLECTION FAILED: ${error.message}\n`);
}
