import { existsSync } from 'node:fs';
import { readFile, symlink } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FileChangeResult } from '../../src/core/mcp/tools/edit.js';
import { makeMcpWriteFixture, MEMBER, type McpWriteFixture } from '../helpers/mcp-write.js';

/**
 * serve-the-session-lifecycle-to-chat-apps tasks 2.2–2.3 (remote-access spec,
 * *`Edit`, `Write`, `Move` and `Delete` change a member's own session and
 * commit nothing*): the file tools write the session's working tree only, and
 * never a protected path — the hooks directory above all, which a commit in
 * the session worktree would run on the server.
 */
describe('mcp Edit, Write, Move and Delete in a session', () => {
  let f: McpWriteFixture;
  let session: string;
  let root: string;
  let worktree: string;

  beforeEach(async () => {
    f = await makeMcpWriteFixture();
    await f.store.advanceMain({ 'projects/a.md': '# A\n\nThe plan is fixed.\nThe plan is fixed.\n', 'projects/b.md': '# B\n\nStatus: draft.\n' }, 'advance main', { catalogued: true });
    ({ session, root } = await f.start('work'));
    worktree = path.join(f.store.root, root);
  });

  afterEach(async () => {
    await f.store.tmp.cleanup();
  });

  const edit = (args: Record<string, unknown>, email = MEMBER) => f.call('Edit', args, email) as Promise<unknown> as Promise<FileChangeResult>;
  const write = (args: Record<string, unknown>, email = MEMBER) => f.call('Write', args, email) as Promise<unknown> as Promise<FileChangeResult>;
  const status = () => f.store.git(['status', '--porcelain'], worktree);
  const ahead = async () => Number(await f.store.git(['rev-list', '--count', 'origin/main..HEAD'], worktree));

  it('rests an edit uncommitted in its session: no commit, no push, no pull request', async () => {
    const result = await edit({ file_path: `${root}projects/b.md`, old_string: 'Status: draft.', new_string: 'Status: final.' });
    expect(result).toMatchObject({ file_path: `${root}projects/b.md`, session, committed: false });
    expect(await readFile(path.join(worktree, 'projects/b.md'), 'utf8')).toContain('Status: final.');
    expect(await status()).toBe('M projects/b.md');
    expect(await ahead()).toBe(0);
    expect((await f.store.forge.read()).pulls).toHaveLength(0);
    expect(await f.store.git(['ls-remote', 'origin'])).not.toContain('session/');
  });

  it('refuses a write outside every session root, naming session_start and the open roots', async () => {
    const refused = write({ file_path: 'projects/new.md', content: '# New\n' });
    await expect(refused).rejects.toMatchObject({ code: 'mcp.no_session', message: expect.stringContaining('session_start'), details: { sessions: [{ session, root }] } });
    await expect(refused).rejects.toMatchObject({ message: expect.stringContaining(root) });
    expect(existsSync(path.join(f.store.root, 'projects/new.md'))).toBe(false);
    // Another member's root is no way in either.
    await expect(write({ file_path: `${root}projects/new.md`, content: '# New\n' }, 'b@example.com')).rejects.toMatchObject({ code: 'mcp.no_session' });
    expect(existsSync(path.join(worktree, 'projects/new.md'))).toBe(false);
  });

  it('refuses the hooks directory and every other protected path, writing nothing', async () => {
    for (const file_path of ['.githooks/pre-commit', '.gitattributes', '.gitignore', 'contexture.yaml', '.contexture/cache/x.md', '.worktrees/x.md', '.agents/skills/ctxr-x/SKILL.md']) {
      await expect(write({ file_path: `${root}${file_path}`, content: '#!/bin/sh\necho owned\n' })).rejects.toMatchObject({ code: 'mcp.path_protected' });
    }
    await expect(edit({ file_path: `${root}.githooks/pre-commit`, old_string: 'set -eu', new_string: 'echo owned' })).rejects.toMatchObject({ code: 'mcp.path_protected' });
    await expect(f.call('Delete', { file_path: `${root}.githooks/pre-commit` })).rejects.toMatchObject({ code: 'mcp.path_protected' });
    await expect(f.call('Move', { source_path: `${root}projects/b.md`, destination_path: `${root}.githooks/pre-push` })).rejects.toMatchObject({ code: 'mcp.path_protected' });
    expect(await status()).toBe('');
  });

  it('edits a template and the log, which are not notes', async () => {
    const template = (await f.store.git(['ls-files', '.contexture/templates'], worktree)).split('\n')[0]!;
    const text = await readFile(path.join(worktree, template), 'utf8');
    const line = text.split('\n').find((l) => l.trim() !== '')!;
    await edit({ file_path: `${root}${template}`, old_string: line, new_string: `${line} (house style)` });
    await write({ file_path: `${root}log.md`, content: '# Log\n\n- 2026-01-01 filed the plan\n' });
    expect((await status()).split('\n').sort()).toEqual([`M ${template}`, '?? log.md'].sort());
  });

  it('moves one note and deletes another, committing nothing', async () => {
    await f.call('Move', { source_path: `${root}projects/a.md`, destination_path: `${root}archive/a.md` });
    await f.call('Delete', { file_path: `${root}projects/b.md` });
    const lines = (await status()).split('\n').sort();
    expect(lines).toEqual(['D  projects/b.md', 'R  projects/a.md -> archive/a.md']);
    expect(await ahead()).toBe(0);
    // An untracked file moves too.
    await write({ file_path: `${root}projects/c.md`, content: '# C\n' });
    await f.call('Move', { source_path: `${root}projects/c.md`, destination_path: `${root}projects/d.md` });
    expect(existsSync(path.join(worktree, 'projects/d.md'))).toBe(true);
    await expect(f.call('Move', { source_path: `${root}projects/d.md`, destination_path: `${root}archive/a.md` })).rejects.toMatchObject({ code: 'mcp.file_exists' });
  });

  it('changes nothing for a missing or ambiguous old_string, a Write over an existing file, or an invalid note', async () => {
    await expect(edit({ file_path: `${root}projects/a.md`, old_string: 'not there', new_string: 'x' })).rejects.toMatchObject({ code: 'mcp.edit_failed' });
    await expect(edit({ file_path: `${root}projects/a.md`, old_string: 'The plan is fixed.', new_string: 'x' })).rejects.toMatchObject({ code: 'mcp.edit_failed', details: { occurrences: 2 } });
    await expect(write({ file_path: `${root}projects/a.md`, content: '# A\n' })).rejects.toMatchObject({ code: 'mcp.file_exists' });
    await expect(write({ file_path: `${root}projects/bad.md`, content: '---\ntitle: [unclosed\n---\nbody\n' })).rejects.toMatchObject({ code: 'mcp.not_a_note' });
    await expect(edit({ file_path: `${root}projects/a.md`, old_string: 'x', new_string: 'x' })).rejects.toMatchObject({ code: 'mcp.invalid_arguments' });
    expect(await status()).toBe('');
    const all = await edit({ file_path: `${root}projects/a.md`, old_string: 'The plan is fixed.', new_string: 'The plan moved.', replace_all: true });
    expect(all.committed).toBe(false);
    expect(await readFile(path.join(worktree, 'projects/a.md'), 'utf8')).not.toContain('fixed');
  });

  it('never follows a link out of the session', async () => {
    await symlink(f.store.tmp.root, path.join(worktree, 'escape'));
    await expect(write({ file_path: `${root}escape/owned.md`, content: '# Owned\n' })).rejects.toMatchObject({ code: 'mcp.path_outside_store' });
    expect(existsSync(path.join(f.store.tmp.root, 'owned.md'))).toBe(false);
  });

  it('refuses Move and Delete during a rebase, and lets Edit resolve a conflicting file', async () => {
    await f.store.commitInWorktree(worktree, { 'projects/b.md': '# B\n\nStatus: mine.\n' }, 'mine');
    await f.store.advanceMain({ 'projects/b.md': '# B\n\nStatus: theirs.\n' }, 'theirs', { catalogued: true });
    const rebased = (await f.call('session_rebase', { session })) as { outcome: string; conflicts: { path: string }[] };
    expect(rebased.outcome).toBe('conflict');
    expect(rebased.conflicts.map((c) => c.path)).toEqual([`${root}projects/b.md`]);
    await expect(f.call('Delete', { file_path: `${root}projects/a.md` })).rejects.toMatchObject({ code: 'mcp.rebase_in_progress', message: expect.stringContaining('session_rebase') });
    await expect(edit({ file_path: `${root}projects/a.md`, old_string: 'The plan is fixed.', new_string: 'x', replace_all: true })).rejects.toMatchObject({ code: 'mcp.rebase_in_progress' });
    const conflicted = await readFile(path.join(worktree, 'projects/b.md'), 'utf8');
    const resolved = '# B\n\nStatus: theirs, and mine.\n';
    await edit({ file_path: `${root}projects/b.md`, old_string: conflicted.slice(conflicted.indexOf('<<<<<<<')), new_string: resolved.slice(resolved.indexOf('Status')) });
    const continued = (await f.call('session_rebase', { session, continue: true })) as { outcome: string };
    expect(continued.outcome).toBe('rebased');
    expect(await f.store.git(['merge-base', '--is-ancestor', 'origin/main', 'HEAD'], worktree)).toBe('');
  });
});
