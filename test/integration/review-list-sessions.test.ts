import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readConfig } from '../../src/config/load.js';
import { decidersOnForge, storeReach } from '../../src/core/approval/session-group.js';
import { ghCredentials } from '../../src/core/forge/credentials.js';
import { createGhForgeClient } from '../../src/core/forge/github.js';
import { createExecFileGitRunner } from '../../src/core/git/exec.js';
import { makeSessionPair, recordSessionDecision, type Part, type SessionPair } from '../helpers/session-stores.js';

/**
 * approve-sessions-across-stores, change-approval: a session's parts across
 * the home store and its mount, and the session state `ctxr review list`
 * reports for each.
 */
describe('ctxr review list by session, and the session state (real CLI, two fake forges)', () => {
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
  const list = async (cwd = pair.a.root) => {
    const r = await pair.cli(['review', 'list'], cwd);
    expect(r.exitCode, r.stdout + r.stderr).toBe(0);
    return r.json.data.sessions as Record<string, unknown>[];
  };
  const parts = () => [
    { store: pair.b, number: 5, head: joined.head },
    { store: pair.a, number: 7, head: home.head },
  ];

  it('reports both parts of one session, each with its store and the session-wide state', async () => {
    const before = await list();
    expect(before).toHaveLength(2);
    expect(before).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ pull_request: 7, store: 'example/ctx-a', home: 'example/ctx-a', session: `example/ctx-a:${home.branch}`, state: 'awaiting', worktree: home.name }),
        expect.objectContaining({ pull_request: 5, store: 'example/ctx-b', home: 'example/ctx-a', session: `example/ctx-a:${home.branch}`, state: 'awaiting', worktree: null }),
      ]),
    );

    // The record alone decides: the copy on ctx-b's part is missing, and both parts still read as approved.
    await recordSessionDecision({ store: pair.a, number: 7, head: home.head }, parts(), identity());
    const after = await list();
    expect(after.map((e) => e.state)).toEqual(['approved', 'approved']);
    expect(after.every((e) => e.decided_by === 'a@example.com')).toBe(true);
  });

  it('a pushed part reopens the whole session', async () => {
    await recordSessionDecision({ store: pair.a, number: 7, head: home.head }, parts(), identity());
    await pair.commitIn(joined.worktree, { 'projects/moved.md': '# Moved\n\nEdited after approval.\n' }, 'edit');
    await pair.git(['push', '-q', '--no-verify', 'origin', joined.branch], joined.worktree);
    await pair.git(['fetch', '-q', 'origin'], pair.mount);
    const after = await list();
    expect(after.map((e) => e.state)).toEqual(['needs-reapproval', 'needs-reapproval']);
    expect(after[0]!.landing_reason).toContain('example/ctx-b#5');
  });

  it('a part added after the decision reopens the session', async () => {
    await recordSessionDecision({ store: pair.a, number: 7, head: home.head }, parts(), identity());
    // Any pull request carrying the marker counts, whoever opened it.
    const { sessionMarker } = await import('../../src/core/approval/session-marker.js');
    await pair.b.forge.update((state) => {
      state.pulls.push({ number: 6, head: joined.branch, title: 'Another', body: `Why.\n\n${sessionMarker(identity())}` });
    });
    const after = await list();
    expect(after.length).toBe(3);
    expect(new Set(after.map((e) => e.state))).toEqual(new Set(['needs-reapproval']));
  });

  it('a closed named part blocks the session, naming the part', async () => {
    await recordSessionDecision({ store: pair.a, number: 7, head: home.head }, parts(), identity());
    await pair.b.forge.update((state) => {
      state.pulls.find((p) => p.number === 5)!.state = 'closed';
    });
    const after = await list();
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ pull_request: 7, state: 'blocked', part: 'example/ctx-b#5' });
    expect(after[0]!.landing_reason).toContain('closed without being merged');
  });

  it('a session with no part in its home store reads its decision from its first part', async () => {
    await pair.a.forge.update((state) => {
      state.pulls = [];
    });
    await recordSessionDecision({ store: pair.b, number: 5, head: joined.head }, [{ store: pair.b, number: 5, head: joined.head }], identity());
    const after = await list();
    expect(after).toEqual([expect.objectContaining({ pull_request: 5, store: 'example/ctx-b', state: 'approved' })]);
  });

  it('a mounted store reports a part homed elsewhere with its home', async () => {
    await recordSessionDecision({ store: pair.a, number: 7, head: home.head }, parts(), identity());
    // ctx-b's own canonical clone reads its part; the record is out of its reach, so it reads the session from the copy.
    await recordSessionDecision({ store: pair.b, number: 5, head: joined.head }, parts(), identity());
    const fromB = await list(pair.b.root);
    expect(fromB).toEqual([expect.objectContaining({ pull_request: 5, home: 'example/ctx-a', state: 'approved' })]);
  });

  it('session state: reads a mounted store\'s deciders from its configuration on the forge, not from the clone', async () => {
    const git = createExecFileGitRunner();
    const config = await readConfig(pair.a.root);
    const forgeFor = async (root: string) => ({ forge: createGhForgeClient(root, ghCredentials(pair.env)), credentials: null });
    const reach = await storeReach(git, { root: pair.a.root, canonical: pair.a.root, config, forge: (await forgeFor(pair.a.root)).forge }, forgeFor);
    expect(reach!.mounts.map((m) => m.slug)).toEqual(['example/ctx-b']);
    expect(await decidersOnForge(git, reach!.mounts[0]!)).toEqual(['@example.com']);

    // A change merged on ctx-b's forge counts at once, while ctx-a's clone of ctx-b is still behind.
    const { readFile } = await import('node:fs/promises');
    const text = await readFile(`${pair.b.root}/contexture.yaml`, 'utf8');
    await pair.advance(pair.b, { 'contexture.yaml': text.replace('deciders: ["@example.com"]', 'deciders: ["b@example.com"]') });
    expect(await decidersOnForge(git, reach!.mounts[0]!)).toEqual(['b@example.com']);
    expect(await readFile(`${pair.mount}/contexture.yaml`, 'utf8')).toContain('deciders: ["@example.com"]');
  });
});
