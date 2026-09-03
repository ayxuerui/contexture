import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import type { StoreConfig } from '../../src/config/schema.js';
import { conventionsSectionSizeCheck } from '../../src/core/checks/harness-portability-checks.js';
import { AGENTS_MD_CONVENTIONS_FENCE, agentsMdPath } from '../../src/core/agents-doc.js';
import { upsertFencedRegionInFile } from '../../src/core/fs/fenced-region.js';
import type { CheckContext } from '../../src/core/checks/types.js';
import { fakeGitRunner } from '../helpers/fake-env.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

function makeConfig(overrides: Partial<StoreConfig> = {}): StoreConfig {
  return {
    schema_version: 4,
    taxonomy: { profile: 'para', layers: [{ name: 'Projects', path: 'projects', description: 'Active work.' }] },
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

async function writeConventionsSection(root: string, body: string[]): Promise<void> {
  await mkdir(path.dirname(agentsMdPath(root)), { recursive: true });
  await upsertFencedRegionInFile(agentsMdPath(root), AGENTS_MD_CONVENTIONS_FENCE, body);
}

describe('conventionsSectionSizeCheck', () => {
  it('skips when AGENTS.md has not been generated yet', async () => {
    const tmp = await makeTmpDir();
    try {
      const result = await conventionsSectionSizeCheck.run(makeCtx(tmp.root, makeConfig()));
      expect(result.status).toBe('skip');
    } finally {
      await tmp.cleanup();
    }
  });

  it('passes when the section is within the default budget', async () => {
    const tmp = await makeTmpDir();
    try {
      await writeConventionsSection(tmp.root, ['## Store conventions', '', 'small']);
      const result = await conventionsSectionSizeCheck.run(makeCtx(tmp.root, makeConfig()));
      expect(result.status).toBe('pass');
    } finally {
      await tmp.cleanup();
    }
  });

  it('fails, naming the size and budget, once a configured ceiling is exceeded', async () => {
    const tmp = await makeTmpDir();
    try {
      await writeConventionsSection(tmp.root, ['## Store conventions', '', 'this section is well over ten bytes']);
      const config = makeConfig({ harness: { skills_path: 'skills/', guidance_path: 'guidance/', convention_max_bytes: 10 } });
      const result = await conventionsSectionSizeCheck.run(makeCtx(tmp.root, config));
      expect(result.status).toBe('fail');
      expect(result.findings[0]?.details).toMatchObject({ budget: 10 });
    } finally {
      await tmp.cleanup();
    }
  });

  it('uses the default budget when unconfigured', async () => {
    const tmp = await makeTmpDir();
    try {
      const bigBody = ['## Store conventions', '', 'x'.repeat(40_000)];
      await writeConventionsSection(tmp.root, bigBody);
      const result = await conventionsSectionSizeCheck.run(makeCtx(tmp.root, makeConfig()));
      expect(result.status).toBe('fail');
      const finding = result.findings[0];
      expect(finding?.details).toMatchObject({ budget: 32 * 1024 });
    } finally {
      await tmp.cleanup();
    }
  });
});
