import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { StoreConfig } from '../../src/config/schema.js';
import { buildRouteTable, publishPages } from '../../src/core/browse/routes.js';
import type { Store } from '../../src/core/store.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

function makeConfig(overrides: Partial<StoreConfig> = {}): StoreConfig {
  return {
    schema_version: 1,
    taxonomy: {
      profile: 'para',
      layers: [{ name: 'Projects', path: 'projects', description: '' }],
    },
    derived: { paths: ['.contexture/cache/'] },
    retrieval: { exclude_paths: [], demote_paths: [], gather_max_notes: 50, relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } },
    git: { default_branch: 'main' },
    session: { branch_prefix: 'session/', worktrees_path: '.worktrees/' },
    write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] },
    catalog: { path: '.contexture/catalog/', section_max_bytes: 32768 },
    publish: { path: '.contexture/publish/' },
    skills: { vendored: [] },
    ingest: { inbox_path: 'raw/inbox/', capture_root: 'raw/', tracking_params: [] },
    organize: { archive_destination: 'archive/', rollup_stale_days: 7 },
    harness: { skills_path: '.agents/skills/', guidance_path: '.contexture/guidance/', convention_max_bytes: 32768 },
    adapters: [],
    ...overrides,
  };
}

async function write(root: string, relPath: string, content = ''): Promise<void> {
  const full = path.join(root, relPath);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content);
}

describe('buildRouteTable', () => {
  it('includes every enumerated note, keyed by its store-relative path', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await write(tmp.root, 'projects/a.md', '# A\n');
      const table = await buildRouteTable(store);
      expect(table.notes.has('projects/a.md')).toBe(true);
      expect(table.notes.get('projects/a.md')!.body).toContain('# A');
    } finally {
      await tmp.cleanup();
    }
  });

  it('includes every configured catalog section', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await write(tmp.root, '.contexture/catalog/projects.md', '# Projects\n');
      const table = await buildRouteTable(store);
      expect([...table.catalog.keys()].sort()).toEqual(['projects', 'uncategorized']);
      expect(table.catalog.get('projects')!.absolutePath).toBe(path.join(tmp.root, '.contexture/catalog/projects.md'));
    } finally {
      await tmp.cleanup();
    }
  });

  it('includes every file under a published page folder, and reports the folder as a page', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await write(tmp.root, '.contexture/publish/my-page/index.html', '<html></html>');
      await write(tmp.root, '.contexture/publish/my-page/README.md', '# my-page\n');
      const table = await buildRouteTable(store);
      expect(table.publishFiles.has('my-page/index.html')).toBe(true);
      expect(table.publishFiles.has('my-page/README.md')).toBe(true);
      expect(publishPages(table)).toEqual(['my-page']);
    } finally {
      await tmp.cleanup();
    }
  });

  it('reports the graph document path even when the graph has not been built yet', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      const table = await buildRouteTable(store);
      expect(table.graphDocumentPath).toBe(path.join(tmp.root, '.contexture', 'cache', 'graph.md'));
    } finally {
      await tmp.cleanup();
    }
  });

  it('never surfaces a tool-owned or excluded path under the notes route', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await write(tmp.root, 'contexture.yaml', 'schema_version: 1\n');
      await write(tmp.root, '.contexture/catalog/projects.md', '# Projects\n');
      await write(tmp.root, '.contexture/publish/my-page/index.html', '<html></html>');
      await write(tmp.root, '.git/config', '[core]\n');
      await write(tmp.root, 'projects/a.md', '# A\n');
      const table = await buildRouteTable(store);
      expect([...table.notes.keys()]).toEqual(['projects/a.md']);
    } finally {
      await tmp.cleanup();
    }
  });
});

describe('publishPages', () => {
  it('returns an empty list when nothing has been published', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      const table = await buildRouteTable(store);
      expect(publishPages(table)).toEqual([]);
    } finally {
      await tmp.cleanup();
    }
  });

  it('reports a page nested under directories at its full path', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await write(tmp.root, '.contexture/publish/folder-a/folder-b/nested-page/index.html', '<html></html>');
      await write(tmp.root, '.contexture/publish/folder-a/folder-b/nested-page/README.md', '# nested-page\n');
      const table = await buildRouteTable(store);
      expect(publishPages(table)).toEqual(['folder-a/folder-b/nested-page']);
      expect(table.publishFiles.has('folder-a/folder-b/nested-page/index.html')).toBe(true);
    } finally {
      await tmp.cleanup();
    }
  });

  it('reports a top-level page and a nested one side by side', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await write(tmp.root, '.contexture/publish/top-page/index.html', '<html></html>');
      await write(tmp.root, '.contexture/publish/folder-a/nested-page/index.html', '<html></html>');
      const table = await buildRouteTable(store);
      expect(publishPages(table)).toEqual(['folder-a/nested-page', 'top-page']);
    } finally {
      await tmp.cleanup();
    }
  });

  it('does not report a directory that holds files but no index page', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await write(tmp.root, '.contexture/publish/folder-a/README.md', '# not a page\n');
      await write(tmp.root, '.contexture/publish/folder-a/real-page/index.html', '<html></html>');
      const table = await buildRouteTable(store);
      expect(publishPages(table)).toEqual(['folder-a/real-page']);
    } finally {
      await tmp.cleanup();
    }
  });

  it('does not report a stray index page sitting directly in the publish path as a page', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await write(tmp.root, '.contexture/publish/index.html', '<html></html>');
      const table = await buildRouteTable(store);
      expect(publishPages(table)).toEqual([]);
    } finally {
      await tmp.cleanup();
    }
  });
});


