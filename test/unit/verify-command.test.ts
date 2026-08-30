import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildAgentsCanonicalSection } from '../../src/core/agents-doc.js';
import { execute } from '../../src/commands/verify.js';
import { syncShippedSkills } from '../../src/core/procedures.js';
import type { StoreConfig } from '../../src/config/schema.js';
import { ExitCode } from '../../src/core/exit-codes.js';
import type { Store } from '../../src/core/store.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

function makeConfig(): StoreConfig {
  return {
    schema_version: 1,
    taxonomy: { profile: 'para', layers: [{ name: 'Projects', path: 'projects', description: '' }] },
    fields: { visibility: 'scope' },
    visibility: { default_context: 'private', directory_defaults: {}, contexts: {} },
    derived: { paths: [] },
    retrieval: { exclude_paths: [], relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } },
    git: { default_branch: 'main' },
    session: { branch_prefix: 'session/', worktrees_path: '.worktrees/' },
    write_lifecycle: { diff_size_ceiling_lines: 2000 },
    catalog: { path: 'catalog/', section_max_bytes: 32768 },
    disclosure: { internal_audiences: [], hard_walls: [] },
    ingest: { inbox_path: 'inbox/' },
    organize: { archive_path: 'archive/' },
    identity: { path: 'identity/' },
    harness: { procedures_path: 'procedures/', conventions_path: 'conventions/' },
    adapters: [],
  };
}

async function setUpStore(root: string): Promise<Store> {
  const config = makeConfig();
  await syncShippedSkills(root, config);
  await buildAgentsCanonicalSection(root, config);
  return { root, config };
}

describe('verify --portable', () => {
  it('passes all three steps in a fresh, empty store with no prior builds and no harness state', async () => {
    const tmp = await makeTmpDir();
    try {
      const store = await setUpStore(tmp.root);
      const outcome = await execute(store, { portable: true });
      expect(outcome.exitCode).toBe(ExitCode.Ok);
      expect(outcome.data?.steps.every((s) => s.status === 'pass')).toBe(true);
      expect(outcome.data?.steps).toHaveLength(3);
    } finally {
      await tmp.cleanup();
    }
  });

  it('fails naming the retrieval-query step when AGENTS.md is entirely missing (no procedure index to check, but this fails earlier anyway)', async () => {
    const tmp = await makeTmpDir();
    try {
      // No setup at all — not even contexture.yaml-adjacent scaffolding beyond config.
      const store: Store = { root: tmp.root, config: makeConfig() };
      const outcome = await execute(store, { portable: true });
      // catalog show and graph build both work from nothing; the failure should be the missing AGENTS.md.
      expect(outcome.exitCode).toBe(ExitCode.CheckFailed);
      const failed = outcome.data?.steps.find((s) => s.status === 'fail');
      expect(failed?.operation).toContain('procedure index');
    } finally {
      await tmp.cleanup();
    }
  });

  it('fails naming the specific missing procedure when one index entry is deleted from AGENTS.md (task 8.8)', async () => {
    const tmp = await makeTmpDir();
    try {
      const store = await setUpStore(tmp.root);
      const agentsMdPath = path.join(tmp.root, 'AGENTS.md');
      const content = await readFile(agentsMdPath, 'utf8');
      await writeFile(agentsMdPath, content.replace(/^- \[ctxr-placement\]\(procedures\/ctxr-placement\/SKILL\.md\).*\n/m, ''));

      const outcome = await execute(store, { portable: true });
      expect(outcome.exitCode).toBe(ExitCode.CheckFailed);
      const failed = outcome.data?.steps.find((s) => s.status === 'fail');
      expect(failed?.operation).toContain('ctxr-placement');
    } finally {
      await tmp.cleanup();
    }
  });

  it('does not fail on a step after the first failure — it stops', async () => {
    const tmp = await makeTmpDir();
    try {
      const store = await setUpStore(tmp.root);
      const agentsMdPath = path.join(tmp.root, 'AGENTS.md');
      const content = await readFile(agentsMdPath, 'utf8');
      await writeFile(agentsMdPath, content.replace(/^- \[ctxr-ingest-orchestration\]\(procedures\/ctxr-ingest-orchestration\/SKILL\.md\).*\n/m, ''));

      const outcome = await execute(store, { portable: true });
      // Only the retrieval query, the derived-artifact build, and the one failing
      // procedure-index check should run — never a fourth "follow procedure" step.
      expect(outcome.data?.steps).toHaveLength(3);
      expect(outcome.data?.steps[2]?.status).toBe('fail');
    } finally {
      await tmp.cleanup();
    }
  });
});
