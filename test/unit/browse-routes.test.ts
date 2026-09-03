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
