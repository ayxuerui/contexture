import { describe, expect, it } from 'vitest';
import type { StoreConfig } from '../../src/config/schema.js';
import { scanForLeaks, scanNoteForLeaks } from '../../src/core/disclosure/leak-scan.js';
import type { Note } from '../../src/core/notes/list.js';

function makeConfig(overrides: Partial<StoreConfig['disclosure']> = {}, contexts: StoreConfig['visibility']['contexts'] = {}): StoreConfig {
  return {
    schema_version: 1,
    taxonomy: { profile: 'para', layers: [] },
    fields: { visibility: 'scope' },
    visibility: { default_context: 'ctx-a', directory_defaults: {}, contexts },
    derived: { paths: [] },
    retrieval: { exclude_paths: [], relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } },
    git: { default_branch: 'main' },
    session: { branch_prefix: 'session/', worktrees_path: '.worktrees/', workspaces_external: false },
    write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] },
    catalog: { path: 'catalog/', section_max_bytes: 32768 },
    publish: { path: 'publish/' },
    skills: { vendored: [] },
    disclosure: { internal_audiences: [], hard_walls: [], leak_markers: {}, ...overrides },
    ingest: { inbox_path: 'inbox/', tracking_params: [] },
    organize: { archive_path: 'archive/', rollup_stale_days: 7 },
    harness: { skills_path: 'skills/', conventions_path: 'conventions/' },
    adapters: [],
  };
}

function note(relPath: string, scope: string, body: string): Note {
  return { path: relPath, frontmatter: { scope }, body };
}

describe('scanNoteForLeaks / scanForLeaks (disclosure-policy D3)', () => {
  it('a marker for ctx-b matches inside a note visible only to ctx-a: a leak', () => {
    const config = makeConfig({ leak_markers: { 'ctx-b': ['SECRET-B-\\d+'] } });
    const n = note('projects/a.md', 'ctx-a', 'This note mentions SECRET-B-123 by accident.');
    const findings = scanNoteForLeaks(config, n);
    expect(findings).toEqual([{ path: 'projects/a.md', context: 'ctx-b', pattern: 'SECRET-B-\\d+', matchedText: 'SECRET-B-123' }]);
  });

  it('the same marker inside a note ctx-b CAN see is not a leak', () => {
    const config = makeConfig({ leak_markers: { 'ctx-b': ['SECRET-B-\\d+'] } }, { 'ctx-b': ['ctx-b', 'ctx-shared'] });
    const n = note('projects/shared.md', 'ctx-shared', 'Mentions SECRET-B-123, but ctx-b can see this note.');
    expect(scanNoteForLeaks(config, n)).toEqual([]);
  });

  it('no markers configured: the scan is a no-op for any note', () => {
    const config = makeConfig({ leak_markers: {} });
    const n = note('projects/a.md', 'ctx-a', 'SECRET-B-123 appears here too.');
    expect(scanNoteForLeaks(config, n)).toEqual([]);
  });

  it('a marker for the note\'s OWN context is never a leak (a context always sees its own value by default)', () => {
    const config = makeConfig({ leak_markers: { 'ctx-a': ['OWN-\\d+'] } });
    const n = note('projects/a.md', 'ctx-a', 'OWN-1 belongs here.');
    expect(scanNoteForLeaks(config, n)).toEqual([]);
  });

  it('scanForLeaks aggregates across every note in the store', () => {
    const config = makeConfig({ leak_markers: { 'ctx-b': ['SECRET-B'] } });
    const notes = [note('a.md', 'ctx-a', 'SECRET-B here'), note('b.md', 'ctx-a', 'nothing'), note('c.md', 'ctx-a', 'SECRET-B here too')];
    const findings = scanForLeaks(config, notes);
    expect(findings.map((f) => f.path)).toEqual(['a.md', 'c.md']);
  });

  it('multiple marker contexts and multiple patterns are each evaluated independently', () => {
    const config = makeConfig({ leak_markers: { 'ctx-b': ['B-\\d+'], 'ctx-c': ['C-\\d+'] } });
    const n = note('projects/a.md', 'ctx-a', 'B-1 and C-2 both appear.');
    const findings = scanNoteForLeaks(config, n);
    expect(findings.map((f) => f.context).sort()).toEqual(['ctx-b', 'ctx-c']);
  });
});
