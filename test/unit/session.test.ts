import { describe, expect, it } from 'vitest';
import type { StoreConfig } from '../../src/config/schema.js';
import {
  generateSessionBranchName,
  isSessionBranch,
  isSessionWorktreePath,
  worktreeDirNameFor,
  worktreePathFor,
} from '../../src/core/session.js';

function makeConfig(overrides: Partial<StoreConfig['session']> = {}): StoreConfig {
  return {
    schema_version: 1,
    taxonomy: { profile: 'para', layers: [] },
    derived: { paths: [] },
    retrieval: { exclude_paths: [], demote_paths: [], gather_max_notes: 50, relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } },
    git: { default_branch: 'main' },
    session: { branch_prefix: 'session/', worktrees_path: '.worktrees/', ...overrides },
    write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] },
    catalog: { path: 'catalog/', section_max_bytes: 32768 },
    publish: { path: 'publish/' },
    skills: { vendored: [] },
    ingest: { inbox_path: 'raw/inbox/', capture_root: 'raw/', tracking_params: [] },
    organize: { archive_destination: 'archive/', rollup_stale_days: 7 },
    harness: { skills_path: 'skills/', guidance_path: 'guidance/', convention_max_bytes: 32768 },
    adapters: [],
  };
}

describe('generateSessionBranchName', () => {
  it('starts with the configured prefix', () => {
    const name = generateSessionBranchName(makeConfig());
    expect(name.startsWith('session/')).toBe(true);
  });

  it('respects a custom prefix', () => {
    const name = generateSessionBranchName(makeConfig({ branch_prefix: 'agent/' }));
    expect(name.startsWith('agent/')).toBe(true);
  });

  it('two calls produce distinct names', () => {
    const a = generateSessionBranchName(makeConfig());
    const b = generateSessionBranchName(makeConfig());
    expect(a).not.toBe(b);
  });

  it('is sortable by creation time via a fixed clock', () => {
    const earlier = generateSessionBranchName(makeConfig(), new Date('2026-01-01T00:00:00Z'));
    const later = generateSessionBranchName(makeConfig(), new Date('2026-06-01T00:00:00Z'));
    expect(earlier < later).toBe(true);
  });
});

describe('isSessionBranch', () => {
  it('recognizes a branch under the configured prefix', () => {
    expect(isSessionBranch(makeConfig(), 'session/20260101-000000-abcdef')).toBe(true);
  });

  it('rejects a branch outside the prefix', () => {
    expect(isSessionBranch(makeConfig(), 'main')).toBe(false);
    expect(isSessionBranch(makeConfig(), 'feature/x')).toBe(false);
  });
});

describe('worktreeDirNameFor / worktreePathFor', () => {
  it('replaces slashes in the branch name for the directory name', () => {
    expect(worktreeDirNameFor('session/2026-a')).toBe('session-2026-a');
  });

  it('nests the worktree under the configured worktrees_path', () => {
    const store = { root: '/repo', config: makeConfig() };
    expect(worktreePathFor(store, 'session/abc')).toBe('/repo/.worktrees/session-abc');
  });
});

describe('isSessionWorktreePath (session-submit-and-land: survives a --branch rename)', () => {
  it('recognizes a worktree whose immediate parent is named after the configured worktrees path, regardless of its branch name', () => {
    expect(isSessionWorktreePath(makeConfig(), '/repo/.worktrees/session-abc')).toBe(true);
    expect(isSessionWorktreePath(makeConfig(), '/repo/.worktrees/topic-x')).toBe(true); // renamed branch, same location
  });

  it('is independent of any store.root — true even when the worktree in question IS store.root', () => {
    // the self-referential case `session land --reap` must handle: invoked FROM the very worktree it would remove.
    expect(isSessionWorktreePath(makeConfig(), '/repo/.worktrees/session-abc')).toBe(true);
  });

  it('rejects a path whose parent is not the configured worktrees directory', () => {
    expect(isSessionWorktreePath(makeConfig(), '/repo')).toBe(false);
    expect(isSessionWorktreePath(makeConfig(), '/elsewhere/worktree')).toBe(false);
    expect(isSessionWorktreePath(makeConfig(), '/repo/.worktrees/nested/too-deep')).toBe(false);
  });
});
