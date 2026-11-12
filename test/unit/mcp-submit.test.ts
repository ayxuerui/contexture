import { existsSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeMcpWriteFixture, MEMBER, type McpWriteFixture } from '../helpers/mcp-write.js';

/**
 * serve-the-session-lifecycle-to-chat-apps tasks 3.1–3.3 (remote-access spec,
 * *`session_submit` validates, commits as the member and opens the pull
 * request*, *A member's session can be rebased or discarded*): the session
 * tools over the shared core, against a bare origin and the fake `gh`.
 */
describe('mcp session_submit, session_rebase and session_discard', () => {
  let f: McpWriteFixture;

  beforeEach(async () => {
    f = await makeMcpWriteFixture();
    await f.store.advanceMain({ 'projects/a.md': '# A\n\nThe plan.\n', 'projects/b.md': '# B\n\nStatus: draft.\n' }, 'advance main', { catalogued: true });
  });

  afterEach(async () => {
    await f.store.tmp.cleanup();
  });

  const submit = (session: string, extra: Record<string, unknown> = {}, email = MEMBER) =>
    f.call('session_submit', { session, branch: 'notes/intro', message: 'Revise the intro notes\n\nBoth notes say where the plan stands.', title: 'Revise the intro notes', body: 'Why: the plan moved.\n\nWhat changed: two notes.', ...extra }, email);
  const pulls = async () => (await f.store.forge.read()).pulls;

  it('commits both edits as the member, pushes the named branch and opens the pull request with the written description', async () => {
    const mainBefore = await f.store.git(['ls-remote', 'origin', 'refs/heads/main']);
    const { session, root } = await f.start('intro');
    await f.call('Edit', { file_path: `${root}projects/a.md`, old_string: 'The plan.', new_string: 'The plan, revised.' });
    await f.call('Edit', { file_path: `${root}projects/b.md`, old_string: 'Status: draft.', new_string: 'Status: final.' });
    const result = await submit(session);
    expect(result).toMatchObject({ session, root, branch: 'notes/intro', steps: { gate: 'pass', pull_request: 'created' }, approval_url: `https://ctx-a.example.test/approve/${encodeURIComponent(session)}` });
    expect(JSON.stringify(result)).not.toContain(f.store.root);
    const [pull] = await pulls();
    expect(pull).toMatchObject({ head: 'notes/intro', base: 'main', state: 'open', title: 'Revise the intro notes' });
    expect(pull!.body).toMatch(/^Why: the plan moved\.\n\nWhat changed: two notes\./);
    expect(pull!.body).toContain('Knowledge changes');
    expect(await f.store.git(['rev-list', '--count', 'origin/main..origin/notes/intro'])).toBe('1');
    expect(await f.store.git(['log', '-1', '--format=%ae%n%B', 'origin/notes/intro'])).toContain(`${MEMBER}\nRevise the intro notes\n\nBoth notes say where the plan stands.\n\nEdited-by: ${MEMBER}`);
    expect(await f.store.git(['diff', '--name-only', 'origin/main...origin/notes/intro'])).toBe('projects/a.md\nprojects/b.md');
    expect(await f.store.git(['ls-remote', 'origin', 'refs/heads/main'])).toBe(mainBefore);
  });

  it('returns the gate report and commits, pushes and opens nothing when doctor fails', async () => {
    const { session, root } = await f.start('intro');
    // A new note no catalog entry lists fails catalog coverage.
    await f.call('Write', { file_path: `${root}projects/new.md`, content: '# New\n\nUncatalogued.\n' });
    await expect(submit(session)).rejects.toMatchObject({ code: 'session.gate_failed', message: expect.stringContaining('catalog.coverage') });
    const worktree = path.join(f.store.root, root);
    expect(await f.store.git(['rev-list', '--count', 'origin/main..HEAD'], worktree)).toBe('0');
    expect(await pulls()).toHaveLength(0);
    // The skill's fix: rebuild the catalog in the session, then submit again.
    const built = (await f.call('ctxr_write', { session, args: ['catalog', 'build'] })) as { exit_code: number };
    expect(built.exit_code).toBe(0);
    expect((await submit(session)).steps).toMatchObject({ gate: 'pass', pull_request: 'created' });
  });

  it('answers requested changes with a second commit on the same pull request', async () => {
    const { session, root } = await f.start('intro');
    await f.call('Edit', { file_path: `${root}projects/a.md`, old_string: 'The plan.', new_string: 'The plan, revised.' });
    await submit(session);
    await f.call('Edit', { file_path: `${root}projects/a.md`, old_string: 'The plan, revised.', new_string: 'The plan, revised, with its source.' });
    const again = await submit(session, { body: 'Why: the plan moved.\n\nWhat changed: one note, now with its source.' });
    expect(again).toMatchObject({ steps: { pull_request: 'updated', branch: 'kept' } });
    expect(await pulls()).toHaveLength(1);
    expect((await pulls())[0]!.body).toContain('now with its source');
    expect(await f.store.git(['rev-list', '--count', 'origin/main..origin/notes/intro'])).toBe('2');
  });

  it('publishes an already-made commit on a retry, without a second one', async () => {
    const { session, root } = await f.start('intro');
    await f.call('Edit', { file_path: `${root}projects/a.md`, old_string: 'The plan.', new_string: 'The plan, revised.' });
    await f.store.git(['remote', 'set-url', '--push', 'origin', path.join(f.store.tmp.root, 'nowhere.git')]);
    await expect(submit(session)).rejects.toMatchObject({ code: 'session.push_failed' });
    await f.store.git(['remote', 'set-url', '--push', 'origin', f.store.origin]);
    expect((await submit(session)).steps).toMatchObject({ commit: null, pull_request: 'created' });
    expect(await f.store.git(['rev-list', '--count', 'origin/main..origin/notes/intro'])).toBe('1');
  });

  it('refuses nothing to submit, the default branch, and another member', async () => {
    const { session, root } = await f.start('intro');
    await expect(submit(session)).rejects.toMatchObject({ code: 'session.nothing_to_submit' });
    await f.call('Edit', { file_path: `${root}projects/a.md`, old_string: 'The plan.', new_string: 'The plan, revised.' });
    await expect(submit(session, { branch: 'main' })).rejects.toMatchObject({ code: 'session.branch_is_default' });
    await expect(submit(session, {}, 'b@example.com')).rejects.toMatchObject({ code: 'mcp.no_session' });
    expect(await pulls()).toHaveLength(0);
  });

  it('returns a conflict for resolution, refuses submit until it is resolved, then lands the session on the new default branch', async () => {
    const { session, root } = await f.start('intro');
    await f.call('Edit', { file_path: `${root}projects/b.md`, old_string: 'Status: draft.', new_string: 'Status: mine.' });
    await submit(session);
    await f.store.advanceMain({ 'projects/b.md': '# B\n\nStatus: theirs.\n' }, 'theirs', { catalogued: true });
    const rebased = (await f.call('session_rebase', { session })) as { outcome: string; conflicts: { path: string; default_branch: string; session: string }[] };
    expect(rebased.outcome).toBe('conflict');
    expect(rebased.conflicts[0]).toMatchObject({ path: `${root}projects/b.md`, default_branch: expect.stringContaining('theirs'), session: expect.stringContaining('mine') });
    await expect(submit(session)).rejects.toMatchObject({ code: 'mcp.rebase_in_progress', message: expect.stringContaining('session_rebase') });
    const aborted = (await f.call('session_rebase', { session, abort: true })) as { outcome: string };
    expect(aborted.outcome).toBe('aborted');
    await f.call('session_rebase', { session });
    const worktree = path.join(f.store.root, root);
    const conflicted = await f.store.git(['show', ':3:projects/b.md'], worktree).catch(() => '');
    expect(conflicted).toContain('mine');
    const { readFile } = await import('node:fs/promises');
    const text = await readFile(path.join(worktree, 'projects/b.md'), 'utf8');
    await f.call('Edit', { file_path: `${root}projects/b.md`, old_string: text.slice(text.indexOf('<<<<<<<')), new_string: 'Status: theirs, and mine.\n' });
    expect(((await f.call('session_rebase', { session, continue: true })) as { outcome: string }).outcome).toBe('rebased');
    const again = await submit(session);
    expect(again.steps).toMatchObject({ push: 'pushed-with-lease' });
    expect(await pulls()).toHaveLength(1);
  });

  it('discards a clean session, refuses unpublished work unless forced, and drops it from the list', async () => {
    const clean = await f.start('clean');
    const result = await f.call('session_discard', { session: clean.session });
    expect(result).toMatchObject({ removed: true, forced: false });
    expect(existsSync(path.join(f.store.root, clean.root))).toBe(false);
    const dirty = await f.start('dirty');
    await f.call('Write', { file_path: `${dirty.root}projects/new.md`, content: '# New\n' });
    await expect(f.call('session_discard', { session: dirty.session })).rejects.toMatchObject({ code: 'session.discard_uncommitted' });
    await expect(f.call('session_discard', { session: dirty.session }, 'b@example.com')).rejects.toMatchObject({ code: 'mcp.no_session' });
    await f.call('session_discard', { session: dirty.session, force: true });
    expect(((await f.call('session_list', {})) as { sessions: unknown[] }).sessions).toEqual([]);
  });

  it('closes the pull request on discard only when asked', async () => {
    const { session, root } = await f.start('intro');
    await f.call('Edit', { file_path: `${root}projects/a.md`, old_string: 'The plan.', new_string: 'The plan, revised.' });
    await submit(session);
    const result = await f.call('session_discard', { session, close_pull_request: true });
    expect(result).toMatchObject({ closed_pull_request: (await pulls())[0]!.number });
    expect((await pulls())[0]!.state).toBe('closed');
  });

  it("lists a capture's session as the member's, outside the session cap", async () => {
    const captured = (await f.call('capture', { title: 'Pricing call', body: 'Two tiers.\n', source_type: 'meeting' })) as { pull_request: { number: number } };
    const { sessions } = (await f.call('session_list', {})) as { sessions: { kind: string; pull_request: { number: number } | null }[] };
    expect(sessions).toEqual([expect.objectContaining({ kind: 'capture', pull_request: expect.objectContaining({ number: captured.pull_request.number }) })]);
    expect(((await f.call('session_list', {}, 'b@example.com')) as { sessions: unknown[] }).sessions).toEqual([]);
  });
});
