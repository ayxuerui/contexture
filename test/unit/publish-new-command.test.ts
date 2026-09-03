import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { execute as executeNew } from '../../src/commands/publish-new.js';
import type { StoreConfig } from '../../src/config/schema.js';
import { ExitCode } from '../../src/core/exit-codes.js';
import { PublishInvalidSlugError, PublishReservedSlugError, PublishSlugExistsError } from '../../src/core/errors.js';
import type { Store } from '../../src/core/store.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

function makeConfig(): StoreConfig {
  return {
    schema_version: 1,
    taxonomy: { profile: 'para', layers: [] },
    derived: { paths: [] },
    retrieval: { exclude_paths: [], demote_paths: [], gather_max_notes: 50, relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } },
    git: { default_branch: 'main' },
    session: { branch_prefix: 'session/', worktrees_path: '.worktrees/' },
    write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] },
    catalog: { path: 'catalog/', section_max_bytes: 32768 },
    publish: { path: 'publish/' },
    skills: { vendored: [] },
    ingest: { inbox_path: 'raw/inbox/', capture_root: 'raw/', tracking_params: [] },
    organize: { archive_destination: 'archive/', rollup_stale_days: 7 },
    harness: { skills_path: 'skills/', guidance_path: 'guidance/', convention_max_bytes: 32768 },
    adapters: [],
  };
}

describe('publish new', () => {
  it('scaffolds a folder with index.html and a README carrying the required headings', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      const outcome = await executeNew(store, { slug: 'some-slug' });
      expect(outcome.exitCode).toBe(ExitCode.Ok);
      expect(outcome.data).toEqual({ slug: 'some-slug', path: 'publish/some-slug' });

      const html = await readFile(path.join(tmp.root, 'publish/some-slug/index.html'), 'utf8');
      expect(html).toContain('<meta name="viewport"');
      expect(html).toContain('@media print');
      expect(html).toContain('href="./README.md"');

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
      expect(outcome.data).toEqual({ slug: 'folder-a/folder-b/nested-page', path: 'publish/folder-a/folder-b/nested-page' });

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
});
