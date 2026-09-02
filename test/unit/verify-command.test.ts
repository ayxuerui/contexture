import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildAgentsCanonicalSection,
  buildAgentsCaptureSection,
  buildAgentsConventionsSection,
  buildAgentsLegRoutingSection,
  buildAgentsPlacementSection,
} from '../../src/core/agents-doc.js';
import { execute } from '../../src/commands/verify.js';
import { syncShippedSkills } from '../../src/core/skills.js';
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
    write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] },
    catalog: { path: 'catalog/', section_max_bytes: 32768 },
    disclosure: { internal_audiences: [], hard_walls: [], leak_markers: {} },
    ingest: { inbox_path: 'inbox/', tracking_params: [] },
    organize: { archive_path: 'archive/', rollup_stale_days: 7 },
    harness: { skills_path: 'skills/', guidance_path: 'guidance/' },
    adapters: [],
  };
}

async function setUpStore(root: string): Promise<Store> {
  const config = makeConfig();
  await syncShippedSkills(root, config);
  await buildAgentsCanonicalSection(root, config);
  await buildAgentsLegRoutingSection(root, config);
  await buildAgentsCaptureSection(root, config);
  await buildAgentsPlacementSection(root, config);
  await buildAgentsConventionsSection(root, config);
  return { root, config };
}

describe('verify --portable', () => {
  it('passes every step in a fresh, empty store with no prior builds and no harness state', async () => {
    const tmp = await makeTmpDir();
    try {
      const store = await setUpStore(tmp.root);
      const outcome = await execute(store, { portable: true });
      expect(outcome.exitCode).toBe(ExitCode.Ok);
      expect(outcome.data?.steps.every((s) => s.status === 'pass')).toBe(true);
      expect(outcome.data?.steps).toHaveLength(5);
    } finally {
      await tmp.cleanup();
    }
  });

  it('fails naming the missing section when AGENTS.md is entirely missing', async () => {
    const tmp = await makeTmpDir();
    try {
      // No setup at all — not even contexture.yaml-adjacent scaffolding beyond config.
      const store: Store = { root: tmp.root, config: makeConfig() };
      const outcome = await execute(store, { portable: true });
      // catalog show and graph build both work from nothing; the failure should be a missing section.
      expect(outcome.exitCode).toBe(ExitCode.CheckFailed);
      const failed = outcome.data?.steps.find((s) => s.status === 'fail');
      expect(failed?.operation).toContain('AGENTS.md section');
    } finally {
      await tmp.cleanup();
    }
  });

  it('fails naming the drifted convention file when a convention file changes without regenerating AGENTS.md', async () => {
    const tmp = await makeTmpDir();
    try {
      const store = await setUpStore(tmp.root);
      const { mkdir, writeFile: write } = await import('node:fs/promises');
      await mkdir(path.join(tmp.root, 'guidance'), { recursive: true });
      await write(path.join(tmp.root, 'guidance/style.md'), '---\ntitle: Style\n---\n\nOriginal.\n');
      await buildAgentsConventionsSection(tmp.root, store.config); // AGENTS.md now reflects "Original."

      await write(path.join(tmp.root, 'guidance/style.md'), '---\ntitle: Style\n---\n\nChanged.\n'); // edited without regenerating

      const outcome = await execute(store, { portable: true });
      expect(outcome.exitCode).toBe(ExitCode.CheckFailed);
      const failed = outcome.data?.steps.find((s) => s.status === 'fail');
      expect(failed?.operation).toContain('conventions');
      expect(failed?.detail).toContain('guidance/style.md');
    } finally {
      await tmp.cleanup();
    }
  });

  it('fails naming the drifted mission document when it changes without regenerating AGENTS.md', async () => {
    const tmp = await makeTmpDir();
    try {
      const { buildAgentsMissionSection } = await import('../../src/core/agents-doc.js');
      const config = { ...makeConfig(), organize: { archive_path: 'archive/', rollup_stale_days: 7, mission_path: 'MISSION.md' } };
      const { mkdir, writeFile: write } = await import('node:fs/promises');
      await syncShippedSkills(tmp.root, config);
      await buildAgentsCanonicalSection(tmp.root, config);
      await buildAgentsLegRoutingSection(tmp.root, config);
      await buildAgentsCaptureSection(tmp.root, config);
      await buildAgentsPlacementSection(tmp.root, config);
      await buildAgentsConventionsSection(tmp.root, config);
      await mkdir(tmp.root, { recursive: true });
      await write(path.join(tmp.root, 'MISSION.md'), '# Mission\n\nOriginal priorities.\n');
      await buildAgentsMissionSection(tmp.root, config);

      await write(path.join(tmp.root, 'MISSION.md'), '# Mission\n\nChanged priorities.\n');

      const store: Store = { root: tmp.root, config };
      const outcome = await execute(store, { portable: true });
      expect(outcome.exitCode).toBe(ExitCode.CheckFailed);
      const failed = outcome.data?.steps.find((s) => s.status === 'fail');
      expect(failed?.operation).toContain('mission');
      expect(failed?.detail).toContain('MISSION.md');
    } finally {
      await tmp.cleanup();
    }
  });

  it('does not run a step after the first failure — it stops', async () => {
    const tmp = await makeTmpDir();
    try {
      const store = await setUpStore(tmp.root);
      const agentsMdPath = path.join(tmp.root, 'AGENTS.md');
      const content = await readFile(agentsMdPath, 'utf8');
      const stripped = content.replace(/<!-- >>> contexture:placement.*?<!-- <<< contexture:placement <<< -->\n?/s, '');
      expect(stripped).not.toBe(content);
      await writeFile(agentsMdPath, stripped);

      const outcome = await execute(store, { portable: true });
      // Only the retrieval query, the derived-artifact build, and the one failing
      // section-presence check should run — never a later step.
      expect(outcome.data?.steps).toHaveLength(3);
      expect(outcome.data?.steps[2]?.status).toBe('fail');
    } finally {
      await tmp.cleanup();
    }
  });

  it('follows a skill by path as the final step', async () => {
    const tmp = await makeTmpDir();
    try {
      const store = await setUpStore(tmp.root);
      const outcome = await execute(store, { portable: true });
      const last = outcome.data?.steps.at(-1);
      expect(last?.operation).toMatch(/^follow skill ".+" by path$/);
      expect(last?.status).toBe('pass');
    } finally {
      await tmp.cleanup();
    }
  });
});
