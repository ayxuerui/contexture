import { chmod, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createExecFileGitRunner } from '../../src/core/git/exec.js';
import { listWorktrees } from '../../src/core/git/worktree.js';
import type { DraftResult } from '../../src/core/mcp/tools/edit.js';
import type { ReadResult } from '../../src/core/mcp/tools/files.js';
import { makeMcpWriteFixture, MEMBER, type McpWriteFixture } from '../helpers/mcp-write.js';

describe('mcp Edit and Write into a member draft', () => {
  let f: McpWriteFixture;

  beforeEach(async () => {
    f = await makeMcpWriteFixture();
    await f.store.advanceMain({ 'projects/a.md': '# A\n\nThe plan is fixed.\nThe plan is fixed.\n', 'projects/b.md': '# B\n\nStatus: draft.\n' });
  });

  afterEach(async () => {
    await f.store.tmp.cleanup();
  });

  const edit = (args: Record<string, unknown>, email = MEMBER) => f.call('Edit', args, email) as Promise<unknown> as Promise<DraftResult>;
  const write = (args: Record<string, unknown>, email = MEMBER) => f.call('Write', args, email) as Promise<unknown> as Promise<DraftResult>;
  const read = (file_path: string) => f.call('Read', { file_path }) as Promise<unknown> as Promise<ReadResult>;
  const pulls = async () => (await f.store.forge.read()).pulls;
  const drafts = async () => (await listWorktrees(createExecFileGitRunner(), f.store.root)).filter((w) => w.branch?.includes('mcp-draft-'));
  const commitsOn = async (branch: string) => Number(await f.store.git(['rev-list', '--count', `origin/main..${branch}`]));

  it('opens one draft pull request on the first edit, authored by the member, leaving main alone', async () => {
    const mainBefore = await f.store.git(['ls-remote', 'origin', 'refs/heads/main']);
    const result = await edit({ file_path: 'projects/b.md', old_string: 'Status: draft.', new_string: 'Status: final.' });
    expect(result).toMatchObject({ changed: true, already_applied: false, file_path: 'projects/b.md' });
    const [pull] = await pulls();
    expect(pull).toMatchObject({ number: result.pull_request.number, state: 'open', title: `Edits by ${MEMBER}` });
    expect(await commitsOn(`origin/${pull!.head}`)).toBe(1);
    expect(await f.store.git(['log', '-1', '--format=%ae%n%s%n%b', `origin/${pull!.head}`])).toBe(`${MEMBER}\nEdit projects/b.md\nEdited-by: ${MEMBER}`);
    expect(await f.store.git(['diff', '--name-only', `origin/main...origin/${pull!.head}`])).toContain('projects/b.md');
    expect(await f.store.git(['ls-remote', 'origin', 'refs/heads/main'])).toBe(mainBefore);
  });

  it('collects Write, then Edit, then Read of a new note in the same pull request', async () => {
    await edit({ file_path: 'projects/b.md', old_string: 'Status: draft.', new_string: 'Status: final.' });
    const written = await write({ file_path: 'projects/new.md', content: '# New\n\nFirst version.\n' });
    const edited = await edit({ file_path: 'projects/new.md', old_string: 'First version.', new_string: 'Second version.' });
    expect(written.pull_request.number).toBe(edited.pull_request.number);
    expect(await pulls()).toHaveLength(1);
    expect(await commitsOn(`origin/${(await pulls())[0]!.head}`)).toBe(3);
    const mine = await read('projects/new.md');
    expect(mine).toMatchObject({ draft: true });
    expect(mine.content).toContain('Second version.');
    // The catalog follows the change, as it would in an agent's session.
    expect(await f.store.git(['diff', '--name-only', `origin/main...origin/${(await pulls())[0]!.head}`])).toMatch(/catalog/);
  });

  it('changes nothing for a missing or ambiguous old_string, or a Write over an existing note', async () => {
    await expect(edit({ file_path: 'projects/a.md', old_string: 'not there', new_string: 'x' })).rejects.toMatchObject({ code: 'mcp.edit_failed' });
    await expect(edit({ file_path: 'projects/a.md', old_string: 'The plan is fixed.', new_string: 'x' })).rejects.toMatchObject({ code: 'mcp.edit_failed', details: { occurrences: 2 } });
    await expect(write({ file_path: 'projects/a.md', content: '# A\n' })).rejects.toMatchObject({ code: 'mcp.file_exists' });
    expect(await pulls()).toHaveLength(0);
    expect(await drafts()).toHaveLength(0);
    const all = await edit({ file_path: 'projects/a.md', old_string: 'The plan is fixed.', new_string: 'The plan moved.', replace_all: true });
    expect(all.changed).toBe(true);
    expect((await read('projects/a.md')).content).not.toContain('fixed');
  });

  it('refuses configuration, captures, derived files and non-notes', async () => {
    for (const file_path of ['contexture.yaml', 'raw/inbox/x.md', '.contexture/cache/x.md', 'AGENTS.md', 'projects/notes.txt']) {
      await expect(write({ file_path, content: '# X\n' })).rejects.toMatchObject({ code: expect.stringMatching(/^mcp\.path_not_(editable|readable)$/) });
    }
    expect(await pulls()).toHaveLength(0);
  });

  it('refuses a result that is not a valid note, committing nothing', async () => {
    await expect(write({ file_path: 'projects/bad.md', content: '---\ntitle: [unclosed\n---\nbody\n' })).rejects.toMatchObject({ code: 'mcp.not_a_note' });
    expect(await drafts()).toHaveLength(0);
  });

  it('resumes after a failed push and after a failed pull request, with exactly one commit', async () => {
    await f.store.git(['remote', 'set-url', '--push', 'origin', path.join(f.store.tmp.root, 'nowhere.git')]);
    await expect(edit({ file_path: 'projects/b.md', old_string: 'Status: draft.', new_string: 'Status: final.' })).rejects.toMatchObject({ code: 'mcp.push_failed' });
    await f.store.git(['remote', 'set-url', '--push', 'origin', f.store.origin]);
    await f.store.forge.update((state) => {
      state.failCreatePull = 1;
    });
    await expect(edit({ file_path: 'projects/b.md', old_string: 'Status: draft.', new_string: 'Status: final.' })).rejects.toMatchObject({ code: 'mcp.pull_request_failed' });
    const retried = await edit({ file_path: 'projects/b.md', old_string: 'Status: draft.', new_string: 'Status: final.' });
    expect(retried).toMatchObject({ already_applied: true, changed: false });
    expect(await pulls()).toHaveLength(1);
    expect(await commitsOn(`origin/${(await pulls())[0]!.head}`)).toBe(1);
  });

  it('leaves the draft exactly as it was when the store refuses the commit', async () => {
    await edit({ file_path: 'projects/b.md', old_string: 'Status: draft.', new_string: 'Status: final.' });
    const hooks = path.join(f.store.tmp.root, 'refusing-hooks');
    await mkdir(hooks, { recursive: true });
    await writeFile(path.join(hooks, 'pre-commit'), '#!/bin/sh\ngit diff --cached | grep -q REFUSE && { echo "store says no: REFUSE is not allowed"; exit 1; }\nexit 0\n');
    await chmod(path.join(hooks, 'pre-commit'), 0o755);
    await f.store.git(['config', 'core.hooksPath', hooks]);
    const [draft] = await drafts();
    const tipBefore = await f.store.git(['rev-parse', 'HEAD'], draft!.path);
    await expect(edit({ file_path: 'projects/b.md', old_string: 'Status: final.', new_string: 'Status: REFUSE.' })).rejects.toMatchObject({ code: 'mcp.commit_refused', message: expect.stringContaining('store says no') });
    expect(await f.store.git(['rev-parse', 'HEAD'], draft!.path)).toBe(tipBefore);
    expect(await f.store.git(['status', '--porcelain'], draft!.path)).toBe('');
    expect((await read('projects/b.md')).content).toContain('Status: final.');
  });

  it('starts a new draft when the previous one was closed without merging', async () => {
    const first = await edit({ file_path: 'projects/b.md', old_string: 'Status: draft.', new_string: 'Status: final.' });
    await f.store.forge.update((state) => {
      state.pulls[0]!.state = 'closed';
    });
    const second = await edit({ file_path: 'projects/b.md', old_string: 'Status: draft.', new_string: 'Status: closed out.' });
    expect(second.pull_request.number).not.toBe(first.pull_request.number);
    expect(await drafts()).toHaveLength(1);
  });

  it('keeps two members in two drafts', async () => {
    const a = await edit({ file_path: 'projects/b.md', old_string: 'Status: draft.', new_string: 'Status: a.' });
    const b = await edit({ file_path: 'projects/a.md', old_string: '# A', new_string: '# A, edited' }, 'b@example.com');
    expect(a.pull_request.number).not.toBe(b.pull_request.number);
    expect(await drafts()).toHaveLength(2);
  });

  it('never reports a wrong-text deletion as already applied (review finding)', async () => {
    await edit({ file_path: 'projects/b.md', old_string: 'Status: draft.', new_string: 'Status: final.' });
    await expect(edit({ file_path: 'projects/b.md', old_string: 'no such text', new_string: '' })).rejects.toMatchObject({ code: 'mcp.edit_failed' });
    await expect(edit({ file_path: 'projects/b.md', old_string: 'no such text', new_string: '#' })).rejects.toMatchObject({ code: 'mcp.edit_failed' });
  });

  it('clears a draft left with no commit by a crash, instead of failing every later edit (review finding)', async () => {
    const { startSession } = await import('../../src/core/mcp/sessions.js');
    const { draftLabel } = await import('../../src/core/mcp/drafts.js');
    await startSession(f.write, draftLabel(MEMBER));
    expect(await drafts()).toHaveLength(1);
    const result = await edit({ file_path: 'projects/b.md', old_string: 'Status: draft.', new_string: 'Status: final.' });
    expect(result.changed).toBe(true);
    expect(await drafts()).toHaveLength(1);
    expect(await pulls()).toHaveLength(1);
  });
});
