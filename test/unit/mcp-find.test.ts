import { rm } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ghCredentials } from '../../src/core/forge/credentials.js';
import type { ForgeClient, PullRequest } from '../../src/core/forge/github.js';
import { createExecFileGitRunner, type GitRunner } from '../../src/core/git/exec.js';
import { ToolRefusal } from '../../src/core/mcp/jsonrpc.js';
import { ReadWriteLock } from '../../src/core/mcp/rwlock.js';
import { McpView, viewWorktreeDir, type SyncDeps } from '../../src/core/mcp/sync.js';
import { find, parseFindArgs, type FindResult } from '../../src/core/mcp/tools/find.js';
import { openStore, type Store } from '../../src/core/store.js';
import { makeFakeEnv } from '../helpers/fake-env.js';
import { git, makeServedStore, writeStoreFile, type ServedStore } from '../helpers/mcp-store.js';
import { runCli } from '../helpers/run-cli.js';

type MatchResult = Extract<FindResult, { mode: 'match' }>;
type Stamped<T> = T & { store: { head: string; sync_error: string | null } };

describe('mcp find and the read view', () => {
  let fixture: ServedStore;
  let store: Store;
  let clock: Date;
  let openHeads: string[];

  const realGit = createExecFileGitRunner();
  const tick = (seconds: number) => {
    clock = new Date(clock.getTime() + seconds * 1000);
  };
  const forge = { openPulls: async () => openHeads.map((headRef) => ({ headRef }) as PullRequest) } as unknown as ForgeClient;
  const deps = (): SyncDeps => ({ config: store.config, credentials: ghCredentials({}), forge, env: {} });
  const newView = (gitRunner: GitRunner = realGit) => new McpView({ git: gitRunner, canonicalRoot: fixture.served, now: () => clock });
  const findIn = (view: McpView, args: Record<string, unknown>) =>
    view.read(deps(), (snapshot) => find(snapshot, parseFindArgs(args), 'https://ctx-a.example.test')) as Promise<Stamped<FindResult>>;
  const head = async (cwd: string) => (await git(cwd, fixture.env, 'rev-parse', 'HEAD')).trim();
  const remoteHead = async () => (await git(fixture.remote, fixture.env, 'rev-parse', fixture.branch)).trim();

  /** A session in the served checkout whose branch adds `relPath` — a capture awaiting a decision once its head is "open". */
  async function sessionAdding(label: string, relPath: string, content: string): Promise<string> {
    const started = await runCli(['session', 'start', label, '--json'], { cwd: fixture.served, env: fixture.env });
    if (started.exitCode !== 0) throw new Error(started.stdout + started.stderr);
    const { worktree, branch } = JSON.parse(started.stdout).data as { worktree: string; branch: string };
    await writeStoreFile(worktree, relPath, content);
    await git(worktree, fixture.env, 'add', '-A');
    await git(worktree, fixture.env, 'commit', '-q', '--no-verify', '-m', `capture ${relPath}`);
    return branch;
  }

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
    openHeads = [];
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it('matches literally and case-insensitively, in path order, with no score, honouring exclusions', async () => {
    const result = (await findIn(newView(), { text: 'Kestrel' })) as Stamped<MatchResult>;
    expect(result.mode).toBe('match');
    expect(result.notes.map((n) => n.path)).toEqual(['work/a.md', 'work/b.md']);
    const a = result.notes[0]!;
    expect(a.matching_lines).toBe(4);
    expect(a.lines.map((l) => l.line)).toEqual([6, 8, 9]);
    expect(a.url).toBe('https://ctx-a.example.test/notes/work/a.md');
    expect(JSON.stringify(result)).not.toMatch(/score|rank|relevance/);
    expect(JSON.stringify(result)).not.toContain('.contexture/scratch.md');
    expect(result.store).toEqual({ head: await remoteHead(), sync_error: null });
  });

  it('reports an inbox capture in unfiled only, and a session capture with an open pull request as pending', async () => {
    const branch = await sessionAdding('capture-kestrel', 'raw/inbox/2026-01-02-kestrel-abc123.md', '---\nsource_type: email\nsource_id: email/9\n---\nKestrel follow-up.\n');
    const view = newView();
    const unopened = (await findIn(view, { text: 'follow-up' })) as MatchResult;
    expect(unopened.unfiled).toEqual([]);

    openHeads = [branch];
    tick(61);
    const result = (await findIn(view, { text: 'kestrel' })) as MatchResult;
    expect(result.notes.map((n) => n.path)).not.toContain('raw/inbox/2026-01-01-call.md');
    expect(result.unfiled).toEqual([
      { path: 'raw/inbox/2026-01-01-call.md', lines: [{ line: 5, text: 'We discussed Kestrel.' }], matching_lines: 1, pending_merge: false, branch: null },
      { path: 'raw/inbox/2026-01-02-kestrel-abc123.md', lines: [{ line: 5, text: 'Kestrel follow-up.' }], matching_lines: 1, pending_merge: true, branch },
    ]);
  });

  it('with no text returns the catalog map, narrowed by under', async () => {
    const view = newView();
    const map = (await findIn(view, {})) as Extract<FindResult, { mode: 'map' }>;
    expect(map.mode).toBe('map');
    const paths = map.sections.flatMap((s) => s.notes.map((n) => n.path));
    expect(paths).toEqual(expect.arrayContaining(['work/a.md', 'work/b.md', 'work/c.md']));
    expect(paths).not.toContain('raw/inbox/2026-01-01-call.md');
    const narrowed = (await findIn(view, { under: 'work/', max: 2 })) as Extract<FindResult, { mode: 'map' }>;
    expect(narrowed.sections.flatMap((s) => s.notes.map((n) => n.path))).toEqual(['work/a.md', 'work/b.md']);
    expect(narrowed.notes_omitted).toBe(1);
  });

  it('refuses invalid arguments as a tool refusal', () => {
    expect(() => parseFindArgs({ text: 7 })).toThrow(ToolRefusal);
    expect(() => parseFindArgs({ max: 0 })).toThrow(ToolRefusal);
  });

  it('follows newly pushed notes once the interval has passed, and never touches the started checkout', async () => {
    const view = newView();
    await findIn(view, { text: 'kestrel' });
    // The started checkout is dirty and falls behind its remote; the view must leave it exactly so.
    await writeStoreFile(fixture.served, 'work/c.md', 'edited in the started checkout\n');
    const startedHead = await head(fixture.served);
    const startedStatus = await git(fixture.served, fixture.env, 'status', '--porcelain');
    await writeStoreFile(fixture.author, 'work/d.md', '# D\n\nkestrel arrives later\n');
    await fixture.publish('add d');

    expect(((await findIn(view, { text: 'arrives later' })) as MatchResult).notes).toEqual([]);
    tick(61);
    const later = (await findIn(view, { text: 'arrives later' })) as Stamped<MatchResult>;
    expect(later.notes.map((n) => n.path)).toEqual(['work/d.md']);
    expect(later.store.head).toBe(await remoteHead());
    expect(await head(fixture.served)).toBe(startedHead);
    expect(await git(fixture.served, fixture.env, 'status', '--porcelain')).toBe(startedStatus);
  });

  it('recreates the view when the derived cache is cleared', async () => {
    const view = newView();
    await findIn(view, { text: 'kestrel' });
    await rm(viewWorktreeDir(fixture.served), { recursive: true, force: true });
    tick(61);
    const result = (await findIn(view, { text: 'kestrel' })) as MatchResult;
    expect(result.notes.map((n) => n.path)).toEqual(['work/a.md', 'work/b.md']);
  });

  it('a call in flight is not split across commits by a sync', async () => {
    const view = newView();
    await findIn(view, {});
    const before = await remoteHead();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let viewHeadLate = '';
    const first = view.read(deps(), async (snapshot) => {
      await gate;
      viewHeadLate = await head(snapshot.store.root);
      return { snapshotHead: snapshot.head };
    });

    await writeStoreFile(fixture.author, 'work/e.md', '# E\n');
    await fixture.publish('add e');
    tick(61);
    let secondDone = false;
    const second = view.read(deps(), async (snapshot) => ({ snapshotHead: snapshot.head })).then((r) => {
      secondDone = true;
      return r;
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(secondDone).toBe(false);

    release();
    const firstResult = await first;
    expect(firstResult.snapshotHead).toBe(before);
    expect(firstResult.store.head).toBe(before);
    expect(viewHeadLate).toBe(before);
    const secondResult = await second;
    expect(secondResult.store.head).not.toBe(before);
    expect(secondResult.store.head).toBe(await remoteHead());
  });

  it('a graph rebuild failure restores the previous commit and its graph', async () => {
    const view = newView();
    await findIn(view, {});
    const before = await remoteHead();
    await writeStoreFile(fixture.author, 'work/broken.md', '---\ntitle: [unclosed\n---\nbody\n');
    await fixture.publish('break a note');
    tick(61);
    const result = (await findIn(view, { text: 'kestrel' })) as Stamped<MatchResult>;
    expect(result.store.head).toBe(before);
    expect(result.store.sync_error).toMatch(/could not be built/);
    expect(await head(viewWorktreeDir(fixture.served))).toBe(before);
    expect(result.notes.map((n) => n.path)).toEqual(['work/a.md', 'work/b.md']);
  });

  it('refuses calls when even restoring the previous commit fails', async () => {
    let previous = '';
    const failingRestore: GitRunner = {
      run: (args, opts) =>
        args[0] === 'checkout' && previous !== '' && args.includes(previous)
          ? Promise.resolve({ stdout: '', stderr: 'checkout refused', exitCode: 1 })
          : realGit.run(args, opts),
    };
    const view = newView(failingRestore);
    await findIn(view, {});
    previous = await remoteHead();
    await writeStoreFile(fixture.author, 'work/broken.md', '---\ntitle: [unclosed\n---\nbody\n');
    await fixture.publish('break a note');
    tick(61);
    await expect(findIn(view, { text: 'kestrel' })).rejects.toMatchObject({ code: 'mcp.store_unavailable' });
  });

  it('a failed fetch serves the last good commit and says why', async () => {
    const view = newView();
    await findIn(view, {});
    const before = await remoteHead();
    await git(fixture.served, fixture.env, 'remote', 'set-url', 'origin', path.join(fixture.served, 'no-such-remote.git'));
    tick(61);
    const result = (await findIn(view, { text: 'kestrel' })) as Stamped<MatchResult>;
    expect(result.store.head).toBe(before);
    expect(result.store.sync_error).toMatch(/fetch failed/);
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
