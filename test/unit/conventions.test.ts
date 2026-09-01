import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { StoreConfig } from '../../src/config/schema.js';
import { renderConventionsSection } from '../../src/core/agents-doc.js';
import { extractDocMetadata, scanConventions } from '../../src/core/conventions.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

function makeConfig(): StoreConfig {
  return {
    schema_version: 2,
    taxonomy: { profile: 'para', layers: [] },
    fields: { visibility: 'lens' },
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
    harness: { skills_path: 'skills/', conventions_path: 'conventions/' },
    adapters: [],
  };
}

describe('extractDocMetadata', () => {
  it('prefers frontmatter title and description', () => {
    const doc = extractDocMetadata('---\ntitle: House Style\ndescription: How prose is written here.\n---\n# Ignored heading\n', 'conventions/style.md');
    expect(doc).toEqual({ path: 'conventions/style.md', title: 'House Style', description: 'How prose is written here.' });
  });

  it('falls back to the first heading, then the filename stem', () => {
    expect(extractDocMetadata('# From Heading\n\nBody.\n', 'conventions/a.md').title).toBe('From Heading');
    expect(extractDocMetadata('No heading at all.\n', 'conventions/some-file.md').title).toBe('some-file');
  });

  it('survives malformed frontmatter by falling back (docs are instructions, not notes)', () => {
    const doc = extractDocMetadata('---\ntitle: "unterminated\n---\n# Rescue Heading\n', 'conventions/broken.md');
    expect(doc.title).toBe('Rescue Heading');
    expect(doc.description).toBeNull();
  });
});

describe('scanConventions', () => {
  it('returns an empty list when the directory does not exist', async () => {
    const tmp = await makeTmpDir();
    try {
      expect(await scanConventions(tmp.root, makeConfig())).toEqual([]);
    } finally {
      await tmp.cleanup();
    }
  });

  it('lists .md files sorted by filename, with metadata', async () => {
    const tmp = await makeTmpDir();
    try {
      await mkdir(path.join(tmp.root, 'conventions'), { recursive: true });
      await writeFile(path.join(tmp.root, 'conventions/b-style.md'), '---\ntitle: Style\ndescription: Prose rules.\n---\n');
      await writeFile(path.join(tmp.root, 'conventions/a-rules.md'), '# Rules\n');
      await writeFile(path.join(tmp.root, 'conventions/notes.txt'), 'not markdown');

      const docs = await scanConventions(tmp.root, makeConfig());
      expect(docs).toEqual([
        { path: 'conventions/a-rules.md', title: 'Rules', description: null },
        { path: 'conventions/b-style.md', title: 'Style', description: 'Prose rules.' },
      ]);
    } finally {
      await tmp.cleanup();
    }
  });
});

describe('renderConventionsSection', () => {
  it('indexes each convention by title, path, and description', () => {
    const lines = renderConventionsSection(makeConfig(), [
      { path: 'conventions/style.md', title: 'Style', description: 'Prose rules.' },
      { path: 'conventions/rules.md', title: 'Rules', description: null },
    ]).join('\n');
    expect(lines).toContain('- [Style](conventions/style.md) — Prose rules.');
    expect(lines).toContain('- [Rules](conventions/rules.md)');
  });

  it('explains the mechanism and names the configured path when empty', () => {
    const lines = renderConventionsSection(makeConfig(), []).join('\n');
    expect(lines).toContain('`conventions/`');
    expect(lines).toMatch(/no convention documents yet/i);
  });

  it('directs a harness-specific note to that harness\'s own entry file, not this directory', () => {
    const empty = renderConventionsSection(makeConfig(), []).join('\n');
    expect(empty).toMatch(/only one agent harness/i);

    const populated = renderConventionsSection(makeConfig(), [
      { path: 'conventions/style.md', title: 'Style', description: 'Prose rules.' },
    ]).join('\n');
    expect(populated).toMatch(/only one agent harness/i);
  });
});

/**
 * extract-agents-doc-templates: the two conventions branches ship as two
 * complete template files (`store-conventions.md`, `store-conventions-empty.md`)
 * rather than one file with a swapped middle, so each reads as a full
 * rendering of what an agent actually sees. That duplicates the trailing
 * harness-specific-note paragraph across both files — these tests are what
 * keep the copies from drifting into two different instructions.
 */
describe('conventions section templates', () => {
  it('renders the empty branch exactly', () => {
    expect(renderConventionsSection(makeConfig(), [])).toEqual([
      "## Store conventions",
      "",
      "This store declares no convention documents yet. Operator-authored conventions (content style, field",
      "semantics, house rules) belong as markdown files under `conventions/` — each is",
      "indexed here on regeneration, referenced by path, never inlined.",
      "",
      "A note that applies to only one agent harness (not every harness reading this store) belongs below that harness's own managed import in its own entry file, never here — every file in this directory is indexed into every harness's entry document equally.",
    ]);
  });

  it('renders the populated branch exactly', () => {
    expect(
      renderConventionsSection(makeConfig(), [
        { path: 'conventions/style.md', title: 'Style', description: 'Prose rules.' },
        { path: 'conventions/rules.md', title: 'Rules', description: null },
      ]),
    ).toEqual([
      "## Store conventions",
      "",
      "Operator-authored conventions for this store — read the ones relevant to your task:",
      "",
      "- [Style](conventions/style.md) — Prose rules.",
      "- [Rules](conventions/rules.md)",
      "",
      "A note that applies to only one agent harness (not every harness reading this store) belongs below that harness's own managed import in its own entry file, never here — every file in this directory is indexed into every harness's entry document equally.",
    ]);
  });

  it('ends both branches with a byte-identical harness-specific-note paragraph', () => {
    const empty = renderConventionsSection(makeConfig(), []);
    const populated = renderConventionsSection(makeConfig(), [
      { path: 'conventions/style.md', title: 'Style', description: 'Prose rules.' },
    ]);
    expect(empty.at(-1)).toBe(populated.at(-1));
    expect(empty.at(-1)).toMatch(/only one agent harness/);
  });
});
