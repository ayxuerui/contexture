import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { execute as executeNew } from '../../src/commands/publish-new.js';
import type { StoreConfig } from '../../src/config/schema.js';
import { ExitCode } from '../../src/core/exit-codes.js';
import { PublishReservedSlugError, PublishSlugExistsError } from '../../src/core/errors.js';
import type { Store } from '../../src/core/store.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

function makeConfig(): StoreConfig {
  return {
    schema_version: 1,
    taxonomy: { profile: 'para', layers: [] },
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
