import { describe, expect, it } from 'vitest';
import type { StoreConfig } from '../../src/config/schema.js';
import type { CheckContext } from '../../src/core/checks/types.js';
import { identityExclusionCheck } from '../../src/core/checks/identity-checks.js';

function makeConfig(excludePaths: string[], identityPath = 'identity/'): StoreConfig {
  return {
    schema_version: 1,
    taxonomy: { profile: 'para', layers: [] },
    fields: { visibility: 'scope' },
    visibility: { default_context: 'private', directory_defaults: {}, contexts: {} },
    derived: { paths: [] },
    retrieval: { exclude_paths: excludePaths, relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } },
    git: { default_branch: 'main' },
    session: { branch_prefix: 'session/', worktrees_path: '.worktrees/' },
    write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] },
    catalog: { path: 'catalog/', section_max_bytes: 32768 },
    disclosure: { internal_audiences: [], hard_walls: [], leak_markers: {} },
    ingest: { inbox_path: 'inbox/', tracking_params: [] },
    organize: { archive_path: 'archive/', rollup_stale_days: 7 },
    identity: { path: identityPath, files: {}, entry_delimiter: '' },
    harness: { procedures_path: 'procedures/', conventions_path: 'conventions/' },
    adapters: [],
  };
}

function makeCtx(config: StoreConfig): CheckContext {
  return {
    storeRoot: '/fake/root',
    config,
    scope: 'store',
    git: { run: async () => ({ stdout: '', stderr: '', exitCode: 0 }) },
    notes: async () => [],
    graph: async () => null,
    catalog: async () => undefined,
  };
}

describe('identityExclusionCheck', () => {
  it('is severity: invariant', () => {
    expect(identityExclusionCheck.severity).toBe('invariant');
  });

  it('passes when the identity path is covered by retrieval.exclude_paths', async () => {
    const result = await identityExclusionCheck.run(makeCtx(makeConfig(['identity/'])));
    expect(result.status).toBe('pass');
  });

  it('fails, naming each unexcluded role\'s resolved path, when the identity path is not covered', async () => {
    const result = await identityExclusionCheck.run(makeCtx(makeConfig(['.contexture/'])));
    expect(result.status).toBe('fail');
    expect(result.findings.map((f) => f.subject).sort()).toEqual(
      ['identity/posture.md', 'identity/user-facts.md', 'identity/world-facts.md'].sort(),
    );
  });

  it('session-capture-command D3: fails, naming only the relocated role, when one role is bound outside the excluded identity path', async () => {
    const config = makeConfig(['identity/']);
    config.identity.files = { 'world-facts': 'twin/memory/MEMORY.md' };
    const result = await identityExclusionCheck.run(makeCtx(config));
    expect(result.status).toBe('fail');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.subject).toBe('twin/memory/MEMORY.md');
  });

  it('session-capture-command D3: passes when a relocated role\'s path is itself covered by retrieval.exclude_paths', async () => {
    const config = makeConfig(['identity/', 'twin/memory/']);
    config.identity.files = { 'world-facts': 'twin/memory/MEMORY.md' };
    const result = await identityExclusionCheck.run(makeCtx(config));
    expect(result.status).toBe('pass');
  });

  it('passes for a non-default identity path when correctly declared as excluded', async () => {
    const result = await identityExclusionCheck.run(makeCtx(makeConfig(['memory/'], 'memory/')));
    expect(result.status).toBe('pass');
  });
});
