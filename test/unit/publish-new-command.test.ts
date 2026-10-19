import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { execute as executeNew } from '../../src/commands/publish-new.js';
import type { StoreConfig } from '../../src/config/schema.js';
import { ExitCode } from '../../src/core/exit-codes.js';
import {
  PublishDisposableNameError,
  PublishDisposableSegmentReservedError,
  PublishInvalidSlugError,
  PublishReservedSlugError,
  PublishSlugExistsError,
} from '../../src/core/errors.js';
import type { Store } from '../../src/core/store.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

import { SHIPPED_DEFAULTS } from '../../src/config/defaults.js';
function makeConfig(overrides: Partial<StoreConfig> = {}): StoreConfig {
  return {
    schema_version: 1,
    taxonomy: { profile: 'para', layers: [] },
    derived: { paths: [] },
    retrieval: { exclude_paths: [], demote_paths: [], gather_max_notes: 50, graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } },
    git: { default_branch: 'main' },
    session: { branch_prefix: 'session/', worktrees_path: '.worktrees/' },
    write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] },
    catalog: { path: 'catalog/', section_max_bytes: 32768 },
    publish: { path: 'publish/' },
    templates: { path: '.contexture/templates/', installed: [] },
    skills: { vendored: [] },
    update_check: SHIPPED_DEFAULTS.update_check,
    ingest: { inbox_path: 'raw/inbox/', capture_root: 'raw/', tracking_params: [] },
    organize: { archive_destination: 'archive/', rollup_stale_days: 7 },
    harness: { skills_path: 'skills/', guidance_path: 'guidance/', convention_max_bytes: 32768 },
    adapters: [],
    ...overrides,
  };
}

