import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import type { StoreConfig } from '../../src/config/schema.js';
import { catalogCoverageCheck, catalogSectionSizeCheck } from '../../src/core/checks/catalog-checks.js';
import { buildCatalog } from '../../src/core/catalog/build.js';
import type { CheckContext } from '../../src/core/checks/types.js';
import type { Store } from '../../src/core/store.js';
import { fakeGitRunner } from '../helpers/fake-env.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

function makeConfig(overrides: Partial<StoreConfig> = {}): StoreConfig {
  return {
    schema_version: 1,
    taxonomy: { profile: 'para', layers: [{ name: 'Projects', path: 'projects', description: '' }] },
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
    harness: { skills_path: 'skills/', conventions_path: 'conventions/' },
    adapters: [],
    ...overrides,
  };
}

function makeCtx(storeRoot: string, config: StoreConfig): CheckContext {
  const { git } = fakeGitRunner();
  return {
    storeRoot,
    config,
    scope: 'store',
    git,
    notes: async () => [],
    graph: async () => null,
    catalog: async () => undefined,
  };
}

describe('catalogCoverageCheck', () => {
  it('fails, naming the missing note, when a note has no catalog entry', async () => {
    const tmp = await makeTmpDir();
    try {
      const config = makeConfig();
      await mkdir(path.join(tmp.root, 'projects'), { recursive: true });
      await writeFile(path.join(tmp.root, 'projects', 'a.md'), '# A\n');
      const result = await catalogCoverageCheck.run(makeCtx(tmp.root, config));
      expect(result.status).toBe('fail');
      expect(result.findings[0]?.subject).toBe('projects/a.md');
    } finally {
      await tmp.cleanup();
    }
  });

  it('passes right after a build', async () => {
    const tmp = await makeTmpDir();
    try {
      const config = makeConfig();
      await mkdir(path.join(tmp.root, 'projects'), { recursive: true });
      await writeFile(path.join(tmp.root, 'projects', 'a.md'), '# A\n');
      await buildCatalog({ root: tmp.root, config } as Store);
      const result = await catalogCoverageCheck.run(makeCtx(tmp.root, config));
      expect(result.status).toBe('pass');
    } finally {
      await tmp.cleanup();
    }
  });
});

describe('catalogSectionSizeCheck', () => {
  it('passes when every section is under budget', async () => {
    const tmp = await makeTmpDir();
    try {
      const config = makeConfig({ catalog: { path: 'catalog/', section_max_bytes: 32768 } });
      await mkdir(path.join(tmp.root, 'projects'), { recursive: true });
      await writeFile(path.join(tmp.root, 'projects', 'a.md'), '# A\n');
      await buildCatalog({ root: tmp.root, config } as Store);
      const result = await catalogSectionSizeCheck.run(makeCtx(tmp.root, config));
      expect(result.status).toBe('pass');
    } finally {
      await tmp.cleanup();
    }
  });

  it('fails, naming the section, when it exceeds the configured budget', async () => {
    const tmp = await makeTmpDir();
    try {
      const config = makeConfig({ catalog: { path: 'catalog/', section_max_bytes: 10 } }); // tiny budget
      await mkdir(path.join(tmp.root, 'projects'), { recursive: true });
      await writeFile(path.join(tmp.root, 'projects', 'a.md'), '# A\n');
      await buildCatalog({ root: tmp.root, config } as Store);
      const result = await catalogSectionSizeCheck.run(makeCtx(tmp.root, config));
      expect(result.status).toBe('fail');
      expect(result.findings[0]?.subject).toBe('projects');
    } finally {
      await tmp.cleanup();
    }
  });

  it('does not fail for a section that has never been built', async () => {
    const tmp = await makeTmpDir();
    try {
      const config = makeConfig({ catalog: { path: 'catalog/', section_max_bytes: 1 } });
      const result = await catalogSectionSizeCheck.run(makeCtx(tmp.root, config));
      expect(result.status).toBe('pass');
    } finally {
      await tmp.cleanup();
    }
  });
});
