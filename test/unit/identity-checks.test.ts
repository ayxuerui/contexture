import { describe, expect, it } from 'vitest';
import type { StoreConfig } from '../../src/config/schema.js';
import type { CheckContext } from '../../src/core/checks/types.js';
import { identityExclusionCheck } from '../../src/core/checks/identity-checks.js';

function makeConfig(excludePaths: string[], identityPath = 'identity/'): StoreConfig {
  return {
    schema_version: 1,
    taxonomy: { profile: 'para', layers: [] },
    fields: { visibility: 'scope' },
    visibility: { default_context: 'private', directory_defaults: {} },
    derived: { paths: [] },
    retrieval: { exclude_paths: excludePaths },
    git: { default_branch: 'main' },
    session: { branch_prefix: 'session/', worktrees_path: '.worktrees/' },
    write_lifecycle: { diff_size_ceiling_lines: 2000 },
    catalog: { path: 'catalog/', section_max_bytes: 32768 },
    disclosure: { internal_audiences: [], hard_walls: [] },
    ingest: { inbox_path: 'inbox/' },
    organize: { archive_path: 'archive/' },
    identity: { path: identityPath },
    harness: { procedures_path: 'procedures/' },
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

  it('fails, naming the identity path, when it is not covered', async () => {
    const result = await identityExclusionCheck.run(makeCtx(makeConfig(['.contexture/'])));
    expect(result.status).toBe('fail');
    expect(result.findings[0]?.subject).toBe('identity/');
  });

  it('passes for a non-default identity path when correctly declared as excluded', async () => {
    const result = await identityExclusionCheck.run(makeCtx(makeConfig(['memory/'], 'memory/')));
    expect(result.status).toBe('pass');
  });
});