describe('publish new', () => {
  it('scaffolds a folder with index.html and a README carrying the required headings', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      const outcome = await executeNew(store, { slug: 'some-slug' });
      expect(outcome.exitCode).toBe(ExitCode.Ok);
      expect(outcome.data).toEqual({
        slug: 'some-slug',
        path: 'publish/some-slug',
        served_at: {
          area: 'publish',
          route: '/publish/some-slug/index.html',
          url: null,
          worktree: null,
          after_landing: null,
        },
        lifespan: 'permanent',
      });

      const html = await readFile(path.join(tmp.root, 'publish/some-slug/index.html'), 'utf8');
      expect(html).toContain('<meta name="viewport"');
      expect(html).toContain('@media print');
      expect(html).toContain('href="./README.md"');
      // serve-page-names-theme-and-nav-toggle: a page can't receive the server's theme choice
      // (it's served byte-verbatim), so the scaffold follows the viewer's own system preference.
      expect(html).toContain('color-scheme: light dark');
      expect(html).toContain('@media (prefers-color-scheme: dark)');

      const readme = await readFile(path.join(tmp.root, 'publish/some-slug/README.md'), 'utf8');
      expect(readme).toContain('## Intent');
      expect(readme).toContain('## Source notes');
      expect(readme).toContain('## Audience & use');
      expect(readme).toContain('## Spec / prompt');
    } finally {
      await tmp.cleanup();
    }
  });

  it('refuses a slug starting with a reserved date pattern, creating nothing', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await expect(executeNew(store, { slug: '2026-01-01-bad' })).rejects.toBeInstanceOf(PublishReservedSlugError);
      await expect(readFile(path.join(tmp.root, 'publish/2026-01-01-bad/index.html'), 'utf8')).rejects.toThrow();
    } finally {
      await tmp.cleanup();
    }
  });

  it('scaffolds a multi-segment slug at that path, creating its intermediate directories', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      const outcome = await executeNew(store, { slug: 'folder-a/folder-b/nested-page' });
      expect(outcome.exitCode).toBe(ExitCode.Ok);
      expect(outcome.data).toEqual({
        slug: 'folder-a/folder-b/nested-page',
        path: 'publish/folder-a/folder-b/nested-page',
        served_at: {
          area: 'publish',
          route: '/publish/folder-a/folder-b/nested-page/index.html',
          url: null,
          worktree: null,
          after_landing: null,
        },
        lifespan: 'permanent',
      });

      const html = await readFile(path.join(tmp.root, 'publish/folder-a/folder-b/nested-page/index.html'), 'utf8');
      expect(html).toContain('<title>nested-page</title>');
      expect(html).toContain('<meta name="viewport"');
      expect(html).toContain('href="./README.md"');

      const readme = await readFile(path.join(tmp.root, 'publish/folder-a/folder-b/nested-page/README.md'), 'utf8');
      expect(readme).toContain('# nested-page');
      expect(readme).toContain('## Intent');
      expect(readme).toContain('## Source notes');
      expect(readme).toContain('## Audience & use');
      expect(readme).toContain('## Spec / prompt');
    } finally {
      await tmp.cleanup();
    }
  });

  it('refuses a reserved date pattern in the final segment at any depth, creating nothing', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await expect(executeNew(store, { slug: 'folder-a/2026-01-01-bad' })).rejects.toBeInstanceOf(PublishReservedSlugError);
      await expect(readdir(path.join(tmp.root, 'publish'))).rejects.toThrow();
    } finally {
      await tmp.cleanup();
    }
  });

  it('allows a date-prefixed directory, because the reserved naming binds the page\'s own segment', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      const outcome = await executeNew(store, { slug: '2026-01-01-archive/living-page' });
      expect(outcome.exitCode).toBe(ExitCode.Ok);
      expect(await readFile(path.join(tmp.root, 'publish/2026-01-01-archive/living-page/index.html'), 'utf8')).toContain('<title>living-page</title>');
    } finally {
      await tmp.cleanup();
    }
  });

  it.each([
    ['a parent-directory segment', '../escape'],
    ['a parent-directory segment in the middle', 'folder-a/../../escape'],
    ['an absolute path', '/etc/escape'],
    ['an empty segment', 'folder-a//escape'],
    ['a bare current-directory segment', '.'],
    ['an empty slug', ''],
  ])('refuses %s, writing nothing inside or outside the publish path', async (_label, slug) => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await expect(executeNew(store, { slug })).rejects.toBeInstanceOf(PublishInvalidSlugError);
      await expect(readdir(path.join(tmp.root, 'publish'))).rejects.toThrow();
      expect(await readdir(tmp.root)).toEqual([]);
    } finally {
      await tmp.cleanup();
    }
  });

  it('never overwrites an existing page folder', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await executeNew(store, { slug: 'some-slug' });
      const before = await readFile(path.join(tmp.root, 'publish/some-slug/index.html'), 'utf8');

      await expect(executeNew(store, { slug: 'some-slug' })).rejects.toBeInstanceOf(PublishSlugExistsError);

      const after = await readFile(path.join(tmp.root, 'publish/some-slug/index.html'), 'utf8');
      expect(after).toBe(before);
    } finally {
      await tmp.cleanup();
    }
  });

  /**
   * publish-names-where-the-page-is-served: the page is born in a session
   * worktree, which is where the published-pages route does NOT yet answer for
   * it. Reporting the previewable address and its successor is the whole fix.
   */
  it('names the previewable address, and the address after landing, from a session worktree', async () => {
    const tmp = await makeTmpDir();
    try {
      const config = makeConfig();
      const worktreeRoot = path.join(tmp.root, config.session.worktrees_path, 'session-20260920-180253-d97aa6');
      await mkdir(worktreeRoot, { recursive: true });
      const store: Store = { root: worktreeRoot, config };
      const outcome = await executeNew(store, { slug: 'folder-a/example-page' });

      expect(outcome.data?.served_at).toEqual({
        area: 'preview',
        route: '/preview/session-20260920-180253-d97aa6/folder-a/example-page/index.html',
        url: null,
        worktree: 'session-20260920-180253-d97aa6',
        after_landing: { route: '/publish/folder-a/example-page/index.html', url: null },
      });
      expect(outcome.humanSummary).toContain('Preview at /preview/session-20260920-180253-d97aa6/folder-a/example-page/index.html');
      expect(outcome.humanSummary).toContain('(at /publish/folder-a/example-page/index.html once it lands)');
      expect(outcome.humanSummary.split('\n')).toHaveLength(1);
    } finally {
      await tmp.cleanup();
    }
  });

  it('names an absolute URL when the store declares a base URL, and a route alone when it does not', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig({ serve: { base_url: 'https://ctx-a.example.test/ctx-a/' } }) };
      const outcome = await executeNew(store, { slug: 'folder-a/example-page' });
      expect(outcome.data?.served_at?.url).toBe('https://ctx-a.example.test/ctx-a/publish/folder-a/example-page/index.html');
      expect(outcome.humanSummary).toContain('Served at https://ctx-a.example.test/ctx-a/publish/folder-a/example-page/index.html.');
    } finally {
      await tmp.cleanup();
    }
  });

});

