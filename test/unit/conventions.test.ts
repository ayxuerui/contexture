import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { StoreConfig } from '../../src/config/schema.js';
import {
  BASELINE_SOURCE_LABEL,
  renderBaselineBlock,
  renderConventionBlock,
  renderConventionsSection,
} from '../../src/core/agents-doc.js';
import { extractDocMetadata, inlineDocBody, scanConventions } from '../../src/core/conventions.js';
import { removeManagedBaselineFile, seedHouseConventionsFile } from '../../src/core/convention-doc.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

import { SHIPPED_DEFAULTS } from '../../src/config/defaults.js';
function makeConfig(): StoreConfig {
  return {
    schema_version: 2,
    taxonomy: { profile: 'para', layers: [] },
    derived: { paths: [] },
    retrieval: { exclude_paths: [], demote_paths: [], gather_max_notes: 50, relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } },
    git: { default_branch: 'main' },
    session: { branch_prefix: 'session/', worktrees_path: '.worktrees/' },
    write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] },
    catalog: { path: 'catalog/', section_max_bytes: 32768 },
    publish: { path: 'publish/' },
    skills: { vendored: [] },
    update_check: SHIPPED_DEFAULTS.update_check,
    ingest: { inbox_path: 'raw/inbox/', capture_root: 'raw/', tracking_params: [] },
    organize: { archive_destination: 'archive/', rollup_stale_days: 7 },
    harness: { skills_path: 'skills/', guidance_path: 'guidance/', convention_max_bytes: 32768 },
    adapters: [],
  };
}

