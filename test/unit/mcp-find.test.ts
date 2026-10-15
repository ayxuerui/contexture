import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createExecFileGitRunner, type GitRunner } from '../../src/core/git/exec.js';
import { ToolRefusal } from '../../src/core/mcp/jsonrpc.js';
import { ReadWriteLock } from '../../src/core/mcp/rwlock.js';
import { StoreSync } from '../../src/core/mcp/sync.js';
import { find, parseFindArgs, type FindResult } from '../../src/core/mcp/tools/find.js';
import { openStore, type Store } from '../../src/core/store.js';
import { makeFakeEnv } from '../helpers/fake-env.js';
import { git, makeServedStore, writeStoreFile, type ServedStore } from '../helpers/mcp-store.js';

type MatchResult = Extract<FindResult, { mode: 'match' }>;

describe('mcp find and the store sync', () => {
  let fixture: ServedStore;
  let store: Store;
  let clock: Date;

  const realGit = createExecFileGitRunner();
  const tick = (seconds: number) => {
    clock = new Date(clock.getTime() + seconds * 1000);
  };
  const newSync = (gitRunner: GitRunner = realGit, pullIntervalSeconds = 60) => new StoreSync(gitRunner, store, { pullIntervalSeconds, now: () => clock });
  const findIn = (sync: StoreSync, args: Record<string, unknown>) => sync.read((snapshot) => find(store, snapshot, parseFindArgs(args)));
  const head = async (cwd: string) => (await git(cwd, fixture.env, 'rev-parse', 'HEAD')).trim();

  beforeEach(async () => {
    fixture = await makeServedStore();
    await writeStoreFile(fixture.author, 'work/b.md', '# B\n\nThe Kestrel launch slipped a week.\n');
    await writeStoreFile(fixture.author, 'work/a.md', '---\ntitle: A\n---\n# A\n\nkestrel pricing, first draft\nnothing here\nKESTREL again\nkestrel four\nkestrel five\n');
    await writeStoreFile(fixture.author, 'work/c.md', '# C\n\nUnrelated.\n');
    await writeStoreFile(fixture.author, '.contexture/scratch.md', 'kestrel in an excluded path\n');
    await writeStoreFile(fixture.author, 'raw/inbox/2026-01-01-call.md', '---\nsource_type: meeting\nsource_id: meeting/1\n---\nWe discussed Kestrel.\n');
    await fixture.publish('seed notes');
    await git(fixture.served, fixture.env, 'pull', '-q', '--ff-only');
    store = await openStore(makeFakeEnv({ cwd: fixture.served, git: realGit }), { root: fixture.served });
    clock = new Date('2026-01-01T00:00:00Z');
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it('matches literally and case-insensitively, in path order, with no score, honouring exclusions', async () => {
    const sync = newSync(realGit, 0);
    await sync.start();
    const result = (await findIn(sync, { text: 'Kestrel' })) as MatchResult & { store: { head: string; sync_error: string | null } };
    expect(result.mode).toBe('match');
    expect(result.notes.map((n) => n.path)).toEqual(['work/a.md', 'work/b.md']);
    const a = result.notes[0]!;
    expect(a.matching_lines).toBe(4);
    expect(a.lines.map((l) => l.line)).toEqual([6, 8, 9]);
    expect(a.url).toBeNull();
    expect(JSON.stringify(result)).not.toMatch(/score|rank|relevance/);
    expect(JSON.stringify(result)).not.toContain('.contexture/scratch.md');
    expect(result.store).toEqual({ head: await head(fixture.served), sync_error: null });
  });

  it('reports an inbox capture in unfiled only, and a capture waiting on a capture/ branch as pending', async () => {
    await fixture.pushCaptureBranch('capture/2026-01-02-kestrel-abc123', 'raw/inbox/2026-01-02-kestrel-abc123.md', '---\nsource_type: email\nsource_id: email/9\n---\nKestrel follow-up.\n');
    const sync = newSync();
    await sync.start();
    const result = (await findIn(sync, { text: 'kestrel' })) as MatchResult;
    expect(result.notes.map((n) => n.path)).not.toContain('raw/inbox/2026-01-01-call.md');
    expect(result.unfiled).toEqual([
      { path: 'raw/inbox/2026-01-01-call.md', lines: [{ line: 5, text: 'We discussed Kestrel.' }], matching_lines: 1, pending_merge: false, branch: null },
      { path: 'raw/inbox/2026-01-02-kestrel-abc123.md', lines: [{ line: 5, text: 'Kestrel follow-up.' }], matching_lines: 1, pending_merge: true, branch: 'capture/2026-01-02-kestrel-abc123' },
    ]);
  });

  it('a merged capture/ branch is no longer pending', async () => {
    const branch = 'capture/2026-01-02-kestrel-abc123';
    await fixture.pushCaptureBranch(branch, 'raw/inbox/2026-01-02-kestrel-abc123.md', '---\nsource_type: email\nsource_id: email/9\n---\nKestrel follow-up.\n');
    const sync = newSync();
    await sync.start();
    expect(((await findIn(sync, { text: 'follow-up' })) as MatchResult).unfiled.map((u) => u.pending_merge)).toEqual([true]);

    await git(fixture.author, fixture.env, 'fetch', '-q', 'origin', branch);
    await git(fixture.author, fixture.env, 'merge', '-q', '--no-edit', '--no-verify', 'FETCH_HEAD');
    await git(fixture.author, fixture.env, 'push', '-q', '--no-verify', 'origin', fixture.branch);
    tick(61);
    const after = (await findIn(sync, { text: 'follow-up' })) as MatchResult;
    expect(after.unfiled).toEqual([expect.objectContaining({ path: 'raw/inbox/2026-01-02-kestrel-abc123.md', pending_merge: false, branch: null })]);
  });

  it('with no text returns the catalog map, narrowed by under', async () => {
    const sync = newSync(realGit, 0);
    await sync.start();
    const map = await findIn(sync, {});
    expect(map.mode).toBe('map');
    const paths = (map as Extract<FindResult, { mode: 'map' }>).sections.flatMap((s) => s.notes.map((n) => n.path));
    expect(paths).toEqual(expect.arrayContaining(['work/a.md', 'work/b.md', 'work/c.md']));
    expect(paths).not.toContain('raw/inbox/2026-01-01-call.md');
    const narrowed = (await findIn(sync, { under: 'work/', max: 2 })) as Extract<FindResult, { mode: 'map' }>;
    expect(narrowed.sections.flatMap((s) => s.notes.map((n) => n.path))).toEqual(['work/a.md', 'work/b.md']);
    expect(narrowed.notes_omitted).toBe(1);
  });

  it('refuses invalid arguments as a tool refusal', () => {
    expect(() => parseFindArgs({ text: 7 })).toThrow(ToolRefusal);
    expect(() => parseFindArgs({ max: 0 })).toThrow(ToolRefusal);
  });

  it('a sync fast-forwards to newly pushed notes once the interval has passed', async () => {
    const sync = newSync();
    await sync.start();
    await writeStoreFile(fixture.author, 'work/d.md', '# D\n\nkestrel arrives later\n');
    await fixture.publish('add d');
    expect(((await findIn(sync, { text: 'arrives later' })) as MatchResult).notes).toEqual([]);
    tick(61);
    expect(((await findIn(sync, { text: 'arrives later' })) as MatchResult).notes.map((n) => n.path)).toEqual(['work/d.md']);
  });

  it('a call in flight is not split across commits by a sync', async () => {
    const sync = newSync();
    await sync.start();
    const before = await head(fixture.served);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let headSeenLate = '';
    const first = sync.read(async (snapshot) => {
      await gate;
      headSeenLate = await head(fixture.served);
      return { snapshotHead: snapshot.head };
    });

    await writeStoreFile(fixture.author, 'work/e.md', '# E\n');
    await fixture.publish('add e');
    tick(61);
    let secondDone = false;
    const second = sync.read(async (snapshot) => ({ snapshotHead: snapshot.head })).then((r) => {
      secondDone = true;
      return r;
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(secondDone).toBe(false);
    expect(await head(fixture.served)).toBe(before);

    release();
    const firstResult = await first;
    expect(firstResult.snapshotHead).toBe(before);
    expect(firstResult.store.head).toBe(before);
    expect(headSeenLate).toBe(before);
    const secondResult = await second;
    expect(secondResult.store.head).not.toBe(before);
    expect(secondResult.store.head).toBe(await head(fixture.served));
  });

  it('a graph rebuild failure after a fast-forward restores the previous commit and its graph', async () => {
    const sync = newSync();
    await sync.start();
    const before = await head(fixture.served);
    await writeStoreFile(fixture.author, 'work/broken.md', '---\ntitle: [unclosed\n---\nbody\n');
    await fixture.publish('break a note');
    tick(61);
    const result = (await findIn(sync, { text: 'kestrel' })) as MatchResult & { store: { head: string; sync_error: string | null } };
    expect(result.store.head).toBe(before);
    expect(result.store.sync_error).toMatch(/graph rebuild failed/);
    expect(await head(fixture.served)).toBe(before);
    expect(result.notes.map((n) => n.path)).toEqual(['work/a.md', 'work/b.md']);
  });

  it('refuses calls when even restoring the previous commit fails', async () => {
    const failingReset: GitRunner = {
      run: (args, opts) => (args[0] === 'reset' ? Promise.resolve({ stdout: '', stderr: 'reset refused', exitCode: 1 }) : realGit.run(args, opts)),
    };
    const sync = newSync(failingReset);
    await sync.start();
    await writeStoreFile(fixture.author, 'work/broken.md', '---\ntitle: [unclosed\n---\nbody\n');
    await fixture.publish('break a note');
    tick(61);
    await expect(findIn(sync, { text: 'kestrel' })).rejects.toMatchObject({ code: 'mcp.store_unavailable' });
  });

  it('refuses to start on a dirty checkout or off the default branch', async () => {
    await writeStoreFile(fixture.served, 'work/a.md', 'edited\n');
    await expect(newSync(realGit, 0).start()).rejects.toMatchObject({ finding: { code: 'mcp.checkout_dirty' } });
    await git(fixture.served, fixture.env, 'checkout', '-q', '--', 'work/a.md');
    await git(fixture.served, fixture.env, 'checkout', '-q', '-b', 'elsewhere');
    await expect(newSync(realGit, 0).start()).rejects.toMatchObject({ finding: { code: 'mcp.not_on_default_branch' } });
  });
});

describe('ReadWriteLock', () => {
  it('a waiting writer blocks new readers and waits for readers in flight', async () => {
    const lock = new ReadWriteLock();
    const events: string[] = [];
    let releaseFirst!: () => void;
    const first = lock.read(async () => {
      events.push('read1 start');
      await new Promise<void>((r) => (releaseFirst = r));
      events.push('read1 end');
    });
    const writer = lock.write(async () => {
      events.push('write');
    });
    const second = lock.read(async () => {
      events.push('read2');
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(events).toEqual(['read1 start']);
    releaseFirst();
    await Promise.all([first, writer, second]);
    expect(events).toEqual(['read1 start', 'read1 end', 'write', 'read2']);
  });
});