describe('publish new --disposable (two-kinds-of-published-page)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function onDate(iso: string): void {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(`${iso}T12:00:00Z`));
  }

  it('scaffolds at disposable/<today>-<name> with the ordinary skeleton, reporting it disposable', async () => {
    onDate('2026-10-13');
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      const outcome = await executeNew(store, { slug: 'agent-week', disposable: true });
      expect(outcome.exitCode).toBe(ExitCode.Ok);
      expect(outcome.data?.path).toBe('publish/disposable/2026-10-13-agent-week');
      expect(outcome.data?.lifespan).toBe('disposable');
      expect(outcome.humanSummary).toContain('(disposable)');
      expect((await readdir(path.join(tmp.root, 'publish/disposable/2026-10-13-agent-week'))).sort()).toEqual(['README.md', 'index.html']);
      const html = await readFile(path.join(tmp.root, 'publish/disposable/2026-10-13-agent-week/index.html'), 'utf8');
      // The date in the path is the same date the skeleton's provenance line carries.
      expect(html).toContain('<span>2026-10-13</span>');
    } finally {
      await tmp.cleanup();
    }
  });

  it('refuses a caller-supplied date, creating nothing', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await expect(executeNew(store, { slug: '2026-10-01-agent-week', disposable: true })).rejects.toBeInstanceOf(PublishDisposableNameError);
      await expect(readdir(path.join(tmp.root, 'publish'))).rejects.toThrow();
    } finally {
      await tmp.cleanup();
    }
  });

  it('refuses a multi-segment disposable name, creating nothing', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await expect(executeNew(store, { slug: 'folder-a/agent-week', disposable: true })).rejects.toBeInstanceOf(PublishDisposableNameError);
      await expect(readdir(path.join(tmp.root, 'publish'))).rejects.toThrow();
    } finally {
      await tmp.cleanup();
    }
  });

  it('refuses a disposable name that would escape the publish path', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await expect(executeNew(store, { slug: '..', disposable: true })).rejects.toBeInstanceOf(PublishInvalidSlugError);
    } finally {
      await tmp.cleanup();
    }
  });

  it('refuses a slug spelled into disposable/ without the option, naming the reservation and --disposable', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      const attempt = executeNew(store, { slug: 'disposable/2026-10-13-agent-week' });
      await expect(attempt).rejects.toBeInstanceOf(PublishDisposableSegmentReservedError);
      await expect(attempt).rejects.toThrow(/reserved for disposable pages.*--disposable/);
      await expect(readdir(path.join(tmp.root, 'publish'))).rejects.toThrow();
    } finally {
      await tmp.cleanup();
    }
  });

  it('leaves a folder merely beginning with the word alone', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      const outcome = await executeNew(store, { slug: 'disposable-notes/page' });
      expect(outcome.data?.lifespan).toBe('permanent');
    } finally {
      await tmp.cleanup();
    }
  });

  it('refuses a second run on the same date and leaves the first folder unchanged', async () => {
    onDate('2026-10-13');
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await executeNew(store, { slug: 'agent-week', disposable: true });
      const folder = path.join(tmp.root, 'publish/disposable/2026-10-13-agent-week');
      await writeFile(path.join(folder, 'index.html'), 'edited by the author');

      await expect(executeNew(store, { slug: 'agent-week', disposable: true })).rejects.toBeInstanceOf(PublishSlugExistsError);
      expect(await readFile(path.join(folder, 'index.html'), 'utf8')).toBe('edited by the author');
    } finally {
      await tmp.cleanup();
    }
  });
});
