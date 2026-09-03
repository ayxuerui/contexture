import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { StoreConfig } from '../../src/config/schema.js';
import { buildGraphFromNotes } from '../../src/core/graph/model.js';
import type { Note } from '../../src/core/notes/list.js';
import { gather, ENTRY_REASONS } from '../../src/core/retrieval/pass.js';
import type { Store } from '../../src/core/store.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

function makeConfig(overrides: Partial<StoreConfig['retrieval']> = {}): StoreConfig {
  return {
    schema_version: 1,
    taxonomy: {
      profile: 'custom',
      layers: [
        { name: 'Alpha', path: 'alpha', description: 'x' },
        { name: 'Zeta', path: 'zeta', description: 'x' },
      ],
    },
    derived: { paths: [] },
    retrieval: { exclude_paths: [], demote_paths: [], gather_max_notes: 50, relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] }, ...overrides },
    git: { default_branch: 'main' },
    session: { branch_prefix: 'session/', worktrees_path: '.worktrees/' },
    write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] },
    catalog: { path: 'catalog/', section_max_bytes: 32768 },
    publish: { path: 'publish/' },
    skills: { vendored: [] },
    ingest: { inbox_path: 'inbox/', tracking_params: [] },
    organize: { archive_destination: 'zeta/', rollup_stale_days: 30, mission_path: 'guidance/mission.md' },
    harness: { skills_path: 'skills/', guidance_path: 'guidance/' },
    adapters: [],
  } as unknown as StoreConfig;
}

function note(p: string, body = '# N\n'): Note {
  return { path: p, frontmatter: undefined, body };
}

/** A store on disk is needed only so the pass can read catalog glosses. */
async function withStore(config: StoreConfig, glossLines: string[], fn: (store: Store) => Promise<void>): Promise<void> {
  const tmp = await makeTmpDir();
  try {
    await mkdir(path.join(tmp.root, 'catalog'), { recursive: true });
    for (const section of ['alpha', 'zeta', 'uncategorized']) {
      const body = glossLines.filter((l) => l.includes(`(\`${section}/`)).join('\n');
      await writeFile(path.join(tmp.root, 'catalog', `${section}.md`), `${body}\n`);
    }
    await fn({ root: tmp.root, config });
  } finally {
    await tmp.cleanup();
  }
}

