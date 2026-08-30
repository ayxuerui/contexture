import { describe, expect, it } from 'vitest';
import { configuredAdapters, resolveAdapter } from '../../src/adapters/registry.js';
import type { Adapter } from '../../src/adapters/types.js';
import type { AdapterDeclaration, StoreConfig } from '../../src/config/schema.js';
import { AdapterNotFoundError, AdapterVersionMismatchError } from '../../src/core/errors.js';

function makeConfig(adapters: AdapterDeclaration[]): StoreConfig {
  return {
    schema_version: 1,
    taxonomy: { profile: 'para', layers: [] },
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
    adapters,
  };
}

describe('resolveAdapter', () => {
  it('resolves a real built-in adapter by (kind, id)', () => {
    const found = resolveAdapter({ id: 'github', kind: 'forge' });
    expect(found.id).toBe('github');
    expect(found.kind).toBe('forge');
  });

  it('throws AdapterNotFoundError for an id not in the registry', () => {
    expect(() => resolveAdapter({ id: 'nonexistent', kind: 'forge' })).toThrow(AdapterNotFoundError);
  });

  it('throws AdapterNotFoundError when the id exists but under a different kind', () => {
    expect(() => resolveAdapter({ id: 'github', kind: 'harness-generation' })).toThrow(AdapterNotFoundError);
  });

  it('throws AdapterVersionMismatchError for a fixture adapter declaring an unsupported interface version', () => {
    const fixtureRegistry: Adapter[] = [{ id: 'future-adapter', kind: 'forge', interfaceVersion: 99 }];
    expect(() => resolveAdapter({ id: 'future-adapter', kind: 'forge' }, fixtureRegistry)).toThrow(
      AdapterVersionMismatchError,
    );
  });

  it('session-submit-and-land spec: reports a stale (pre-v2) forge adapter, naming both versions', () => {
    const fixtureRegistry: Adapter[] = [{ id: 'old-forge', kind: 'forge', interfaceVersion: 1 }];
    try {
      resolveAdapter({ id: 'old-forge', kind: 'forge' }, fixtureRegistry);
      expect.unreachable('expected AdapterVersionMismatchError');
    } catch (err) {
      expect(err).toBeInstanceOf(AdapterVersionMismatchError);
      expect((err as Error).message).toContain('1');
      expect((err as Error).message).toContain('2');
    }
  });

  it('accepts a fixture adapter of each of the three kinds when the version matches', () => {
    const fixtureRegistry: Adapter[] = [
      { id: 'fixture-harness', kind: 'harness-generation', interfaceVersion: 1 },
      { id: 'fixture-identity', kind: 'identity-injection', interfaceVersion: 1 },
      { id: 'fixture-forge', kind: 'forge', interfaceVersion: 2 },
    ];
    expect(resolveAdapter({ id: 'fixture-harness', kind: 'harness-generation' }, fixtureRegistry).id).toBe(
      'fixture-harness',
    );
    expect(resolveAdapter({ id: 'fixture-identity', kind: 'identity-injection' }, fixtureRegistry).id).toBe(
      'fixture-identity',
    );
    expect(resolveAdapter({ id: 'fixture-forge', kind: 'forge' }, fixtureRegistry).id).toBe('fixture-forge');
  });
});

describe('configuredAdapters', () => {
  it('returns only adapters of the requested kind, in declared order', () => {
    const config = makeConfig([
      { id: 'claude-code', kind: 'harness-generation' },
      { id: 'github', kind: 'forge' },
    ]);
    const forgeAdapters = configuredAdapters(config, 'forge');
    expect(forgeAdapters).toHaveLength(1);
    expect(forgeAdapters[0]?.id).toBe('github');
  });

  it('returns an empty list when no adapter of that kind is configured', () => {
    const config = makeConfig([{ id: 'claude-code', kind: 'harness-generation' }]);
    expect(configuredAdapters(config, 'forge')).toEqual([]);
  });

  it('propagates AdapterNotFoundError for a declared-but-unregistered adapter', () => {
    const config = makeConfig([{ id: 'nonexistent', kind: 'forge' }]);
    expect(() => configuredAdapters(config, 'forge')).toThrow(AdapterNotFoundError);
  });
});
