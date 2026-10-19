import { execFileSync } from 'node:child_process';
import { mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SHIPPED_DEFAULTS } from '../../src/config/defaults.js';
import type { StoreConfig } from '../../src/config/schema.js';
import { execute, type GraphDiffData } from '../../src/commands/graph-diff.js';
import { GraphDiffRefNotFoundError } from '../../src/core/errors.js';
import { ExitCode } from '../../src/core/exit-codes.js';
import { MAX_DIAGRAM_EDGES, renderDiagram, renderDiffDocument } from '../../src/core/graph/diff-document.js';
import type { Store } from '../../src/core/store.js';
import { run } from '../../src/run.js';
import { makeFakeEnv, readAll } from '../helpers/fake-env.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

/**
 * review-the-knowledge-diff: `ctxr graph diff` over real git fixtures, one
 * test per context-retrieval scenario, plus the determinism guarantees.
 */
function makeConfig(overrides: Partial<StoreConfig> = {}): StoreConfig {
  return {
    schema_version: 1,
    taxonomy: { profile: 'para', layers: [] },
    derived: { paths: ['.contexture/'] },
    retrieval: { exclude_paths: ['raw/'], demote_paths: [], gather_max_notes: 50, graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } },
    git: { default_branch: 'main' },
    session: { branch_prefix: 'session/', worktrees_path: '.worktrees/' },
    write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] },
    catalog: { path: 'catalog/', section_max_bytes: 32768 },
    publish: { path: 'publish/' },
    templates: { path: '.contexture/templates/', installed: [] },
    skills: { vendored: [] },
    update_check: SHIPPED_DEFAULTS.update_check,
    ingest: { inbox_path: 'raw/inbox/', capture_root: 'raw/', tracking_params: [] },
    organize: { archive_destination: 'archive/', rollup_stale_days: 7 },
    harness: { skills_path: 'skills/', guidance_path: 'guidance/', convention_max_bytes: 32768 },
    adapters: [],
    ...overrides,
  };
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' });
}

async function put(root: string, file: string, text: string): Promise<void> {
  await mkdir(path.dirname(path.join(root, file)), { recursive: true });
  await writeFile(path.join(root, file), text);
}

function commit(root: string, message = 'change'): string {
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '--allow-empty', '-m', message);
  return git(root, 'rev-parse', 'HEAD').trim();
}

interface Fixture {
  /** The repository's top level. */
  repo: string;
  /** The store root: the top level, or below it. */
  root: string;
  base: string;
  store: Store;
  cleanup: () => Promise<void>;
}

/**
 * A repository whose `base` branch holds `files`; the store sits at `.worktrees/session-a`
 * when `worktree`, and at `store/` below the top level when `below`.
 */
async function fixture(
  files: Record<string, string>,
  options: { worktree?: boolean; below?: boolean; config?: Partial<StoreConfig> } = {},
): Promise<Fixture> {
  const tmp = await makeTmpDir();
  const repo = options.worktree ? path.join(tmp.root, '.worktrees', 'session-a') : tmp.root;
  await mkdir(repo, { recursive: true });
  git(repo, 'init', '-q', '-b', 'main');
  const root = options.below ? path.join(repo, 'store') : repo;
  await mkdir(root, { recursive: true });
  for (const [file, text] of Object.entries(files)) await put(root, file, text);
  const base = commit(repo, 'base');
  git(repo, 'branch', 'base');
  return { repo, root, base, store: { root, config: makeConfig(options.config) }, cleanup: tmp.cleanup };
}

async function diff(fx: Fixture, flags: { since?: string; until?: string; format?: string } = {}): Promise<GraphDiffData> {
  const outcome = await execute(fx.store, { since: flags.since ?? 'base', until: flags.until, format: flags.format });
  expect(outcome.exitCode).toBe(ExitCode.Ok);
  expect(outcome.findings).toEqual([]);
  return outcome.data!;
}