describe('buildRouteTable publishTitles', () => {
  it('reads a published page\'s declared <title>', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await write(tmp.root, '.contexture/publish/my-page/index.html', '<html><head><title>My Declared Page</title></head></html>');
      const table = await buildRouteTable(store);
      expect(table.publishTitles.get('my-page')).toBe('My Declared Page');
    } finally {
      await tmp.cleanup();
    }
  });

  it('falls back to no entry when the page declares no <title>', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await write(tmp.root, '.contexture/publish/my-page/index.html', '<html><head></head></html>');
      const table = await buildRouteTable(store);
      expect(table.publishTitles.has('my-page')).toBe(false);
    } finally {
      await tmp.cleanup();
    }
  });

  it('falls back to no entry when the <title> is empty', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await write(tmp.root, '.contexture/publish/my-page/index.html', '<html><head><title>   </title></head></html>');
      const table = await buildRouteTable(store);
      expect(table.publishTitles.has('my-page')).toBe(false);
    } finally {
      await tmp.cleanup();
    }
  });

  it('decodes HTML entities in a declared title', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await write(tmp.root, '.contexture/publish/my-page/index.html', '<html><head><title>A &amp; B &lt;also&gt; &#39;quoted&#39;</title></head></html>');
      const table = await buildRouteTable(store);
      expect(table.publishTitles.get('my-page')).toBe("A & B <also> 'quoted'");
    } finally {
      await tmp.cleanup();
    }
  });

  it('collapses internal whitespace in a multi-line title', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await write(tmp.root, '.contexture/publish/my-page/index.html', '<html><head><title>\n  Line One\n  Line Two \n</title></head></html>');
      const table = await buildRouteTable(store);
      expect(table.publishTitles.get('my-page')).toBe('Line One Line Two');
    } finally {
      await tmp.cleanup();
    }
  });

  it('matches a <title> tag carrying attributes, case-insensitively', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await write(tmp.root, '.contexture/publish/my-page/index.html', '<html><head><TITLE class="x">Shouty Title</TITLE></head></html>');
      const table = await buildRouteTable(store);
      expect(table.publishTitles.get('my-page')).toBe('Shouty Title');
    } finally {
      await tmp.cleanup();
    }
  });

  it('falls back to no entry when the title is truncated by the read bound', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      const padding = 'x'.repeat(5000);
      await write(tmp.root, '.contexture/publish/my-page/index.html', `<html><head><!--${padding}--><title>Never Reached</title></head></html>`);
      const table = await buildRouteTable(store);
      expect(table.publishTitles.has('my-page')).toBe(false);
    } finally {
      await tmp.cleanup();
    }
  });

  it('caps an over-long title', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      const longTitle = 'y'.repeat(200);
      await write(tmp.root, '.contexture/publish/my-page/index.html', `<html><head><title>${longTitle}</title></head></html>`);
      const table = await buildRouteTable(store);
      expect(table.publishTitles.get('my-page')?.length).toBe(120);
    } finally {
      await tmp.cleanup();
    }
  });

  it('handles a multibyte character sitting at the read boundary without throwing', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      // Pad the file past the 4096-byte read bound with multibyte filler, so the boundary
      // itself is likely to split a multibyte sequence, then close the title after it.
      const padding = '\u00e9\u00e8\u00ea'.repeat(2000);
      await write(tmp.root, '.contexture/publish/my-page/index.html', `<html><head><title>${padding}</title></head></html>`);
      const table = await buildRouteTable(store);
      // No assertion on the exact value — only that reading it does not throw and produces a string.
      const title = table.publishTitles.get('my-page');
      expect(title === undefined || typeof title === 'string').toBe(true);
    } finally {
      await tmp.cleanup();
    }
  });
});
