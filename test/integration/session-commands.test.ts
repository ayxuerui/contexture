import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeApprovalStore, type ApprovalStore } from '../helpers/approval-store.js';
import { runCli, type RunCliResult } from '../helpers/run-cli.js';

/**
 * bring-the-session-lifecycle-into-the-cli: `ctxr session status`, `submit`,
 * `rebase`, `discard` and the extended `list`, through the built binary
 * against a bare origin and the fake `gh`, for their envelopes and their
 * D3 exit codes.
 */
describe('ctxr session status|submit|rebase|discard|list (real CLI, fake forge)', () => {
  let store: ApprovalStore;

  beforeEach(async () => {
    store = await makeApprovalStore();
  });

  afterEach(async () => {
    await store.tmp.cleanup();
  });

  const ctxr = (args: readonly string[], cwd = store.root): Promise<RunCliResult> => runCli([...args, '--json'], { cwd, env: store.env, timeoutMs: 60_000 });
  const data = (result: RunCliResult) => JSON.parse(result.stdout).data;
  const codes = (result: RunCliResult): string[] => (JSON.parse(result.stdout).findings as { code: string }[]).map((f) => f.code);

  async function start(label: string): Promise<{ name: string; worktree: string; branch: string }> {
    const started = await ctxr(['session', 'start', label]);
    expect(started.exitCode, started.stdout + started.stderr).toBe(0);
    const { worktree, branch } = data(started) as { worktree: string; branch: string };
    return { name: path.basename(worktree), worktree, branch };
  }

  async function write(worktree: string, files: Record<string, string>): Promise<void> {
    for (const [rel, text] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(worktree, rel)), { recursive: true });
      await writeFile(path.join(worktree, rel), text);
    }
    const built = await runCli(['catalog', 'build'], { cwd: worktree, env: store.env, timeoutMs: 60_000 });
    expect(built.exitCode, built.stderr).toBe(0);
  }

  it('status reports uncommitted work, reads the session it runs in, and is refused outside one', async () => {
    await store.advanceMain({ 'projects/a.md': '# A\n' });
    const session = await start('ctx-a-intro');
    await writeFile(path.join(session.worktree, 'projects/a.md'), '# A\n\nEdited.\n');
    await writeFile(path.join(session.worktree, 'projects/new.md'), '# New\n');

    const named = await ctxr(['session', 'status', session.name]);
    expect(named.exitCode, named.stdout).toBe(0);
    expect(data(named)).toMatchObject({ session: session.name, ahead: 0, diff: null });
    expect((data(named).uncommitted as { path: string }[]).map((c) => c.path).sort()).toEqual(['projects/a.md', 'projects/new.md']);

    const here = await ctxr(['session', 'status', '--diff'], path.join(session.worktree, 'projects'));
    expect(here.exitCode, here.stdout).toBe(0);
    expect(data(here).session).toBe(session.name);
    expect(data(here).diff).toContain('+Edited.');

    const outside = await ctxr(['session', 'status']);
    expect(outside.exitCode).toBe(2);
    expect(codes(outside)).toEqual(['session.not_in_session']);
  });

  it('submits a session, and session list shows its pull request', async () => {
    const session = await start('ctx-a-intro');
    await write(session.worktree, { 'projects/intro.md': '# Intro\n\nThe new intro.\n' });
    const submitted = await ctxr(['session', 'submit', session.name, '--branch', 'notes/intro', '--message', 'Rewrite the intro', '--title', 'Rewrite the intro', '--body', 'Why: the intro was out of date.']);
    expect(submitted.exitCode, submitted.stdout + submitted.stderr).toBe(0);
    expect(data(submitted)).toMatchObject({ branch: 'notes/intro', pull_request: { number: 1 }, approval_url: `http://127.0.0.1:1/approve/${session.name}/`, steps: { pull_request: 'created' } });
    const [pull] = (await store.forge.read()).pulls;
    expect(pull).toMatchObject({ head: 'notes/intro', title: 'Rewrite the intro' });
    expect(pull!.body).toContain('## Knowledge changes');

    const local = await ctxr(['session', 'list']);
    expect(local.exitCode).toBe(0);
    const row = (data(local).sessions as { name: string }[]).find((s) => s.name === session.name);
    expect(row).toMatchObject({ branch: 'notes/intro', uncommitted: false, ahead: 1 });
    expect(row).not.toHaveProperty('pull_request');

    const reviewed = await ctxr(['session', 'list', '--review']);
    expect(reviewed.exitCode).toBe(0);
    expect((data(reviewed).sessions as { name: string }[]).find((s) => s.name === session.name)).toMatchObject({ pull_request: { number: 1, state: 'open' }, review: { state: 'awaiting' } });
  });

  it('exits 3 when the store fails its check, and 2 for a refused body or arguments, committing nothing', async () => {
    const session = await start('ctx-a-intro');
    await write(session.worktree, { 'projects/intro.md': '# Intro\n' });
    const base = ['session', 'submit', session.name, '--branch', 'notes/intro', '--message', 'm', '--title', 't'];

    const knowledge = await ctxr([...base, '--body', 'Why.\n\n## Knowledge changes\n\nhand-written']);
    expect(knowledge.exitCode).toBe(2);
    expect(codes(knowledge)).toEqual(['session.body_has_generated_section']);
    expect((await ctxr([...base, '--body', 'a', '--body-file', 'b'])).exitCode).toBe(2);
    expect((await ctxr(['session', 'submit', session.name, '--message', 'm', '--title', 't', '--body', 'b'])).exitCode).toBe(2);
    expect((await ctxr([...base.slice(0, 4), 'main', ...base.slice(5), '--body', 'b'])).exitCode).toBe(2);

    await writeFile(path.join(session.worktree, 'projects/broken.md'), '---\ntitle: [unclosed\n---\nbody\n');
    const gated = await ctxr([...base, '--body', 'Why.']);
    expect(gated.exitCode, gated.stdout).toBe(3);
    expect(codes(gated)).toEqual(['session.gate_failed']);
    expect(await store.git(['rev-list', '--count', `origin/main..${session.branch}`])).toBe('0');
    expect((await store.forge.read()).pulls).toHaveLength(0);
  });

  it('rebase reports a conflict with exit 3, submit waits on it, and --abort restores the session', async () => {
    await store.advanceMain({ 'projects/intro.md': '# Intro\n\nOriginal line.\n' });
    const session = await start('ctx-a-intro');
    const head = await store.commitInWorktree(session.worktree, { 'projects/intro.md': '# Intro\n\nSession line.\n' }, 'session edit');
    await store.advanceMain({ 'projects/intro.md': '# Intro\n\nMain line.\n' });

    const conflicted = await ctxr(['session', 'rebase', session.name]);
    expect(conflicted.exitCode, conflicted.stdout).toBe(3);
    expect(data(conflicted)).toMatchObject({ outcome: 'conflict', conflicts: [{ path: 'projects/intro.md', default_branch: '# Intro\n\nMain line.\n', session: '# Intro\n\nSession line.\n' }] });
    expect(codes(conflicted)).toEqual(['session.rebase_conflict']);

    const blocked = await ctxr(['session', 'submit', session.name, '--branch', 'notes/intro', '--message', 'm', '--title', 't', '--body', 'b']);
    expect(blocked.exitCode).toBe(3);
    expect(codes(blocked)).toEqual(['session.rebase_in_progress']);

    expect((await ctxr(['session', 'rebase', session.name, '--continue', '--abort'])).exitCode).toBe(2);
    const aborted = await ctxr(['session', 'rebase', session.name, '--abort']);
    expect(aborted.exitCode).toBe(0);
    expect(data(aborted)).toMatchObject({ outcome: 'aborted', head });
  });

  it('discard refuses the canonical clone with 2 and uncommitted work with 3, and removes with --force', async () => {
    const session = await start('ctx-a-intro');
    await writeFile(path.join(session.worktree, 'projects/x.md'), '# X\n');

    const canonical = await ctxr(['session', 'discard', path.basename(store.root)]);
    expect(canonical.exitCode).toBe(2);
    expect(codes(canonical)).toEqual(['session.not_a_session']);
    const dirty = await ctxr(['session', 'discard', session.name]);
    expect(dirty.exitCode).toBe(3);
    expect(codes(dirty)).toEqual(['session.discard_uncommitted']);
    expect(await store.git(['worktree', 'list'])).toContain(session.worktree);

    const forced = await ctxr(['session', 'discard', session.name, '--force']);
    expect(forced.exitCode, forced.stdout).toBe(0);
    expect(await store.git(['worktree', 'list'])).not.toContain(session.worktree);
  });

  it('session list --review still exits 0 when the forge cannot be reached', async () => {
    const opened = await store.openSession('ctx-c', 3, { 'projects/c.md': '# C\n' });
    await store.forge.update((state) => {
      state.fail = { pulls: 502 };
    });
    const listed = await ctxr(['session', 'list', '--review']);
    expect(listed.exitCode).toBe(0);
    expect(codes(listed)).toEqual(['forge.unreachable']);
    expect((data(listed).sessions as { name: string }[]).find((s) => s.name === opened.name)).toMatchObject({ pull_request: { state: 'unknown' }, review: { state: 'unknown' } });
  });
});