async function withFixture(
  files: Record<string, string>,
  body: (fx: Fixture) => Promise<void>,
  options: Parameters<typeof fixture>[1] = {},
): Promise<void> {
  const fx = await fixture(files, options);
  try {
    await body(fx);
  } finally {
    await fx.cleanup();
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe('graph diff: the delta between two commits', () => {
  it('reports an added note, its resolving link and its dangling link', async () => {
    await withFixture({ 'ctx-a/existing.md': '# Existing\n' }, async (fx) => {
      await put(fx.root, 'ctx-a/new.md', '# New\n\n[[existing]] and [[missing]]\n');
      commit(fx.repo);
      const data = await diff(fx);
      expect(data.notes.added).toEqual(['ctx-a/new.md']);
      expect(data.links.added).toEqual([{ src: 'ctx-a/new.md', dst: 'ctx-a/existing.md', type: 'link' }]);
      expect(data.dangling.introduced).toEqual([{ from: 'ctx-a/new.md', target: 'missing', reason: 'not_found' }]);
      expect(data.inbound).toEqual([{ path: 'ctx-a/existing.md', gained: ['ctx-a/new.md'], lost: [], rollup: false }]);
      expect(data.counts.notes_added).toBe(1);
    });
  });

  it('reports a pure move as one move and no link change', async () => {
    await withFixture(
      { 'ctx-a/old.md': '# Old\n\nSome body text that stays the same.\n', 'ctx-a/linker.md': '# Linker\n\nSee [[old]].\n' },
      async (fx) => {
        await mkdir(path.join(fx.root, 'ctx-b'));
        await rename(path.join(fx.root, 'ctx-a/old.md'), path.join(fx.root, 'ctx-b/old.md'));
        commit(fx.repo);
        const data = await diff(fx);
        expect(data.notes.moved).toEqual([{ from: 'ctx-a/old.md', to: 'ctx-b/old.md' }]);
        expect(data.notes.added).toEqual([]);
        expect(data.notes.removed).toEqual([]);
        expect(data.links).toEqual({ added: [], removed: [] });
        expect(data.dangling).toEqual({ introduced: [], resolved: [] });
        expect(data.inbound).toEqual([]);
      },
    );
  });

  it('reports a move that changes the stem as a move plus a dangling link', async () => {
    await withFixture(
      { 'ctx-a/old.md': '# Old\n\nSome body text that stays the same.\n', 'ctx-a/linker.md': '# Linker\n\nSee [[old]].\n' },
      async (fx) => {
        await rename(path.join(fx.root, 'ctx-a/old.md'), path.join(fx.root, 'ctx-a/renamed.md'));
        commit(fx.repo);
        const data = await diff(fx);
        expect(data.notes.moved).toEqual([{ from: 'ctx-a/old.md', to: 'ctx-a/renamed.md' }]);
        expect(data.links.removed).toEqual([{ src: 'ctx-a/linker.md', dst: 'ctx-a/renamed.md', type: 'link' }]);
        expect(data.dangling.introduced).toEqual([{ from: 'ctx-a/linker.md', target: 'old', reason: 'not_found' }]);
      },
    );
  });

  it('reports a single-note archive once, as archived', async () => {
    await withFixture({ 'ctx-a/done.md': '# Done\n\nFinished work, kept for the record.\n' }, async (fx) => {
      await mkdir(path.join(fx.root, 'archive/ctx-a'), { recursive: true });
      await rename(path.join(fx.root, 'ctx-a/done.md'), path.join(fx.root, 'archive/ctx-a/done.md'));
      commit(fx.repo);
      const data = await diff(fx);
      expect(data.notes.archived).toEqual([{ from: 'ctx-a/done.md', to: 'archive/ctx-a/done.md' }]);
      expect(data.notes.moved).toEqual([]);
      expect(data.notes.removed).toEqual([]);
      expect(data.notes.added).toEqual([]);
    });
  });

  it('reports a folder archive as each note archived, and none removed or moved', async () => {
    await withFixture(
      { 'proj/x/one.md': '# One\n\nThe first note of the project.\n', 'proj/x/two.md': '# Two\n\nThe second note of the project.\n' },
      async (fx) => {
        await mkdir(path.join(fx.root, 'archive/proj'), { recursive: true });
        await rename(path.join(fx.root, 'proj/x'), path.join(fx.root, 'archive/proj/x'));
        commit(fx.repo);
        const data = await diff(fx, {});
        expect(data.notes.archived).toEqual([
          { from: 'proj/x/one.md', to: 'archive/proj/x/one.md' },
          { from: 'proj/x/two.md', to: 'archive/proj/x/two.md' },
        ]);
        expect(data.counts).toMatchObject({ notes_archived: 2, notes_moved: 0, notes_removed: 0, notes_added: 0 });
      },
    );
  });

  it('reports an archive into an excluded destination as archived, not removed', async () => {
    await withFixture(
      { 'ctx-a/done.md': '# Done\n\nFinished work, kept for the record.\n' },
      async (fx) => {
        await mkdir(path.join(fx.root, 'archive/ctx-a'), { recursive: true });
        await rename(path.join(fx.root, 'ctx-a/done.md'), path.join(fx.root, 'archive/ctx-a/done.md'));
        commit(fx.repo);
        const data = await diff(fx);
        expect(data.notes.archived).toEqual([{ from: 'ctx-a/done.md', to: 'archive/ctx-a/done.md' }]);
        expect(data.notes.removed).toEqual([]);
      },
      { config: { retrieval: { ...makeConfig().retrieval, exclude_paths: ['raw/', 'archive/'] } } },
    );
  });

  it('reports a link moved between relation sections as one removed and one added', async () => {
    await withFixture(
      { 'ctx-a/note.md': '# Note\n\n## Upstream\n\n- [[other]]\n\n## Downstream\n\n- nothing\n', 'ctx-a/other.md': '# Other\n' },
      async (fx) => {
        await put(fx.root, 'ctx-a/note.md', '# Note\n\n## Upstream\n\n- nothing\n\n## Downstream\n\n- [[other]]\n');
        commit(fx.repo);
        const data = await diff(fx);
        expect(data.links.removed).toEqual([{ src: 'ctx-a/note.md', dst: 'ctx-a/other.md', type: 'Upstream' }]);
        expect(data.links.added).toEqual([{ src: 'ctx-a/note.md', dst: 'ctx-a/other.md', type: 'Downstream' }]);
        expect(data.notes.modified).toEqual(['ctx-a/note.md']);
      },
    );
  });

  it('reports a resolved dangling link and the link it became', async () => {
    await withFixture({ 'ctx-a/early.md': '# Early\n\nSee [[later]].\n' }, async (fx) => {
      await put(fx.root, 'ctx-a/later.md', '# Later\n');
      commit(fx.repo);
      const data = await diff(fx);
      expect(data.dangling.resolved).toEqual([{ from: 'ctx-a/early.md', target: 'later', reason: 'not_found' }]);
      expect(data.links.added).toEqual([{ src: 'ctx-a/early.md', dst: 'ctx-a/later.md', type: 'link' }]);
    });
  });

  it('reports a rewritten rollup region', async () => {
    const fence = (text: string) =>
      `# Entity\n\n<!-- >>> contexture:rollup (managed — do not edit) >>> -->\n${text}\n<!-- <<< contexture:rollup <<< -->\n`;
    await withFixture({ 'ctx-a/entity.md': fence('Old summary.') }, async (fx) => {
      await put(fx.root, 'ctx-a/entity.md', fence('New summary.'));
      commit(fx.repo);
      const data = await diff(fx);
      expect(data.rollups).toEqual([{ path: 'ctx-a/entity.md', change: 'changed' }]);
    });
  });

  it('reports exactly the newly cited source of a modified note', async () => {
    await withFixture({ 'ctx-a/claim.md': '---\nsources:\n  - raw/one.md\n---\n# Claim\n' }, async (fx) => {
      await put(fx.root, 'ctx-a/claim.md', '---\nsources:\n  - raw/one.md\n  - raw/two.md\n---\n# Claim\n');
      commit(fx.repo);
      const data = await diff(fx);
      expect(data.sources).toEqual([{ path: 'ctx-a/claim.md', cited: ['raw/two.md'] }]);
    });
  });

  it('lists nothing under an excluded path, on either side', async () => {
    await withFixture({ 'ctx-a/a.md': '# A\n' }, async (fx) => {
      await put(fx.root, 'raw/capture.md', '# Capture\n\n[[a]] [[ghost]]\n');
      commit(fx.repo);
      const data = await diff(fx);
      expect(Object.values(data.counts).every((count) => count === 0)).toBe(true);
    });
  });

  it('handles a store below the top level with store-relative paths', async () => {
    await withFixture(
      { 'ctx-a/old.md': '# Old\n\nSome body text that stays the same.\n' },
      async (fx) => {
        await put(fx.repo, 'outside.md', '# Outside the store\n');
        await put(fx.root, 'ctx-a/new.md', '# New\n\n[[old]]\n');
        await mkdir(path.join(fx.root, 'ctx-b'));
        await rename(path.join(fx.root, 'ctx-a/old.md'), path.join(fx.root, 'ctx-b/old.md'));
        commit(fx.repo);
        const data = await diff(fx);
        expect(data.notes.added).toEqual(['ctx-a/new.md']);
        expect(data.notes.moved).toEqual([{ from: 'ctx-a/old.md', to: 'ctx-b/old.md' }]);
        expect(data.links.added).toEqual([{ src: 'ctx-a/new.md', dst: 'ctx-b/old.md', type: 'link' }]);
      },
      { below: true },
    );
  });
});

describe('graph diff: refs and forms', () => {
  it('names both full commit ids in every form', async () => {
    await withFixture({ 'ctx-a/a.md': '# A\n' }, async (fx) => {
      await put(fx.root, 'ctx-a/b.md', '# B\n');
      const head = commit(fx.repo);
      const data = await diff(fx);
      expect(data.base).toBe(fx.base);
      expect(data.head).toBe(head);
      for (const format of ['text', 'markdown']) {
        const outcome = await execute(fx.store, { since: 'base', until: undefined, format });
        expect(outcome.humanSummary).toContain(fx.base);
        expect(outcome.humanSummary).toContain(head);
      }
    });
  });

  it('refuses an unknown --since or --until ref, naming it', async () => {
    await withFixture({ 'ctx-a/a.md': '# A\n' }, async (fx) => {
      await expect(execute(fx.store, { since: 'no-such-ref', until: undefined, format: undefined })).rejects.toThrow(/no-such-ref/);
      await expect(execute(fx.store, { since: 'base', until: 'nope-head', format: undefined })).rejects.toBeInstanceOf(
        GraphDiffRefNotFoundError,
      );
    });
  });

  it('renders the block with the reproducing command, every introduced dangling link and archived note, and counts', async () => {
    await withFixture(
      { 'ctx-a/one.md': '# One\n\nFirst note to retire from here.\n', 'ctx-a/two.md': '# Two\n\nSecond note to retire from here.\n', 'ctx-a/keep.md': '# Keep\n' },
      async (fx) => {
        await put(fx.root, 'ctx-a/new.md', '# New\n\n[[gone-a]] [[gone-b]] [[gone-c]] [[keep]]\n');
        await mkdir(path.join(fx.root, 'archive/ctx-a'), { recursive: true });
        await rename(path.join(fx.root, 'ctx-a/one.md'), path.join(fx.root, 'archive/ctx-a/one.md'));
        await rename(path.join(fx.root, 'ctx-a/two.md'), path.join(fx.root, 'archive/ctx-a/two.md'));
        const head = commit(fx.repo);
        const { humanSummary } = await execute(fx.store, { since: 'base', until: undefined, format: 'markdown' });
        expect(humanSummary.startsWith('## Knowledge changes')).toBe(true);
        expect(humanSummary).toContain(`ctxr graph diff --since ${fx.base} --until ${head}`);
        for (const target of ['gone-a', 'gone-b', 'gone-c']) expect(humanSummary).toContain(`- \`ctx-a/new.md\` → \`${target}\` (not found)`);
        expect(humanSummary).toContain('`ctx-a/one.md` → `archive/ctx-a/one.md`');
        expect(humanSummary).toContain('`ctx-a/two.md` → `archive/ctx-a/two.md`');
        expect(humanSummary).toContain('1 added');
        expect(humanSummary).toContain('2 archived');
        expect(humanSummary).not.toContain('```mermaid');
        expect(humanSummary).not.toContain('Review view');
      },
    );
  });

  it('states that an empty range changes no note, still naming both ids and the command', async () => {
    await withFixture({ 'ctx-a/a.md': '# A\n' }, async (fx) => {
      await put(fx.root, 'raw/only-a-capture.md', '# Capture\n');
      const head = commit(fx.repo);
      const { humanSummary } = await execute(fx.store, { since: 'base', until: undefined, format: 'markdown' });
      expect(humanSummary).toContain('changes no note');
      expect(humanSummary).toContain(`ctxr graph diff --since ${fx.base} --until ${head}`);
    });
  });

  it('names the bare review route, with the head id, in a session worktree with no base URL', async () => {
    await withFixture(
      { 'ctx-a/a.md': '# A\n' },
      async (fx) => {
        await put(fx.root, 'ctx-a/b.md', '# B\n');
        const head = commit(fx.repo);
        const outcome = await execute(fx.store, { since: 'base', until: undefined, format: 'markdown' });
        expect(outcome.data!.review).toEqual({ route: `/review/session-a/?head=${head}`, url: null });
        expect(outcome.humanSummary).toContain(`Review view: /review/session-a/?head=${head}`);
        expect(outcome.humanSummary).toContain('server-relative route');
        expect(outcome.humanSummary).toContain('resolves only while');
        const text = await execute(fx.store, { since: 'base', until: undefined, format: 'text' });
        expect(text.humanSummary).toContain('server-relative route');
      },
      { worktree: true },
    );
  });

  it('keeps a base URL path prefix in the review address', async () => {
    await withFixture(
      { 'ctx-a/a.md': '# A\n' },
      async (fx) => {
        const head = commit(fx.repo);
        const data = await diff(fx);
        expect(data.review?.url).toBe(`https://ex.test/ctx/review/session-a/?head=${head}`);
        expect(data.base_url_declared).toBe(true);
      },
      { worktree: true, config: { serve: { base_url: 'https://ex.test/ctx/' } } },
    );
  });

  it('names no review address in the store checkout, or with previews off', async () => {
    await withFixture({ 'ctx-a/a.md': '# A\n' }, async (fx) => {
      expect((await diff(fx)).review).toBeNull();
    });
    await withFixture({ 'ctx-a/a.md': '# A\n' }, async (fx) => expect((await diff(fx)).review).toBeNull(), {
      worktree: true,
      config: { serve: { previews: 'none' } },
    });
  });
});

describe('graph diff: byte-stable, reading no checkout or cache', () => {
  async function changedFixture(fx: Fixture): Promise<void> {
    await put(fx.root, 'ctx-a/new.md', '# New\n\n[[a]] [[missing]]\n');
    await mkdir(path.join(fx.root, 'ctx-b'));
    await rename(path.join(fx.root, 'ctx-a/moved.md'), path.join(fx.root, 'ctx-b/moved.md'));
    commit(fx.repo);
  }
  const files = { 'ctx-a/a.md': '# A\n', 'ctx-a/moved.md': '# Moved\n\nA body long enough to keep its identity.\n' };

  async function allForms(fx: Fixture, flags: { since?: string; until?: string } = {}): Promise<string[]> {
    const since = flags.since ?? 'base';
    const json = JSON.stringify((await execute(fx.store, { since, until: flags.until, format: undefined })).data);
    const text = (await execute(fx.store, { since, until: flags.until, format: 'text' })).humanSummary;
    const block = (await execute(fx.store, { since, until: flags.until, format: 'markdown' })).humanSummary;
    return [json, text, block];
  }

  it('gives byte-identical output in every form across a moved clock', async () => {
    await withFixture(files, async (fx) => {
      await changedFixture(fx);
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      const first = await allForms(fx);
      vi.setSystemTime(new Date('2031-06-15T12:34:56Z'));
      expect(await allForms(fx)).toEqual(first);
    });
  });

  it('re-runs the block\'s own range exactly from a second clone whose HEAD is elsewhere', async () => {
    await withFixture(files, async (fx) => {
      await changedFixture(fx);
      const original = await diff(fx);
      const clone = path.join(path.dirname(fx.repo), 'second-clone');
      git(path.dirname(fx.repo), 'clone', '-q', fx.repo, clone);
      git(clone, 'checkout', '-q', original.base);
      const rerun = await execute({ root: clone, config: fx.store.config }, { since: original.base, until: original.head, format: undefined });
      expect(rerun.data).toEqual(original);
      await rm(clone, { recursive: true, force: true });
    });
  });

  it('ignores uncommitted edits, untracked notes and the graph artifact, and writes nothing', async () => {
    await withFixture(files, async (fx) => {
      await changedFixture(fx);
      const before = await allForms(fx);

      await put(fx.root, 'ctx-a/a.md', '# A\n\n[[new]] added but not committed\n');
      await put(fx.root, 'ctx-a/untracked.md', '# Untracked\n\n[[a]]\n');
      await put(fx.root, '.contexture/cache/graph.json', '{"nodes":[{"id":"stale.md","path":"stale.md","cluster":"(root)"}],"edges":[],"dangling":[]}\n');
      const status = git(fx.repo, 'status', '--porcelain');
      const cache = await readdir(path.join(fx.root, '.contexture/cache'));

      expect(await allForms(fx)).toEqual(before);
      expect(git(fx.repo, 'status', '--porcelain')).toBe(status);
      expect(await readdir(path.join(fx.root, '.contexture/cache'))).toEqual(cache);

      await rm(path.join(fx.root, '.contexture/cache/graph.json'));
      expect(await allForms(fx)).toEqual(before);
    });
  });

  it('is unchanged by a user configuration that turns rename detection off', async () => {
    await withFixture(files, async (fx) => {
      await changedFixture(fx);
      const before = await allForms(fx);
      git(fx.repo, 'config', 'diff.renames', 'false');
      git(fx.repo, 'config', 'diff.renameLimit', '1');
      expect(await allForms(fx)).toEqual(before);
    });
  });
});

describe('graph diff: the review document', () => {
  it('links a path only through the caller predicate, and draws added and removed edges', async () => {
    await withFixture({ 'ctx-a/a.md': '# A\n\n[[b]]\n', 'ctx-a/b.md': '# B\n', 'ctx-a/c.md': '# C\n' }, async (fx) => {
      await put(fx.root, 'ctx-a/a.md', '# A\n\n[[c]]\n');
      await put(fx.root, 'ctx-a/d.md', '# D\n');
      commit(fx.repo);
      const data = await diff(fx);
      const text = renderDiffDocument(data, { linkFor: (p) => (p === 'ctx-a/a.md' ? '/x' : null), diagram: true });
      expect(text).toContain('[`ctx-a/a.md`](/x)');
      expect(text).toContain('| `ctx-a/d.md` |');
      expect(text).toContain('```mermaid');
      expect(text).toMatch(/n\d -->/);
      expect(text).toMatch(/n\d -.->/);
      // A terminal reads this text: groups are headings, never literal HTML tags.
      expect(text).toContain('## Notes added (1)');
      expect(text).not.toMatch(/<\/?(?:details|summary)>/);
    });
  });

  it('replaces the diagram with one line past the edge cap, and escapes labels', () => {
    const many = Array.from({ length: MAX_DIAGRAM_EDGES + 1 }, (_, i) => ({ src: `a${i}.md`, dst: 'b.md', type: 'link' }));
    expect(renderDiagram(many, [])).not.toContain('```');
    expect(renderDiagram([], [])).toBeNull();
    expect(renderDiagram([{ src: 'x/"q"].md', dst: 'y.md', type: 'link' }], [])).toContain('#34;q#34;#93;');
  });
});

describe('graph diff: usage', () => {
  function streams(env: ReturnType<typeof makeFakeEnv>): { stdout: string } {
    return { stdout: readAll(env.io.stdout as unknown as PassThrough) };
  }

  it('refuses a missing --since with the usage code and no data', async () => {
    const env = makeFakeEnv();
    expect(await run(['graph', 'diff', '--json'], env)).toBe(ExitCode.Usage);
    const envelope = JSON.parse(streams(env).stdout);
    expect(envelope.command).toBe('graph.diff');
    expect(envelope.data).toBeNull();
    expect(envelope.findings[0].code).toBe('graph.diff_since_required');
  });

  it('refuses an unknown --format, naming the accepted values', async () => {
    const env = makeFakeEnv();
    expect(await run(['graph', 'diff', '--since', 'main', '--format', 'html', '--json'], env)).toBe(ExitCode.Usage);
    expect(JSON.parse(streams(env).stdout).findings[0].message).toContain('text, markdown');
  });

  it('refuses --format markdown with --json, writing no block', async () => {
    const env = makeFakeEnv();
    expect(await run(['graph', 'diff', '--since', 'main', '--format', 'markdown', '--json'], env)).toBe(ExitCode.Usage);
    const { stdout } = streams(env);
    expect(stdout).not.toContain('Knowledge changes');
    expect(JSON.parse(stdout).findings[0].code).toBe('graph.diff_format');
  });
});
