import { describe, expect, it } from 'vitest';
import type { StoreConfig } from '../../src/config/schema.js';
import {
  generateSessionBranchName,
  isSessionBranch,
  worktreeDirNameFor,
  worktreePathFor,
} from '../../src/core/session.js';

function makeConfig(overrides: Partial<StoreConfig['session']> = {}): StoreConfig {
  return {
    schema_version: 1,
    taxonomy: { profile: 'para', layers: [] },
    fields: { visibility: 'scope' },
    visibility: { default_context: 'private', directory_defaults: {} },
    derived: { paths: [] },
    retrieval: { exclude_paths: [] },
    git: { default_branch: 'main' },
    session: { branch_prefix: 'session/', worktrees_path: '.worktrees/', ...overrides },
    write_lifecycle: { diff_size_ceiling_lines: 2000 },
    catalog: { path: 'catalog/', section_max_bytes: 32768 },
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
