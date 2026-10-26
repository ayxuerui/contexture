import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { decisionBody } from '../../src/core/approval/decision.js';
import { draftLabel, MAX_OPEN_SESSIONS, Ownership, ownershipFile } from '../../src/core/mcp/ownership.js';
import { RECORDING_LOGIN } from '../helpers/approval-store.js';
import { makeMcpWriteFixture, MEMBER, type McpWriteFixture } from '../helpers/mcp-write.js';

/**
 * serve-the-session-lifecycle-to-chat-apps tasks 1.1–1.2 (remote-access spec,
 * *A member works in named sessions of their own*): the ownership record,
 * `session_start`, `session_list` and `session_status`, against a real
 * canonical clone, a bare origin and the fake `gh`.
 */
describe('mcp sessions and their ownership', () => {
  let f: McpWriteFixture;

  beforeEach(async () => {
    f = await makeMcpWriteFixture();
    await f.store.advanceMain({ 'projects/a.md': '# A\n\nThe plan.\n' }, 'advance main', { catalogued: true });
  });

  afterEach(async () => {
    await f.store.tmp.cleanup();
  });

  interface Row {
    session: string;
    root: string;
    branch: string;
    label: string | null;
    kind: string;
    uncommitted: boolean;
    ahead: number;
    pull_request: { number: number | null; state: string } | null;
    review: { state: string; comment: string | null } | null;
  }
  const list = async (email = MEMBER) => ((await f.call('session_list', {}, email)) as unknown as { sessions: Row[] }).sessions;
  const ownership = () => new Ownership(f.store.root, f.write.config);

  it('keeps two sessions for one member apart, each on its own branch with its own root', async () => {
    const intro = await f.start('intro');
    const roadmap = await f.start('roadmap');
    expect(intro.branch).not.toBe(roadmap.branch);
    expect(intro.root).toBe(`.worktrees/${intro.session}/`);
    const rows = await list();
    expect(rows.map((r) => r.session).sort()).toEqual([intro.session, roadmap.session].sort());
    expect(rows.find((r) => r.session === intro.session)).toMatchObject({ root: intro.root, label: 'intro', kind: 'session', uncommitted: false, ahead: 0, pull_request: null });
    // The record names the member, keyed by directory name, under the derived cache.
    const record = JSON.parse(await readFile(ownershipFile(f.store.root), 'utf8')) as { sessions: Record<string, { owner: string; kind: string }> };
    expect(record.sessions[intro.session]).toMatchObject({ owner: MEMBER, kind: 'session' });
    expect(await list('b@example.com')).toEqual([]);
  });

  it('refuses a label a live session already carries, as ctxr session start does', async () => {
    const first = await f.start('intro');
    await expect(f.start('intro')).rejects.toMatchObject({ code: 'session.name_exists', message: expect.stringContaining(first.root) });
    // Another member is told only that the label is taken.
    await expect(f.start('intro', 'b@example.com')).rejects.toMatchObject({ code: 'session.name_exists', message: expect.not.stringContaining(first.root) });
  });

  it("answers another member's session exactly as one that does not exist", async () => {
    const mine = await f.start('intro');
    const theirs = f.call('session_status', { session: mine.session }, 'b@example.com');
    const missing = f.call('session_status', { session: 'no-such-session' }, 'b@example.com');
    const [a, b] = await Promise.allSettled([theirs, missing]);
    expect(a).toMatchObject({ status: 'rejected', reason: { code: 'mcp.no_session' } });
    expect(b).toMatchObject({ status: 'rejected', reason: { code: 'mcp.no_session' } });
    expect(JSON.stringify((a as PromiseRejectedResult).reason)).not.toContain(mine.root);
  });

  it('never shows a session started locally', async () => {
    const local = await f.store.openSession('local-work', 5, { 'projects/l.md': '# L\n' });
    expect((await list()).map((r) => r.session)).not.toContain(local.name);
    await expect(f.call('session_status', { session: local.name })).rejects.toMatchObject({ code: 'mcp.no_session' });
  });

  it('re-scans an owned session, with the diff bounded', async () => {
    const { session, root } = await f.start('intro');
    await f.call('Edit', { file_path: `${root}projects/a.md`, old_string: 'The plan.', new_string: 'The plan, revised.' });
    await f.call('Write', { file_path: `${root}projects/big.md`, content: `# Big\n\n${'x'.repeat(120 * 1024)}\n` });
    const status = (await f.call('session_status', { session, diff: true })) as Record<string, unknown>;
    expect(status).toMatchObject({ session, root, ahead: 0, rebase_in_progress: false, diff_truncated: true });
    expect((status.uncommitted as { path: string }[]).map((c) => c.path).sort()).toEqual([`${root}projects/a.md`, `${root}projects/big.md`]);
    expect(Buffer.byteLength(status.diff as string)).toBeLessThanOrEqual(100 * 1024);
    expect(JSON.stringify(status)).not.toContain(f.store.root);
  });

  it("carries a decider's requested changes and comment into the member's row", async () => {
    const opened = await f.store.openSession('answer-me', 3, { 'projects/c.md': '# C\n' });
    await ownership().record(opened.name, { owner: MEMBER, kind: 'session', started_at: null });
    await f.store.forge.update((state) => {
      const at = new Date().toISOString();
      (state.reviews ??= {})[3] = [
        {
          user: { login: RECORDING_LOGIN },
          state: 'CHANGES_REQUESTED',
          body: decisionBody({ decision: 'request-changes', head: opened.head, by: 'b@example.com', at, carriedFrom: null, comment: 'Name the source.' }),
          commit_id: opened.head,
          submitted_at: at,
        },
      ];
    });
    const [row] = await list();
    expect(row).toMatchObject({ session: opened.name, ahead: 1, pull_request: { number: 3, state: 'open' }, review: { state: 'changes-requested', comment: 'Name the source.' } });
  });

  it("adopts a left-over draft for the member whose email its label came from, and no one else's", async () => {
    const draft = await f.store.openSession(draftLabel(MEMBER), 8, { 'projects/d.md': '# D\n' });
    expect((await list()).map((r) => [r.session, r.pull_request?.number])).toEqual([[draft.name, 8]]);
    expect(await list('b@example.com')).toEqual([]);
    expect((await f.call('session_status', { session: draft.name })) as Record<string, unknown>).toMatchObject({ ahead: 1 });
  });

  it('drops a record when its worktree is gone, and persists the drop on the next write', async () => {
    const { session } = await f.start('intro');
    await f.store.git(['worktree', 'remove', '--force', path.join(f.store.root, '.worktrees', session)]);
    expect(await list()).toEqual([]);
    expect(Object.keys(await ownership().read())).toEqual([]);
    await f.start('other');
    const record = JSON.parse(await readFile(ownershipFile(f.store.root), 'utf8')) as { sessions: Record<string, unknown> };
    expect(Object.keys(record.sessions)).toHaveLength(1);
    expect(record.sessions[session]).toBeUndefined();
  });

  it('reads a damaged record as empty rather than failing every call', async () => {
    await f.start('intro');
    await writeFile(ownershipFile(f.store.root), '{ not json');
    expect(await list()).toEqual([]);
    await rm(ownershipFile(f.store.root));
    expect(await list()).toEqual([]);
  });

  it(`caps a member at ${MAX_OPEN_SESSIONS} open sessions, not counting captures`, async () => {
    const own = ownership();
    for (let i = 0; i < MAX_OPEN_SESSIONS; i += 1) {
      const name = `session-20260101-0000${String(i).padStart(2, '0')}-bulk-${i}`;
      await f.store.git(['worktree', 'add', '-q', '-b', `session/bulk-${i}`, path.join(f.store.root, '.worktrees', name), 'origin/main']);
      await own.record(name, { owner: MEMBER, kind: i === 0 ? 'capture' : 'session', started_at: null });
    }
    const last = await f.start('one-more');
    expect(last.session).toBeTruthy();
    await expect(f.start('too-many')).rejects.toMatchObject({ code: 'mcp.session_limit' });
    expect((await list()).filter((r) => r.kind === 'capture')).toHaveLength(1);
    // Another member is not affected by this one's sessions.
    expect((await f.start('theirs', 'b@example.com')).session).toBeTruthy();
  });
});
