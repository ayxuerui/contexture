import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
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
import type { RunEnv } from '../../src/core/env.js';
import { makeFakeEnv } from '../helpers/fake-env.js';
import { syncShippedSkills } from '../../src/core/skills.js';
import type { StoreConfig } from '../../src/config/schema.js';
import { ExitCode } from '../../src/core/exit-codes.js';
import type { Store } from '../../src/core/store.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

import { SHIPPED_DEFAULTS } from '../../src/config/defaults.js';
function makeConfig(): StoreConfig {
  return {
    schema_version: 1,
    taxonomy: { profile: 'para', layers: [{ name: 'Projects', path: 'projects', description: '' }] },
    derived: { paths: [] },
    retrieval: { exclude_paths: [], demote_paths: [], gather_max_notes: 50, relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } },
    git: { default_branch: 'main' },
    session: { branch_prefix: 'session/', worktrees_path: '.worktrees/' },
    write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] },
    catalog: { path: 'catalog/', section_max_bytes: 32768 },
    publish: { path: 'publish/' },
    skills: { vendored: [] },
    update_check: SHIPPED_DEFAULTS.update_check,
    ingest: { inbox_path: 'raw/inbox/', capture_root: 'raw/', tracking_params: [] },
    organize: { archive_destination: 'archive/', rollup_stale_days: 7 },
    harness: { skills_path: 'skills/', guidance_path: 'guidance/', convention_max_bytes: 32768 },
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

/**
 * The write-path prerequisites step resolves a tool on PATH, so tests inject a
 * PATH of their own containing a stub — nothing global is touched, and the
 * step's absent-tool branch stays testable by simply not writing the stub.
 */
async function envWithTool(cwd: string, toolDir: string, name = 'gh'): Promise<RunEnv> {
  await mkdir(toolDir, { recursive: true });
  await writeFile(path.join(toolDir, name), '#!/bin/sh\nexit 0\n');
  await chmod(path.join(toolDir, name), 0o755);
  return makeFakeEnv({ cwd, env: { PATH: toolDir } });
}

describe('verify --portable', () => {
  it('passes every step in a fresh, empty store with no prior builds and no harness state', async () => {
    const tmp = await makeTmpDir();
    try {
      const store = await setUpStore(tmp.root);
      const outcome = await execute(await envWithTool(tmp.root, path.join(tmp.root, 'bin')), store);
      expect(outcome.exitCode).toBe(ExitCode.Ok);
      expect(outcome.data?.steps.every((s) => s.status === 'pass')).toBe(true);
      expect(outcome.data?.steps).toHaveLength(7);
    } finally {
      await tmp.cleanup();
    }
  });

  it('fails naming the missing section when AGENTS.md is entirely missing', async () => {
    const tmp = await makeTmpDir();
    try {
      // No setup at all — not even contexture.yaml-adjacent scaffolding beyond config.
      const store: Store = { root: tmp.root, config: makeConfig() };
      const outcome = await execute(makeFakeEnv({ cwd: tmp.root }), store);
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

      const outcome = await execute(makeFakeEnv({ cwd: tmp.root }), store);
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
      const config = { ...makeConfig(), organize: { archive_destination: 'archive/', rollup_stale_days: 7, mission_path: 'MISSION.md' } };
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
      const outcome = await execute(makeFakeEnv({ cwd: tmp.root }), store);
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

      const outcome = await execute(makeFakeEnv({ cwd: tmp.root }), store);
      // Only the retrieval query, the derived-artifact build, and the one failing
      // section-presence check should run — never a later step.
      expect(outcome.data?.steps).toHaveLength(3);
      expect(outcome.data?.steps[2]?.status).toBe('fail');
    } finally {
      await tmp.cleanup();
    }
  });

  it('stops at a failing derived-artifact build, running no later step', async () => {
    const tmp = await makeTmpDir();
    try {
      const store = await setUpStore(tmp.root);
      // Occupy the derived cache path with a FILE, so writing the graph into it
      // cannot succeed — the failure is the build's, not a missing store.
      const cacheDir = path.join(tmp.root, '.contexture', 'cache');
      await mkdir(path.dirname(cacheDir), { recursive: true });
      await rm(cacheDir, { recursive: true, force: true });
      await writeFile(cacheDir, 'not a directory\n');

      const outcome = await execute(await envWithTool(tmp.root, path.join(tmp.root, 'bin')), store);
      expect(outcome.exitCode).toBe(ExitCode.CheckFailed);
      expect(outcome.data?.steps).toHaveLength(2);
      expect(outcome.data?.steps[1]?.operation).toBe('derived-artifact build (graph build)');
      expect(outcome.data?.steps[1]?.status).toBe('fail');
    } finally {
      await tmp.cleanup();
    }
  });

  it('runs the operations in order, ending with the write-path prerequisite', async () => {
    const tmp = await makeTmpDir();
    try {
      const store = await setUpStore(tmp.root);
      const outcome = await execute(await envWithTool(tmp.root, path.join(tmp.root, 'bin')), store);
      const operations = outcome.data?.steps.map((step) => step.operation) ?? [];
      expect(operations[0]).toBe('retrieval query (catalog show)');
      expect(operations[1]).toBe('derived-artifact build (graph build)');
      expect(operations.find((op) => /^follow skill ".+" by path$/.test(op))).toBeDefined();
      expect(operations.at(-2)).toBe('write-path gate refuses an escaping path');
      expect(operations.at(-1)).toBe('write-path prerequisite "gh" on PATH');
    } finally {
      await tmp.cleanup();
    }
  });

  /**
   * The gate's sanctioned-location rule is inert until `writable_paths` is
   * declared. This asserts the step exercises the escape rule instead, which is
   * enforced unconditionally — otherwise it would pass vacuously on every
   * default store and prove nothing (D3).
   */
  it('exercises the gate rule that holds on a default store, with writable_paths undeclared', async () => {
    const tmp = await makeTmpDir();
    try {
      const store = await setUpStore(tmp.root);
      expect(store.config.write_lifecycle.writable_paths).toEqual([]);
      const outcome = await execute(await envWithTool(tmp.root, path.join(tmp.root, 'bin')), store);
      const gate = outcome.data?.steps.find((step) => step.operation === 'write-path gate refuses an escaping path');
      expect(gate?.status).toBe('pass');
    } finally {
      await tmp.cleanup();
    }
  });

  it('fails naming the absent write-path tool, and reports it as the last step run', async () => {
    const tmp = await makeTmpDir();
    try {
      const store = await setUpStore(tmp.root);
      // An empty directory on PATH: the tool is simply not there.
      const outcome = await execute(await envWithTool(tmp.root, path.join(tmp.root, 'bin'), 'not-gh'), store);
      expect(outcome.exitCode).toBe(ExitCode.CheckFailed);
      const last = outcome.data?.steps.at(-1);
      expect(last?.operation).toBe('write-path prerequisite "gh" on PATH');
      expect(last?.status).toBe('fail');
      expect(last?.detail).toContain('gh');
    } finally {
      await tmp.cleanup();
    }
  });
});
