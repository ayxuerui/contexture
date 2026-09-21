import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SHIPPED_DEFAULTS } from '../../src/config/defaults.js';
import type { StoreConfig } from '../../src/config/schema.js';
import { pageServedAt, PREVIEW_ROUTE_PREFIX, previewRoute, publishRoute } from '../../src/core/browse/page-url.js';
import { buildRouteTable } from '../../src/core/browse/routes.js';
import type { Store } from '../../src/core/store.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

function makeConfig(overrides: Partial<StoreConfig> = {}): StoreConfig {
  return {
    schema_version: 1,
    taxonomy: { profile: 'para', layers: [{ name: 'Alpha', path: 'alpha', description: '' }] },
    derived: { paths: ['.contexture/cache/'] },
    retrieval: { exclude_paths: [], demote_paths: [], gather_max_notes: 50, graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } },
    git: { default_branch: 'main' },
    session: { branch_prefix: 'session/', worktrees_path: '.worktrees/' },
    write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] },
    catalog: { path: '.contexture/catalog/', section_max_bytes: 32768 },
    publish: { path: 'publish/' },
    templates: { path: '.contexture/templates/', installed: [] },
    skills: { vendored: [] },
    update_check: SHIPPED_DEFAULTS.update_check,
    ingest: { inbox_path: 'raw/inbox/', capture_root: 'raw/', tracking_params: [] },
    organize: { archive_destination: 'archive/', rollup_stale_days: 7 },
    harness: { skills_path: '.agents/skills/', guidance_path: '.contexture/guidance/', convention_max_bytes: 32768 },
    adapters: [],
    ...overrides,
  };
}

/** A store root that is NOT a session worktree — its parent is not the worktrees directory. */
function checkoutStore(overrides: Partial<StoreConfig> = {}): Store {
  return { root: '/tmp/ctx-a-store', config: makeConfig(overrides) };
}

/** A store root that IS a session worktree, by the path shape `isSessionWorktreePath` reads. */
function worktreeStore(overrides: Partial<StoreConfig> = {}): Store {
  return { root: '/tmp/ctx-a-store/.worktrees/session-20260920-180253-d97aa6', config: makeConfig(overrides) };
}

describe('publishRoute / previewRoute', () => {
  it('keeps the separators of a page path and encodes the rest', () => {
    expect(publishRoute('folder-a/example page/index.html')).toBe('/publish/folder-a/example%20page/index.html');
    expect(previewRoute('session-a', 'folder-a/example page/index.html')).toBe('/preview/session-a/folder-a/example%20page/index.html');
  });
});

describe('pageServedAt', () => {
  it('reports the published-pages address from the store\'s own checkout', () => {
    const served = pageServedAt(checkoutStore(), 'publish/folder-a/example-page/index.html');
    expect(served).toEqual({
      area: 'publish',
      route: '/publish/folder-a/example-page/index.html',
      url: null,
      worktree: null,
      after_landing: null,
    });
  });

  it('reports the previewable address, and the address after landing, from a session worktree', () => {
    const served = pageServedAt(worktreeStore(), 'publish/folder-a/example-page/index.html');
    expect(served).toEqual({
      area: 'preview',
      route: '/preview/session-20260920-180253-d97aa6/folder-a/example-page/index.html',
      url: null,
      worktree: 'session-20260920-180253-d97aa6',
      after_landing: { route: '/publish/folder-a/example-page/index.html', url: null },
    });
  });

  it('reports no address for a file outside the configured publish path', () => {
    expect(pageServedAt(checkoutStore(), 'alpha/a-note.md')).toBeNull();
    expect(pageServedAt(worktreeStore(), 'alpha/a-note.md')).toBeNull();
    // A sibling directory whose name merely starts with the publish path's is not under it.
    expect(pageServedAt(checkoutStore(), 'publishing/folder-a/index.html')).toBeNull();
  });

  it('addresses a non-index file inside a page folder', () => {
    const served = pageServedAt(checkoutStore(), 'publish/folder-a/example-page/style.css');
    expect(served?.route).toBe('/publish/folder-a/example-page/style.css');
  });

  it('reads a publish path written with or without a trailing slash identically', () => {
    const withSlash = pageServedAt(checkoutStore({ publish: { path: 'publish/' } }), 'publish/folder-a/example-page/index.html');
    const without = pageServedAt(checkoutStore({ publish: { path: 'publish' } }), 'publish/folder-a/example-page/index.html');
    expect(without).toEqual(withSlash);
  });

  it('encodes a page path that needs it', () => {
    const served = pageServedAt(worktreeStore(), 'publish/folder-a/例 page/index.html');
    expect(served?.route).toBe('/preview/session-20260920-180253-d97aa6/folder-a/%E4%BE%8B%20page/index.html');
  });

  it('reports a server-relative route alone when no base URL is declared', () => {
    const served = pageServedAt(worktreeStore(), 'publish/folder-a/example-page/index.html');
    expect(served?.url).toBeNull();
    expect(served?.after_landing?.url).toBeNull();
  });

  it('reports an absolute URL against a declared base URL', () => {
    const served = pageServedAt(checkoutStore({ serve: { base_url: 'https://ctx-a.example.test' } }), 'publish/folder-a/example-page/index.html');
    expect(served?.url).toBe('https://ctx-a.example.test/publish/folder-a/example-page/index.html');
  });

  it('preserves a path prefix the base URL itself carries', () => {
    const served = pageServedAt(
      worktreeStore({ serve: { base_url: 'https://example.test/ctx-a/' } }),
      'publish/folder-a/example-page/index.html',
    );
    expect(served?.url).toBe('https://example.test/ctx-a/preview/session-20260920-180253-d97aa6/folder-a/example-page/index.html');
    expect(served?.after_landing?.url).toBe('https://example.test/ctx-a/publish/folder-a/example-page/index.html');
  });

  it('strips a trailing slash from the base URL rather than doubling it', () => {
    const served = pageServedAt(checkoutStore({ serve: { base_url: 'https://ctx-a.example.test///' } }), 'publish/folder-a/example-page/index.html');
    expect(served?.url).toBe('https://ctx-a.example.test/publish/folder-a/example-page/index.html');
  });

  /**
   * The derivation and the server have to keep agreeing. This resolves a
   * derived preview route the way `serve.ts` resolves a request path — one
   * `decodeURIComponent`, then the worktree segment, then the rest — against a
   * route table built from a real store on disk.
   */
  it('derives a preview route that resolves in the real route table', async () => {
    const tmp = await makeTmpDir();
    try {
      const config = makeConfig();
      const store: Store = { root: tmp.root, config };
      const worktreeDir = 'session-20260920-180253-d97aa6';
      const pagePath = 'folder-a/example page';
      const worktreeRoot = path.join(tmp.root, config.session.worktrees_path, worktreeDir);
      const pageDir = path.join(worktreeRoot, config.publish.path, pagePath);
      await mkdir(pageDir, { recursive: true });
      await writeFile(path.join(pageDir, 'index.html'), '<title>Example</title>');

      const served = pageServedAt({ root: worktreeRoot, config }, `${config.publish.path}${pagePath}/index.html`);
      expect(served?.area).toBe('preview');

      const pathname = decodeURIComponent(served!.route);
      const rest = pathname.slice(PREVIEW_ROUTE_PREFIX.length);
      const separator = rest.indexOf('/');
      const table = await buildRouteTable(store);
      const preview = table.previews.get(rest.slice(0, separator));
      expect(preview?.files.get(rest.slice(separator + 1))?.absolutePath).toBe(path.join(pageDir, 'index.html'));
    } finally {
      await tmp.cleanup();
    }
  });
});