describe('compose-the-retrieval-pass: the pass expands an entry set through the graph', () => {
  it('a seed arrives with its neighbours, their glosses, hop distance and evidence', async () => {
    const notes = [note('alpha/seed.md', '# Seed\n\n[[one]]\n'), note('alpha/one.md'), note('alpha/far.md')];
    const graph = buildGraphFromNotes(notes);
    const config = makeConfig();
    await withStore(config, ['- [[One]] (`alpha/one.md`) — the neighbour gloss'], async (store) => {
      const out = await gather(store, notes, graph, { seeds: ['alpha/seed.md'], hops: 1 });
      expect(out.notes.map((n) => n.path)).toEqual(['alpha/seed.md', 'alpha/one.md']);
      expect(out.notes[0]!.hops).toBe(0);
      expect(out.notes[0]!.labels).toContain('seed');
      expect(out.notes[1]!.hops).toBe(1);
      expect(out.notes[1]!.gloss).toBe('the neighbour gloss');
      expect(out.notes[1]!.labels).toContain('link_out');
      // Unreached at this budget.
      expect(out.notes.map((n) => n.path)).not.toContain('alpha/far.md');
    });
  });

  it('a catalog section seeds every note it lists', async () => {
    const notes = [note('alpha/a.md'), note('alpha/b.md'), note('zeta/z.md')];
    const graph = buildGraphFromNotes(notes);
    const config = makeConfig();
    await withStore(config, [], async (store) => {
      const out = await gather(store, notes, graph, { sections: ['alpha'], hops: 0 });
      expect(out.notes.map((n) => n.path)).toEqual(['alpha/a.md', 'alpha/b.md']);
      for (const n of out.notes) expect(n.labels).toContain('catalog_section');
    });
  });

  it('overlapping selectors deduplicate, and the note carries every reason it was reached', async () => {
    const notes = [note('alpha/a.md'), note('alpha/b.md')];
    const graph = buildGraphFromNotes(notes);
    await withStore(makeConfig(), [], async (store) => {
      const out = await gather(store, notes, graph, { seeds: ['alpha/a.md'], sections: ['alpha'], hops: 0 });
      expect(out.notes.filter((n) => n.path === 'alpha/a.md')).toHaveLength(1);
      const a = out.notes.find((n) => n.path === 'alpha/a.md')!;
      expect(a.labels).toContain('seed');
      expect(a.labels).toContain('catalog_section');
    });
  });

  it('a note with no authored gloss is labelled rather than described', async () => {
    const notes = [note('alpha/a.md')];
    const graph = buildGraphFromNotes(notes);
    await withStore(makeConfig(), [], async (store) => {
      const out = await gather(store, notes, graph, { seeds: ['alpha/a.md'], hops: 0 });
      expect(out.notes[0]!.gloss).toBe('');
      expect(out.notes[0]!.labels).toContain('no_gloss');
    });
  });

  it('a demoted note is ordered after an otherwise identical one, but is still returned', async () => {
    const notes = [note('zeta/archived.md'), note('alpha/live.md')];
    const graph = buildGraphFromNotes(notes);
    const config = makeConfig({ demote_paths: ['zeta/'] });
    await withStore(config, [], async (store) => {
      const out = await gather(store, notes, graph, { under: ['zeta/'], sections: ['alpha'], hops: 0 });
      expect(out.notes.map((n) => n.path)).toEqual(['alpha/live.md', 'zeta/archived.md']);
      expect(out.notes[1]!.tier).toBe('demoted');
    });
  });

  it('a nearer hop precedes a farther one', async () => {
    const notes = [note('alpha/a.md', '# A\n\n[[b]]\n'), note('alpha/b.md', '# B\n\n[[c]]\n'), note('alpha/c.md')];
    const graph = buildGraphFromNotes(notes);
    await withStore(makeConfig(), [], async (store) => {
      const out = await gather(store, notes, graph, { seeds: ['alpha/a.md'], hops: 2 });
      expect(out.notes.map((n) => n.hops)).toEqual([0, 1, 2]);
      expect(out.notes.map((n) => n.path)).toEqual(['alpha/a.md', 'alpha/b.md', 'alpha/c.md']);
    });
  });

  it('an entry selector matching nothing succeeds and returns nothing', async () => {
    const notes = [note('alpha/a.md')];
    const graph = buildGraphFromNotes(notes);
    await withStore(makeConfig(), [], async (store) => {
      const out = await gather(store, notes, graph, { under: ['nowhere/'], hops: 1 });
      expect(out.notes).toEqual([]);
      expect(out.budget.truncated).toBe(false);
    });
  });

  it('a capped result is a prefix of the uncapped one and names what it omitted', async () => {
    const notes = ['a', 'b', 'c', 'd', 'e'].map((n) => note(`alpha/${n}.md`));
    const graph = buildGraphFromNotes(notes);
    await withStore(makeConfig(), [], async (store) => {
      const uncapped = await gather(store, notes, graph, { sections: ['alpha'], hops: 0, maxNotes: 100 });
      const capped = await gather(store, notes, graph, { sections: ['alpha'], hops: 0, maxNotes: 2 });
      expect(capped.notes.map((n) => n.path)).toEqual(uncapped.notes.map((n) => n.path).slice(0, 2));
      expect(capped.budget).toMatchObject({ maxNotes: 2, returned: 2, omitted: 3, truncated: true });
      expect(uncapped.budget.truncated).toBe(false);
    });
  });

  it('no result carries a numeric relevance value', async () => {
    const notes = [note('alpha/a.md', '# A\n\n[[b]]\n'), note('alpha/b.md')];
    const graph = buildGraphFromNotes(notes);
    await withStore(makeConfig(), [], async (store) => {
      const out = await gather(store, notes, graph, { seeds: ['alpha/a.md'], hops: 1 });
      for (const n of out.notes) {
        // hops and bytes are counts of structure and of the file; neither is a
        // predicted relevance, and there is no other number in the shape.
        expect(Object.keys(n).sort()).toEqual(
          ['bytes', 'cluster', 'gloss', 'hash', 'hops', 'labels', 'path', 'section', 'tier'].sort(),
        );
        expect(n).not.toHaveProperty('score');
      }
    });
  });

  it('the entry-reason precedence is frozen, since the order depends on it', () => {
    expect([...ENTRY_REASONS]).toEqual(['seed', 'catalog_section', 'under_prefix', 'backlink', 'link_in', 'link_out']);
  });
});
