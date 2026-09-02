import { describe, expect, it } from 'vitest';
import type { StoreConfig } from '../../src/config/schema.js';
import {
  catalogSectionsFor,
  parseCatalogGlosses,
  renderCatalogEntry,
  sectionFileName,
  sectionForNote,
} from '../../src/core/catalog/model.js';
import type { Note } from '../../src/core/notes/list.js';
import { contentHashOfBody } from '../../src/core/content/canonicalize.js';

function makeConfig(layers: { name: string; path: string; description: string }[]): StoreConfig {
  return {
    schema_version: 1,
    taxonomy: { profile: 'para', layers },
    fields: { visibility: 'scope' },
    visibility: { default_context: 'private', directory_defaults: {}, contexts: {} },
    derived: { paths: [] },
    retrieval: { exclude_paths: [], relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } },
    git: { default_branch: 'main' },
    session: { branch_prefix: 'session/', worktrees_path: '.worktrees/', workspaces_external: false },
    write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] },
    catalog: { path: 'catalog/', section_max_bytes: 32768 },
    publish: { path: 'publish/' },
    skills: { vendored: [] },
    disclosure: { internal_audiences: [], hard_walls: [], leak_markers: {} },
    ingest: { inbox_path: 'inbox/', tracking_params: [] },
    organize: { archive_path: 'archive/', rollup_stale_days: 7 },
    harness: { skills_path: 'skills/', guidance_path: 'guidance/' },
    adapters: [],
  };
}

const PARA_LAYERS = [
  { name: 'Projects', path: 'projects', description: '' },
  { name: 'Areas', path: 'areas', description: '' },
];

describe('catalogSectionsFor', () => {
  it('produces one section per layer, plus an uncategorized catch-all, when layers exist', () => {
    const sections = catalogSectionsFor(makeConfig(PARA_LAYERS));
    expect(sections.map((s) => s.id)).toEqual(['projects', 'areas', 'uncategorized']);
  });

  it('produces a single "notes" section when there are no layers (Zettelkasten)', () => {
    const sections = catalogSectionsFor(makeConfig([]));
    expect(sections).toEqual([{ id: 'notes', layerPath: null }]);
  });
});

describe('sectionForNote', () => {
  it('assigns a note to the layer matching its path prefix', () => {
    const sections = catalogSectionsFor(makeConfig(PARA_LAYERS));
    expect(sectionForNote(sections, 'projects/x.md').id).toBe('projects');
    expect(sectionForNote(sections, 'areas/People/y.md').id).toBe('areas');
  });

  it('falls back to the catch-all for a note under no configured layer', () => {
    const sections = catalogSectionsFor(makeConfig(PARA_LAYERS));
    expect(sectionForNote(sections, 'random.md').id).toBe('uncategorized');
  });
});

describe('sectionFileName', () => {
  it('appends .md to the section id', () => {
    expect(sectionFileName({ id: 'projects', layerPath: 'projects' })).toBe('projects.md');
  });
});

describe('parseCatalogGlosses', () => {
  it('extracts path, gloss, and hash from a well-formed entry line', () => {
    const body = '- [[Title]] (`projects/a.md`) — a gloss <!-- hash:0123456789abcdef -->';
    const parsed = parseCatalogGlosses(body);
    expect(parsed.get('projects/a.md')).toEqual({ gloss: 'a gloss', hash: '0123456789abcdef' });
  });

  it('extracts an empty gloss and no hash from a placeholder entry', () => {
    const body = '- [[Title]] (`projects/a.md`) — ';
    const parsed = parseCatalogGlosses(body);
    expect(parsed.get('projects/a.md')).toEqual({ gloss: '', hash: undefined });
  });

  it('ignores non-entry lines', () => {
    expect(parseCatalogGlosses('# Heading\nSome prose.\n').size).toBe(0);
  });
});

describe('renderCatalogEntry', () => {
  function note(overrides: Partial<Note> = {}): Note {
    return { path: 'projects/a.md', frontmatter: undefined, body: '# A\n', ...overrides };
  }

  it('uses the frontmatter title when present', () => {
    const line = renderCatalogEntry(note({ frontmatter: { title: 'My Title' } }), new Map());
    expect(line).toContain('[[My Title]]');
  });

  it('falls back to the filename stem when there is no title', () => {
    const line = renderCatalogEntry(note({ path: 'projects/my-note.md' }), new Map());
    expect(line).toContain('[[my-note]]');
  });

  it('never fabricates a gloss for a new entry', () => {
    const line = renderCatalogEntry(note(), new Map());
    expect(line).toBe('- [[a]] (`projects/a.md`) — ');
  });

  it('preserves an existing non-empty gloss and its frozen hash', () => {
    const existing = new Map([['projects/a.md', { gloss: 'existing gloss', hash: 'deadbeefdeadbeef' }]]);
    const line = renderCatalogEntry(note(), existing);
    expect(line).toBe('- [[a]] (`projects/a.md`) — existing gloss <!-- hash:deadbeefdeadbeef -->');
  });

  it('stamps the current hash the first time a gloss becomes non-empty', () => {
    const n = note({ body: '# A\n' });
    const existing = new Map([['projects/a.md', { gloss: 'brand new gloss', hash: undefined }]]);
    const line = renderCatalogEntry(n, existing);
    expect(line).toBe(`- [[a]] (\`projects/a.md\`) — brand new gloss <!-- hash:${contentHashOfBody(n.body)} -->`);
  });
});
