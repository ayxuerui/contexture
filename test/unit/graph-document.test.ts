import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { execute as graphBuild } from '../../src/commands/graph-build.js';
import type { StoreConfig } from '../../src/config/schema.js';
import { renderGraphDocument } from '../../src/core/graph/document.js';
import { buildGraphFromNotes } from '../../src/core/graph/model.js';
import { GRAPH_DOCUMENT_RELATIVE_PATH } from '../../src/core/graph/persist.js';
import type { Note } from '../../src/core/notes/list.js';
import type { Store } from '../../src/core/store.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

function note(p: string, body: string): Note {
  return { path: p, frontmatter: undefined, body };
}

const SETTINGS = { hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] as string[] };

function makeConfig(overrides: Partial<StoreConfig['retrieval']['graph']> = {}): StoreConfig {
  return {
    schema_version: 1,
    taxonomy: { profile: 'custom', layers: [{ name: 'Alpha', path: 'alpha', description: 'x' }] },
    fields: { visibility: 'scope' },
    visibility: { default_context: 'ctx-default', directory_defaults: {}, contexts: {} },
    derived: { paths: [] },
    retrieval: {
      exclude_paths: ['.contexture/'], // as every real store: the cache the build writes into must not be re-read as notes
      relations: ['supports'],
      graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [], ...overrides },
    },
    git: { default_branch: 'main' },
    session: { branch_prefix: 'session/', worktrees_path: '.worktrees/' },
    write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] },
    catalog: { path: 'catalog/', section_max_bytes: 32768 },
    disclosure: { internal_audiences: [], hard_walls: [] },
    ingest: { inbox_path: 'inbox/' },
    organize: { archive_path: 'archive/' },
    identity: { path: 'identity/', files: {}, entry_delimiter: '' },
    harness: { procedures_path: 'procedures/', conventions_path: 'conventions/' },
    adapters: [],
  };
}

async function writeNote(root: string, rel: string, content: string): Promise<void> {
  const full = path.join(root, rel);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content);
}

describe('renderGraphDocument (graph-context-document D5)', () => {
  it('groups hubs by cluster, sorted by backlinks then id, capped at hub_top, omitting clusters with no backlinked note', () => {
    const notes = [
      note('alpha/x/hub.md', ''),
      note('alpha/x/second.md', ''),
      note('alpha/x/third.md', ''),
      note('alpha/y/lonely.md', ''),
      note('alpha/x/a.md', '[[hub]] [[second]] [[third]]'),
      note('alpha/x/b.md', '[[hub]] [[second]]'),
      note('alpha/x/c.md', '[[hub]]'),
    ];
    const { text } = renderGraphDocument(buildGraphFromNotes(notes), { ...SETTINGS, hub_top: 2 });
    const hubSection = text.split('## Hub notes by cluster')[1]!.split('## Cross-cluster bridges')[0]!;
    expect(hubSection).toContain('### alpha/x');
    expect(hubSection).toContain('| [[hub]] | 3 |\n| [[second]] | 2 |');
    expect(hubSection).not.toContain('[[third]]'); // capped at 2
    expect(hubSection).not.toContain('### alpha/y'); // no backlinked note there
  });

  it('scores bridges by distinct clusters linked into, not by link count (D4), and lists them with their clusters', () => {
    const notes = [
      note('alpha/p/a.md', '[[q1]] [[q2]] [[q3]]'), // three links, one other cluster
      note('alpha/p/b.md', '[[q1]] [[r1]]'), // two links, two other clusters
      note('alpha/q/q1.md', ''),
      note('alpha/q/q2.md', ''),
      note('alpha/q/q3.md', ''),
      note('alpha/r/r1.md', ''),
    ];
    const { text, summary } = renderGraphDocument(buildGraphFromNotes(notes), SETTINGS);
    const bridgeSection = text.split('## Cross-cluster bridges')[1]!.split('## Orphans')[0]!;
    const lines = bridgeSection.split('\n').filter((l) => l.startsWith('- '));
    expect(lines[0]).toBe('- [[b]] — alpha/p ⇔ alpha/q ⇔ alpha/r (2 clusters)');
    expect(lines[1]).toBe('- [[a]] — alpha/p ⇔ alpha/q (1 cluster)');
    expect(summary.bridges).toBe(2);
  });

  it('lists orphans (zero backlinks) by cluster, excluding exempt clusters, while counting the rest', () => {
    const notes = [note('alpha/x/a.md', '[[b]]'), note('alpha/x/b.md', ''), note('alpha/scratch/s.md', '')];
    const plain = renderGraphDocument(buildGraphFromNotes(notes), SETTINGS);
    expect(plain.text).toContain('- [[a]] — alpha/x');
    expect(plain.text).toContain('- [[s]] — alpha/scratch');
    expect(plain.summary.orphans).toBe(2);

    const exempt = renderGraphDocument(buildGraphFromNotes(notes), { ...SETTINGS, orphan_exempt_clusters: ['alpha/scratch'] });
    expect(exempt.text).not.toContain('[[s]]');
    expect(exempt.summary.orphans).toBe(1);
  });

  it('reports typed link counts and carries no timestamp', () => {
    const notes = [note('alpha/x/a.md', '## Supports\n- [[b]]\n\n## Notes\n[[c]]'), note('alpha/x/b.md', ''), note('alpha/x/c.md', '')];
    const { text, summary } = renderGraphDocument(buildGraphFromNotes(notes, { relations: ['supports'] }), SETTINGS);
    expect(summary).toMatchObject({ notes: 3, links: 2, typedLinks: 1, clusters: 1 });
    expect(text).toContain('- Links: 2 (1 typed)');
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

describe('ctxr graph build writes the document (graph-context-document D1)', () => {
  it('is byte-identical across two builds of an unchanged store and reports the document path and counts', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await writeNote(tmp.root, 'alpha/x/a.md', '## Supports\n- [[b]]\n');
      await writeNote(tmp.root, 'alpha/x/b.md', '[[c]]\n');
      await writeNote(tmp.root, 'alpha/y/c.md', '\n');

      const first = await graphBuild(store);
      const docPath = path.join(tmp.root, GRAPH_DOCUMENT_RELATIVE_PATH);
      const firstText = await readFile(docPath, 'utf8');
      expect(first.data?.document).toMatchObject({ path: GRAPH_DOCUMENT_RELATIVE_PATH, notes: 3, links: 2, typedLinks: 1, clusters: 2, bridges: 1, orphans: 1 });
      expect(first.humanSummary).toContain(GRAPH_DOCUMENT_RELATIVE_PATH);

      const second = await graphBuild(store);
      expect(await readFile(docPath, 'utf8')).toBe(firstText);
      expect(second.data?.document).toEqual(first.data?.document);
    } finally {
      await tmp.cleanup();
    }
  });

  it('an exempt cluster is absent from the document while lint still sees its orphan', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig({ orphan_exempt_clusters: ['alpha/scratch'] }) };
      await writeNote(tmp.root, 'alpha/scratch/s.md', '\n');
      await writeNote(tmp.root, 'alpha/x/a.md', '[[b]]\n');
      await writeNote(tmp.root, 'alpha/x/b.md', '\n');
      await graphBuild(store);
      const text = await readFile(path.join(tmp.root, GRAPH_DOCUMENT_RELATIVE_PATH), 'utf8');
      expect(text).not.toContain('[[s]]');
      const { orphanNotesCheck } = await import('../../src/core/checks/organize-checks.js');
      expect(orphanNotesCheck.id).toBe('organize.orphan_notes'); // the lint check is untouched by the document's exemption
    } finally {
      await tmp.cleanup();
    }
  });
});