describe('extractDocMetadata', () => {
  it('prefers frontmatter title and description, and keeps the frontmatter-stripped body', () => {
    const doc = extractDocMetadata('---\ntitle: House Style\ndescription: How prose is written here.\n---\n# Ignored heading\n', 'conventions/style.md');
    expect(doc).toEqual({
      path: 'conventions/style.md',
      title: 'House Style',
      description: 'How prose is written here.',
      body: '# Ignored heading\n',
    });
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

describe('inlineDocBody', () => {
  it('drops a leading H1 that duplicates the title, and demotes remaining headings', () => {
    const doc = extractDocMetadata('# Vault conventions\n\n## Folder Structure\n\nSome text.\n\n### Sub point\n', 'conventions/vault.md');
    expect(inlineDocBody(doc, 2)).toEqual(['#### Folder Structure', '', 'Some text.', '', '##### Sub point']);
  });

  it('keeps a leading H1 that does not match the title', () => {
    const doc = extractDocMetadata('# Something Else\n\nBody.\n', 'conventions/a.md');
    const doc2 = { ...doc, title: 'A' };
    expect(inlineDocBody(doc2, 1)).toEqual(['## Something Else', '', 'Body.']);
  });

  it('strips nested contexture fence markers but keeps their body', () => {
    const raw =
      '# Mission\n\nPreamble.\n\n<!-- >>> contexture:rollup (managed — do not edit) >>> -->\n## Primary mission\n\nDo the thing.\n<!-- <<< contexture:rollup <<< -->\n';
    const doc = extractDocMetadata(raw, 'MISSION.md');
    expect(inlineDocBody(doc, 1)).toEqual(['Preamble.', '', '### Primary mission', '', 'Do the thing.']);
  });

  it('is byte-stable across repeated calls on the same input', () => {
    const doc = extractDocMetadata('# Title\n\n## Section\n\nText.\n', 'conventions/a.md');
    const first = inlineDocBody(doc, 2);
    const second = inlineDocBody(doc, 2);
    expect(second).toEqual(first);
  });

  it('caps heading demotion at H6', () => {
    const doc = extractDocMetadata('# T\n\n##### Deep\n', 'conventions/a.md');
    const doc2 = { ...doc, title: 'Other' }; // mismatched title — the H1 is demoted like any other heading, not dropped
    expect(inlineDocBody(doc2, 3)).toEqual(['#### T', '', '###### Deep']);
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

  it('lists .md files sorted by filename, with metadata and body', async () => {
    const tmp = await makeTmpDir();
    try {
      await mkdir(path.join(tmp.root, 'guidance'), { recursive: true });
      await writeFile(path.join(tmp.root, 'guidance/b-style.md'), '---\ntitle: Style\ndescription: Prose rules.\n---\nBody text.\n');
      await writeFile(path.join(tmp.root, 'guidance/a-rules.md'), '# Rules\n');
      await writeFile(path.join(tmp.root, 'guidance/notes.txt'), 'not markdown');

      const docs = await scanConventions(tmp.root, makeConfig());
      expect(docs).toEqual([
        { path: 'guidance/a-rules.md', title: 'Rules', description: null, body: '# Rules\n' },
        { path: 'guidance/b-style.md', title: 'Style', description: 'Prose rules.', body: 'Body text.\n' },
      ]);
    } finally {
      await tmp.cleanup();
    }
  });

  it('excludes the configured mission document by basename (compose-store-guidance-documents)', async () => {
    const tmp = await makeTmpDir();
    try {
      await mkdir(path.join(tmp.root, 'guidance'), { recursive: true });
      await writeFile(path.join(tmp.root, 'guidance/mission.md'), '# Mission\n');
      await writeFile(path.join(tmp.root, 'guidance/house-conventions.md'), '---\ntitle: House\n---\n');

      const config: StoreConfig = { ...makeConfig(), organize: { archive_destination: 'archive/', rollup_stale_days: 7, mission_path: 'guidance/mission.md' } };
      const docs = await scanConventions(tmp.root, config);
      expect(docs.map((d) => d.path)).toEqual(['guidance/house-conventions.md']);
    } finally {
      await tmp.cleanup();
    }
  });

  it('includes a file named like the mission document when no mission_path is configured for this store', async () => {
    const tmp = await makeTmpDir();
    try {
      await mkdir(path.join(tmp.root, 'guidance'), { recursive: true });
      await writeFile(path.join(tmp.root, 'guidance/mission.md'), '# Mission\n');

      const docs = await scanConventions(tmp.root, makeConfig());
      expect(docs.map((d) => d.path)).toEqual(['guidance/mission.md']);
    } finally {
      await tmp.cleanup();
    }
  });
});

describe('renderConventionBlock', () => {
  it('renders a heading, the inlined body, and a source line', () => {
    const doc = extractDocMetadata('---\ntitle: Style\n---\nProse rules.\n', 'conventions/style.md');
    expect(renderConventionBlock(doc)).toEqual(['### Style', '', 'Prose rules.', '', '_Source: conventions/style.md_']);
  });
});

describe('renderConventionsSection', () => {
  it('inlines each convention body under a heading naming its title, with a source line', () => {
    const lines = renderConventionsSection(makeConfig(), [
      extractDocMetadata('---\ntitle: Style\n---\nProse rules.\n', 'conventions/style.md'),
      extractDocMetadata('---\ntitle: Rules\n---\nDo this.\n', 'conventions/rules.md'),
    ]).join('\n');
    expect(lines).toContain('### Style');
    expect(lines).toContain('Prose rules.');
    expect(lines).toContain('_Source: conventions/style.md_');
    expect(lines).toContain('### Rules');
    expect(lines).toContain('Do this.');
  });

  it('explains the mechanism and names the configured path when the store has added none of its own', () => {
    const lines = renderConventionsSection(makeConfig(), []).join('\n');
    expect(lines).toContain('`guidance/`');
    expect(lines).toMatch(/added none of its own yet/i);
    // The baseline is always present, so "empty" now means "no operator files".
    expect(lines).toContain('### Baseline conventions');
  });

  it('directs a harness-specific note to that harness\'s own entry file, not this directory', () => {
    const empty = renderConventionsSection(makeConfig(), []).join('\n');
    expect(empty).toMatch(/only one agent harness/i);

    const populated = renderConventionsSection(makeConfig(), [
      extractDocMetadata('---\ntitle: Style\n---\nProse rules.\n', 'conventions/style.md'),
    ]).join('\n');
    expect(populated).toMatch(/only one agent harness/i);
  });
});

/**
 * compose-store-guidance-documents: the empty/populated branches share one
 * template file (`conventions.md`) with one `__CONVENTION_BODY__` slot —
 * `conventionsBody` computes the middle content for either case, so the
 * surrounding frame (heading, harness-specific-note paragraph) exists in
 * exactly one place and can't drift into two different instructions the way
 * it could when it shipped as two separate template files.
 */
describe('conventions section templates', () => {
  // The baseline block is composed in rather than transcribed: it is long, and
  // its content is this store's config, which the dedicated tests above cover.
  it('renders the no-operator-files branch exactly', () => {
    expect(renderConventionsSection(makeConfig(), [])).toEqual([
      "## Store conventions",
      "",
      "contexture's shipped baseline, inlined in full. This store has added none of its own yet —",
      "operator-authored conventions (content style, field semantics, house rules) belong as markdown",
      "files under `guidance/`, each inlined here alongside the baseline.",
      "",
      ...renderBaselineBlock(makeConfig()),
      "",
      "A note that applies to only one agent harness (not every harness reading this store) belongs below that harness's own managed import in its own entry file, never here — every file in this directory is inlined into every harness's entry document equally.",
    ]);
  });

  it('renders the populated branch exactly, for a single convention', () => {
    expect(
      renderConventionsSection(makeConfig(), [
        extractDocMetadata('---\ntitle: Style\ndescription: Prose rules.\n---\nBody.\n', 'conventions/style.md'),
      ]),
    ).toEqual([
      "## Store conventions",
      "",
      "contexture's shipped baseline and this store's own conventions, inlined in full:",
      "",
      ...renderBaselineBlock(makeConfig()),
      "",
      "### Style",
      "",
      "Body.",
      "",
      "_Source: conventions/style.md_",
      "",
      "A note that applies to only one agent harness (not every harness reading this store) belongs below that harness's own managed import in its own entry file, never here — every file in this directory is inlined into every harness's entry document equally.",
    ]);
  });
});

describe('the baseline renders into AGENTS.md instead of a file', () => {
  const current = 'guidance/baseline-conventions.md';
  const legacy = 'guidance/baseline-convention.md';
  const managed = '<!-- Owned by contexture — written by `ctxr init`, refreshed by `ctxr update`. Do not edit. -->';

  it('inlines the baseline as the first block, sourced to the tool rather than a path', () => {
    const section = renderConventionsSection(makeConfig(), []).join('\n');
    expect(section).toContain('### Baseline conventions');
    expect(section).toContain(`_Source: ${BASELINE_SOURCE_LABEL}_`);
    // Never a path — there is no file to point at.
    expect(section).not.toContain('guidance/baseline-conventions.md');
    // Rendered from THIS store's config, not a shipped constant. Asserted
    // against a NON-default value, so a hardcoded template would fail here.
    const custom = { ...makeConfig(), organize: { ...makeConfig().organize, archive_destination: 'retired/' } };
    expect(renderConventionsSection(custom, []).join('\n')).toContain('`retired/`');
  });

  it('puts the baseline ahead of the operator files, and keeps them all', () => {
    const own = { path: 'guidance/house-conventions.md', title: 'House conventions', description: null, body: 'Ours.\n' };
    const section = renderConventionsSection(makeConfig(), [own]).join('\n');
    expect(section.indexOf('### Baseline conventions')).toBeLessThan(section.indexOf('### House conventions'));
    expect(section).toContain('Ours.');
  });

  it('removes the managed file under either name, so an upgraded store never inlines it twice', async () => {
    for (const name of [current, legacy]) {
      const tmp = await makeTmpDir();
      try {
        await mkdir(path.join(tmp.root, 'guidance'), { recursive: true });
        await writeFile(path.join(tmp.root, name), `---\ntitle: Baseline conventions\n---\n${managed}\nStale.\n`);

        expect((await removeManagedBaselineFile(tmp.root, makeConfig())).changed).toBe(true);
        await expect(readFile(path.join(tmp.root, name), 'utf8')).rejects.toThrow();

        // Nothing left for the wholesale directory scan to pick up.
        expect(await scanConventions(tmp.root, makeConfig())).toEqual([]);
      } finally {
        await tmp.cleanup();
      }
    }
  });

  it('never removes an operator file sitting at either baseline name', async () => {
    for (const name of [current, legacy]) {
      const tmp = await makeTmpDir();
      try {
        await mkdir(path.join(tmp.root, 'guidance'), { recursive: true });
        await writeFile(path.join(tmp.root, name), '---\ntitle: Mine\n---\nHand-written, no managed header.\n');

        expect((await removeManagedBaselineFile(tmp.root, makeConfig())).changed).toBe(false);
        expect(await readFile(path.join(tmp.root, name), 'utf8')).toContain('Hand-written');
      } finally {
        await tmp.cleanup();
      }
    }
  });

  it('is a no-op when there is nothing to remove', async () => {
    const tmp = await makeTmpDir();
    try {
      expect((await removeManagedBaselineFile(tmp.root, makeConfig())).changed).toBe(false);
    } finally {
      await tmp.cleanup();
    }
  });

  it('tracks the store config: changing a rendered value changes the inlined block', () => {
    const before = renderBaselineBlock(makeConfig()).join('\n');
    const config = makeConfig();
    config.organize = { ...config.organize, archive_destination: 'retired/' };
    const after = renderBaselineBlock(config).join('\n');
    expect(before).toContain('archive/');
    expect(after).toContain('retired/');
  });
});

describe('seedHouseConventionsFile', () => {
  it('seeds house-conventions.md once, then leaves the operator copy alone', async () => {
    const tmp = await makeTmpDir();
    try {
      expect((await seedHouseConventionsFile(tmp.root, makeConfig())).created).toBe(true);
      const seeded = path.join(tmp.root, 'guidance/house-conventions.md');
      expect(await readFile(seeded, 'utf8')).toContain('title: House conventions');

      await writeFile(seeded, '---\ntitle: House conventions\n---\nOurs now.\n');
      expect((await seedHouseConventionsFile(tmp.root, makeConfig())).created).toBe(false);
      expect(await readFile(seeded, 'utf8')).toContain('Ours now.');
    } finally {
      await tmp.cleanup();
    }
  });
});
