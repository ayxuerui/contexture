import { describe, expect, it } from 'vitest';
import { configuredAdapters, resolveAdapter } from '../../src/adapters/registry.js';
import type { Adapter } from '../../src/adapters/types.js';
import type { AdapterDeclaration, StoreConfig } from '../../src/config/schema.js';
import { AdapterNotFoundError, AdapterVersionMismatchError } from '../../src/core/errors.js';

import { SHIPPED_DEFAULTS } from '../../src/config/defaults.js';
function makeConfig(adapters: AdapterDeclaration[]): StoreConfig {
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
    update_check: SHIPPED_DEFAULTS.update_check,
    ingest: { inbox_path: 'raw/inbox/', capture_root: 'raw/', tracking_params: [] },
    organize: { archive_destination: 'archive/', rollup_stale_days: 7 },
    harness: { skills_path: 'skills/', guidance_path: 'guidance/', convention_max_bytes: 32768 },
    adapters,
  };
}

describe('resolveAdapter', () => {
  it('resolves a real built-in adapter by (kind, id)', () => {
    const found = resolveAdapter({ id: 'claude-code', kind: 'harness-generation' });
    expect(found.id).toBe('claude-code');
    expect(found.kind).toBe('harness-generation');
  });

  it('throws AdapterNotFoundError for an id not in the registry', () => {
    expect(() => resolveAdapter({ id: 'nonexistent', kind: 'harness-generation' })).toThrow(AdapterNotFoundError);
  });

  it('throws AdapterVersionMismatchError for a fixture adapter declaring an unsupported interface version', () => {
    const fixtureRegistry: Adapter[] = [{ id: 'future-adapter', kind: 'harness-generation', interfaceVersion: 99 }];
    expect(() => resolveAdapter({ id: 'future-adapter', kind: 'harness-generation' }, fixtureRegistry)).toThrow(
      AdapterVersionMismatchError,
    );
  });

  it('vendored-craft-skills spec: reports a stale (pre-v2) harness-generation adapter, naming both versions', () => {
    const fixtureRegistry: Adapter[] = [{ id: 'old-harness', kind: 'harness-generation', interfaceVersion: 1 }];
    try {
      resolveAdapter({ id: 'old-harness', kind: 'harness-generation' }, fixtureRegistry);
      expect.unreachable('expected AdapterVersionMismatchError');
    } catch (err) {
      expect(err).toBeInstanceOf(AdapterVersionMismatchError);
      expect((err as Error).message).toContain('1');
      expect((err as Error).message).toContain('2');
    }
  });

  it('accepts a fixture adapter when its declared version matches the supported one', () => {
    const fixtureRegistry: Adapter[] = [{ id: 'fixture-harness', kind: 'harness-generation', interfaceVersion: 2 }];
    expect(resolveAdapter({ id: 'fixture-harness', kind: 'harness-generation' }, fixtureRegistry).id).toBe(
      'fixture-harness',
    );
  });
});

describe('configuredAdapters', () => {
  it('returns only adapters of the requested kind, in declared order', () => {
    const fixtureRegistry: Adapter[] = [
      { id: 'first', kind: 'harness-generation', interfaceVersion: 2 },
      { id: 'second', kind: 'harness-generation', interfaceVersion: 2 },
    ];
    const config = makeConfig([
      { id: 'first', kind: 'harness-generation' },
      { id: 'second', kind: 'harness-generation' },
    ]);
    const found = configuredAdapters(config, 'harness-generation', fixtureRegistry);
    expect(found.map((a) => a.id)).toEqual(['first', 'second']);
  });

  it('returns an empty list when no adapter of that kind is configured', () => {
    const config = makeConfig([]);
    expect(configuredAdapters(config, 'harness-generation')).toEqual([]);
  });

  it('propagates AdapterNotFoundError for a declared-but-unregistered adapter', () => {
    const config = makeConfig([{ id: 'nonexistent', kind: 'harness-generation' }]);
    expect(() => configuredAdapters(config, 'harness-generation')).toThrow(AdapterNotFoundError);
  });
});
