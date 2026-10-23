import { chmod, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseDecision } from '../../src/core/approval/decision.js';
import { makeSessionPair, recordSessionDecision, type Part, type SessionPair } from '../helpers/session-stores.js';

/**
 * approve-sessions-across-stores, write-lifecycle: the home store lands a
 * whole session, the part in its mount first, from one approval or one
 * explicit go.
 */
describe('ctxr land for a session across stores (real CLI, two fake forges)', () => {
  let pair: SessionPair;
  let home: Part;
  let joined: Part;

  beforeEach(async () => {
    pair = await makeSessionPair();
    home = await pair.openHome('ctx-move', 7, { 'projects/gone.md': '# Gone\n' });
    joined = await pair.openJoined(home, 5, { 'projects/moved.md': '# Moved\n' });
  });

  afterEach(async () => {
    await pair.tmp.cleanup();
  });

  const identity = () => ({ home: 'example/ctx-a', branch: home.branch });
  const bothParts = () => [
    { store: pair.b, number: 5, head: joined.head },
    { store: pair.a, number: 7, head: home.head },
  ];
  async function approve(opts: { copy?: boolean } = {}): Promise<void> {
    await recordSessionDecision({ store: pair.a, number: 7, head: home.head }, bothParts(), identity());
    if (opts.copy !== false) await recordSessionDecision({ store: pair.b, number: 5, head: joined.head }, bothParts(), identity());
  }
  const pullOf = async (part: Part) => (await part.store.forge.read()).pulls.find((p) => p.number === part.number)!;
  const land = (args: string[], cwd = pair.a.root) => pair.cli(['land', ...args], cwd);
  const onMain = async (origin: string, file: string) => (await pair.git(['--git-dir', origin, 'ls-tree', '-r', '--name-only', 'main'], pair.tmp.root)).split('\n').includes(file);

  it('one sweep lands the mounted part, then the home part', async () => {
    await approve();
    const run = await land(['--pending']);
    expect(run.exitCode, run.stdout + run.stderr).toBe(0);
    const results = run.json.data.results as { pull_request: number; store: string; outcome: string }[];
    expect(results.map((r) => [r.store, r.pull_request, r.outcome])).toEqual([
      ['example/ctx-b', 5, 'merged'],
      ['example/ctx-a', 7, 'merged'],
    ]);
    expect(run.json.data.sessions).toEqual([expect.objectContaining({ state: 'landed', landed: ['example/ctx-b#5', 'example/ctx-a#7'] })]);
    expect((await pullOf(joined)).merged).toBe(true);
    expect((await pullOf(home)).merged).toBe(true);
    expect(await onMain(pair.b.origin, 'projects/moved.md')).toBe(true);
    expect(await onMain(pair.a.origin, 'projects/gone.md')).toBe(true);
  });

  it('a mounted store leaves a session homed elsewhere to its home', async () => {
    await approve();
    // ctx-a's clone of ctx-b holds the joined session's worktree, so its own sweep would see the part.
    const run = await land(['--pending'], pair.mount);
    expect(run.exitCode, run.stdout + run.stderr).toBe(0);
    expect(run.json.data.results).toEqual([]);
    expect((await pullOf(joined)).merged ?? false).toBe(false);
  });

  it('a closed named part blocks the home part', async () => {
    await approve();
    await pair.b.forge.update((state) => {
      state.pulls.find((p) => p.number === 5)!.state = 'closed';
    });
    const run = await land(['--pending']);
    expect(run.exitCode).not.toBe(0);
    expect(run.json.data.sessions).toEqual([expect.objectContaining({ state: 'blocked', stopped_at: 'example/ctx-b#5' })]);
    expect((await pullOf(home)).merged ?? false).toBe(false);
    expect((await pullOf(home)).state ?? 'open').toBe('open');
  });

  it('a rejected push is retried, not blocked, and the next run lands the session', async () => {
    await approve();
    // ctx-b's main moves on, so the part needs a catch-up push, which ctx-b's forge then refuses.
    await pair.advance(pair.b, { 'projects/other.md': '# Other\n' });
    const hook = path.join(pair.b.origin, 'hooks', 'pre-receive');
    await writeFile(hook, '#!/bin/sh\necho "refused" >&2\nexit 1\n');
    await chmod(hook, 0o755);
    const first = await land(['--pending']);
    expect(first.json.data.sessions).toEqual([expect.objectContaining({ state: 'retrying', stopped_at: 'example/ctx-b#5', not_attempted: ['example/ctx-a#7'] })]);
    expect((await pullOf(home)).merged ?? false).toBe(false);
    // Nothing merged, yet the session reads as retrying between runs: the run recorded it on the record part.
    const between = await pair.cli(['review', 'list'], pair.a.root);
    expect(between.exitCode, between.stdout).toBe(0);
    const rows = between.json.data.sessions as { state: string; part: string; landing_reason: string }[];
    expect(rows.map((r) => r.state)).toEqual(['retrying', 'retrying']);
    expect(rows[0]!.part).toBe('example/ctx-b#5');
    expect(rows[0]!.landing_reason).toContain('push-rejected');

    await rm(hook);
    const second = await land(['--pending']);
    expect(second.json.data.sessions, second.stdout).toEqual([expect.objectContaining({ state: 'landed' })]);
    expect((await pullOf(joined)).merged).toBe(true);
    expect((await pullOf(home)).merged).toBe(true);
  });

  it('posts a missing copy before landing its part', async () => {
    await approve({ copy: false });
    expect(((await pair.b.forge.read()).reviews ?? {})[5] ?? []).toHaveLength(0);
    const run = await land(['--pending']);
    expect(run.exitCode, run.stdout + run.stderr).toBe(0);
    const [copy] = ((await pair.b.forge.read()).reviews ?? {})[5]!;
    const record = parseDecision(((await pair.a.forge.read()).reviews ?? {})[7]![0]!.body)!;
    expect(parseDecision(copy!.body)!.session!.id).toBe(record.session!.id);
    expect((await pullOf(joined)).merged).toBe(true);
    expect((await pullOf(home)).merged).toBe(true);
  });

  it('lands a session with no part in its home store from the decision on its first part', async () => {
    await pair.a.forge.update((state) => {
      state.pulls = [];
    });
    await recordSessionDecision({ store: pair.b, number: 5, head: joined.head }, [{ store: pair.b, number: 5, head: joined.head }], identity());
    const run = await land(['--pending']);
    expect(run.exitCode, run.stdout + run.stderr).toBe(0);
    expect((await pullOf(joined)).merged).toBe(true);
  });

  it('counts a part merged by another lander as landed and goes on to the home part', async () => {
    await approve();
    const first = await pair.cli(['land', '5', '--confirm'], pair.mount);
    expect(first.exitCode, first.stdout + first.stderr).toBe(0);
    const run = await land(['--pending']);
    expect(run.exitCode, run.stdout + run.stderr).toBe(0);
    expect(run.json.data.sessions).toEqual([expect.objectContaining({ state: 'landed', landed: ['example/ctx-b#5', 'example/ctx-a#7'] })]);
    expect((await pullOf(home)).merged).toBe(true);
  });

  it('--session --confirm lands the mounted part before the home part', async () => {
    expect((await land(['--session', home.name])).exitCode).toBe(2);
    const run = await land(['--session', home.name, '--confirm']);
    expect(run.exitCode, run.stdout + run.stderr).toBe(0);
    expect((run.json.data.results as { store: string }[]).map((r) => r.store)).toEqual(['example/ctx-b', 'example/ctx-a']);
    expect(run.json.data.sessions).toEqual([expect.objectContaining({ state: 'landed', landed: ['example/ctx-b#5', 'example/ctx-a#7'], not_attempted: [] })]);
    expect((await pullOf(joined)).merged).toBe(true);
    expect((await pullOf(home)).merged).toBe(true);
  });

  it('a store with no mounts lands its own marked pull request exactly as before, on a decision about that pull request alone', async () => {
    const { makeApprovalStore, recordApproval } = await import('../helpers/approval-store.js');
    const { forgeSlugOf, sessionMarker } = await import('../../src/core/approval/session-marker.js');
    const store = await makeApprovalStore();
    try {
      const s = await store.openSession('ctx-a', 7, { 'projects/a.md': '# A\n' });
      await store.forge.update((state) => {
        state.pulls[0]!.body += `\n\n${sessionMarker({ home: forgeSlugOf(store.origin)!, branch: s.branch })}`;
      });
      await recordApproval(store, 7, s.head);
      const { runCli } = await import('../helpers/run-cli.js');
      const landed = await runCli(['land', '--pending', '--json'], { cwd: store.root, env: store.env, timeoutMs: 120_000 });
      const data = JSON.parse(landed.stdout).data;
      expect(data.sessions).toBeUndefined();
      expect(data.results).toEqual([expect.objectContaining({ pull_request: 7, outcome: 'merged' })]);
    } finally {
      await store.tmp.cleanup();
    }
  });

  it('a conflict in the mounted part stops the session before the home part', async () => {
    await pair.advance(pair.b, { 'projects/moved.md': '# Moved differently\n' });
    const run = await land(['--session', home.branch, '--confirm']);
    expect(run.exitCode).not.toBe(0);
    expect(run.json.data.sessions).toEqual([
      expect.objectContaining({ state: 'blocked', stopped_at: 'example/ctx-b#5', landed: [], not_attempted: ['example/ctx-a#7'] }),
    ]);
    expect(run.json.data.sessions[0].reason).toContain('conflict');
    expect((await pullOf(home)).merged ?? false).toBe(false);
    expect((await pullOf(home)).state ?? 'open').toBe('open');
  });
});
