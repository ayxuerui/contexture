import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { StoreConfig } from '../../src/config/schema.js';
import {
  buildCatalog,
  checkCatalogCoverage,
  checkCatalogStale,
  readCatalogSection,
} from '../../src/core/catalog/build.js';
import type { Store } from '../../src/core/store.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

function makeConfig(overrides: Partial<StoreConfig> = {}): StoreConfig {
  return {
    schema_version: 1,
    taxonomy: {
      profile: 'para',
      layers: [
        { name: 'Projects', path: 'projects', description: '' },
        { name: 'Areas', path: 'areas', description: '' },
      ],
    },
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
    ...overrides,
  };
}

async function writeNote(root: string, relPath: string, content = '# Note\n'): Promise<void> {
  const full = path.join(root, relPath);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content);
}

describe('buildCatalog', () => {
  it('creates one section file per taxonomy layer, plus uncategorized', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await writeNote(tmp.root, 'projects/a.md');
      const result = await buildCatalog(store);
      expect(result.sections.map((s) => s.id).sort()).toEqual(['areas', 'projects', 'uncategorized']);
      expect(result.totalNotes).toBe(1);
      const projectsSection = result.sections.find((s) => s.id === 'projects')!;
      expect(projectsSection.noteCount).toBe(1);
    } finally {
      await tmp.cleanup();
    }
  });

  it('running build twice in a row produces byte-identical output', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await writeNote(tmp.root, 'projects/a.md', '---\ntitle: A\n---\n# A\n');
      await writeNote(tmp.root, 'areas/b.md');
      await buildCatalog(store);
      const contentBefore = await readFile(path.join(tmp.root, 'catalog', 'projects.md'), 'utf8');

      const second = await buildCatalog(store);
      const contentAfter = await readFile(path.join(tmp.root, 'catalog', 'projects.md'), 'utf8');

      expect(contentAfter).toBe(contentBefore);
      expect(second.sections.every((s) => !s.changed)).toBe(true);
    } finally {
      await tmp.cleanup();
    }
  });

  it('preserves a manually authored gloss across a rebuild', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await writeNote(tmp.root, 'projects/a.md');
      await buildCatalog(store);

      const filePath = path.join(tmp.root, 'catalog', 'projects.md');
      const withGloss = (await readFile(filePath, 'utf8')).replace(') — ', ') — a hand-written gloss');
      await writeFile(filePath, withGloss);

      await buildCatalog(store);
      const finalContent = await readFile(filePath, 'utf8');
      expect(finalContent).toContain('a hand-written gloss');
    } finally {
      await tmp.cleanup();
    }
  });
});

describe('checkCatalogCoverage', () => {
  it('reports a retrievable note with no catalog entry as missing', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await writeNote(tmp.root, 'projects/a.md');
      const { missing, dangling } = await checkCatalogCoverage(store);
      expect(missing).toEqual(['projects/a.md']);
      expect(dangling).toEqual([]);
    } finally {
      await tmp.cleanup();
    }
  });

  it('passes with no missing or dangling entries right after a build', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await writeNote(tmp.root, 'projects/a.md');
      await buildCatalog(store);
      expect(await checkCatalogCoverage(store)).toEqual({ missing: [], dangling: [] });
    } finally {
      await tmp.cleanup();
    }
  });

  it('reports a deleted note as a dangling catalog entry', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      const notePath = path.join(tmp.root, 'projects', 'a.md');
      await writeNote(tmp.root, 'projects/a.md');
      await buildCatalog(store);

      const { rm } = await import('node:fs/promises');
      await rm(notePath);

      const { missing, dangling } = await checkCatalogCoverage(store);
      expect(missing).toEqual([]);
      expect(dangling).toEqual(['projects/a.md']);
    } finally {
      await tmp.cleanup();
    }
  });

  it('is clean again after re-adding the deleted note and rebuilding', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await writeNote(tmp.root, 'projects/a.md');
      await buildCatalog(store);
      const { rm } = await import('node:fs/promises');
      await rm(path.join(tmp.root, 'projects', 'a.md'));
      await writeNote(tmp.root, 'projects/a.md'); // re-add
      await buildCatalog(store);
      expect(await checkCatalogCoverage(store)).toEqual({ missing: [], dangling: [] });
    } finally {
      await tmp.cleanup();
    }
  });
});

describe('checkCatalogStale', () => {
  it('flags an entry whose note content changed since the gloss was confirmed', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await writeNote(tmp.root, 'projects/a.md', '# Original\n');
      await buildCatalog(store);
      const filePath = path.join(tmp.root, 'catalog', 'projects.md');
      const withGloss = (await readFile(filePath, 'utf8')).replace(') — ', ') — gloss text');
      await writeFile(filePath, withGloss);
      await buildCatalog(store); // stamps the confirmed hash

      await writeNote(tmp.root, 'projects/a.md', '# Changed content\n');

      const stale = await checkCatalogStale(store);
      expect(stale).toEqual([{ path: 'projects/a.md', section: 'projects' }]);
    } finally {
      await tmp.cleanup();
    }
  });

  it('does not flag an entry with no confirmed gloss', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await writeNote(tmp.root, 'projects/a.md');
      await buildCatalog(store);
      expect(await checkCatalogStale(store)).toEqual([]);
    } finally {
      await tmp.cleanup();
    }
  });
});

describe('readCatalogSection', () => {
  it('returns null for an unknown section id', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      expect(await readCatalogSection(store, 'nonexistent')).toBeNull();
    } finally {
      await tmp.cleanup();
    }
  });

  it('returns an empty string (not null) for a valid, not-yet-built section', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      expect(await readCatalogSection(store, 'projects')).toBe('');
    } finally {
      await tmp.cleanup();
    }
  });

  it('returns the section content after a build', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await writeNote(tmp.root, 'projects/a.md');
      await buildCatalog(store);
      const content = await readCatalogSection(store, 'projects');
      expect(content).toContain('projects/a.md');
    } finally {
      await tmp.cleanup();
    }
  });
});
