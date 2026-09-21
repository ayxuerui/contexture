import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeTmpDir } from '../helpers/tmp-store.js';
import type { StoreConfig } from '../../src/config/schema.js';
import {
  findSessionWorktreeByLabel,
  generateSessionBranchName,
  sessionLabelFromDirName,
  sessionLabelSlug,
  isSessionBranch,
  isSessionWorktreePath,
  listSessionWorktreeDirs,
  worktreeDirNameFor,
  worktreePathFor,
} from '../../src/core/session.js';

import { SHIPPED_DEFAULTS } from '../../src/config/defaults.js';
function makeConfig(overrides: Partial<StoreConfig['session']> = {}): StoreConfig {
  return {
    schema_version: 1,
    taxonomy: { profile: 'para', layers: [] },
    derived: { paths: [] },
    retrieval: { exclude_paths: [], demote_paths: [], gather_max_notes: 50, graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } },
    git: { default_branch: 'main' },
    session: { branch_prefix: 'session/', worktrees_path: '.worktrees/', ...overrides },
    write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] },
    catalog: { path: 'catalog/', section_max_bytes: 32768 },
    publish: { path: 'publish/' },
    templates: { path: '.contexture/templates/', installed: [] },
    skills: { vendored: [] },
    update_check: SHIPPED_DEFAULTS.update_check,
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

  it('a label takes the random suffix place, behind the stamp', () => {
    const name = generateSessionBranchName(makeConfig(), new Date('2026-01-01T00:00:00Z'), 'ctx-a');
    expect(name).toBe('session/20260101-000000-ctx-a');
  });

  it('a label respects a custom prefix', () => {
    const name = generateSessionBranchName(makeConfig({ branch_prefix: 'agent/' }), new Date('2026-01-01T00:00:00Z'), 'ctx-a');
    expect(name).toBe('agent/20260101-000000-ctx-a');
  });

  it('labelled names stay sortable by creation time', () => {
    const earlier = generateSessionBranchName(makeConfig(), new Date('2026-01-01T00:00:00Z'), 'work');
    const later = generateSessionBranchName(makeConfig(), new Date('2026-06-01T00:00:00Z'), 'ctx-a');
    expect(earlier < later).toBe(true);
  });

  it('an empty label falls back to the random suffix', () => {
    const a = generateSessionBranchName(makeConfig(), new Date('2026-01-01T00:00:00Z'), '');
    const b = generateSessionBranchName(makeConfig(), new Date('2026-01-01T00:00:00Z'), '');
    expect(a).not.toBe(b);
  });

  it('the same label at the same instant produces the same name, which the command refuses (D4)', () => {
    const at = new Date('2026-01-01T00:00:00Z');
    expect(generateSessionBranchName(makeConfig(), at, 'ctx-a')).toBe(generateSessionBranchName(makeConfig(), at, 'ctx-a'));
  });
});

describe('sessionLabelSlug', () => {
  it('normalizes with the publish slug rule', () => {
    expect(sessionLabelSlug('Ctx A')).toBe('ctx-a');
    expect(sessionLabelSlug('  Ctx A — B ')).toBe('ctx-a-b');
  });

  it('is empty when nothing survives normalization', () => {
    expect(sessionLabelSlug('...')).toBe('');
    expect(sessionLabelSlug('   ')).toBe('');
  });

  it('truncates a long label on a word boundary, with no trailing separator', () => {
    const slug = sessionLabelSlug('ctx a director of engineering quality and research and more');
    expect(slug.length).toBeLessThanOrEqual(48);
    expect(slug).toBe('ctx-a-director-of-engineering-quality-and');
    expect(slug.endsWith('-')).toBe(false);
  });

  it('cuts a single over-long word at the cap, since it has no boundary', () => {
    expect(sessionLabelSlug('a'.repeat(60))).toBe('a'.repeat(48));
  });

  it('leaves a label at the cap untouched', () => {
    const exact = 'a'.repeat(48);
    expect(sessionLabelSlug(exact)).toBe(exact);
  });
});

describe('sessionLabelFromDirName', () => {
  it('recovers a label from a composed directory name', () => {
    expect(sessionLabelFromDirName(makeConfig(), 'session-20260101-000000-ctx-a')).toBe('ctx-a');
  });

  it('reports an unlabelled session as carrying no label', () => {
    expect(sessionLabelFromDirName(makeConfig(), 'session-20260101-000000-a1b2c3')).toBeNull();
  });

  it('does not read a longer label as a shorter one', () => {
    expect(sessionLabelFromDirName(makeConfig(), 'session-20260101-000000-ctx-a')).not.toBe('a');
  });

  it('follows the configured prefix, and ignores a directory that is not a session', () => {
    expect(sessionLabelFromDirName(makeConfig({ branch_prefix: 'agent/' }), 'agent-20260101-000000-work')).toBe('work');
    expect(sessionLabelFromDirName(makeConfig(), 'session-20260101-000000-ctx-a')).toBe('ctx-a');
    expect(sessionLabelFromDirName(makeConfig(), 'not-a-session')).toBeNull();
  });
});

describe('findSessionWorktreeByLabel', () => {
  it('finds the worktree carrying a label, and distinguishes a shorter one', async () => {
    const tmp = await makeTmpDir();
    try {
      const config = makeConfig();
      await mkdir(path.join(tmp.root, '.worktrees', 'session-20260101-000000-ctx-a'), { recursive: true });
      const found = await findSessionWorktreeByLabel(tmp.root, config, 'ctx-a');
      expect(found).toBe(path.join(tmp.root, '.worktrees', 'session-20260101-000000-ctx-a'));
      expect(await findSessionWorktreeByLabel(tmp.root, config, 'a')).toBeNull();
      expect(await findSessionWorktreeByLabel(tmp.root, config, 'ctx-b')).toBeNull();
    } finally {
      await tmp.cleanup();
    }
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

describe('listSessionWorktreeDirs', () => {
  it('returns the directory names under the configured worktrees path', async () => {
    const tmp = await makeTmpDir();
    try {
      await mkdir(path.join(tmp.root, '.worktrees', 'session-b'), { recursive: true });
      await mkdir(path.join(tmp.root, '.worktrees', 'session-a'), { recursive: true });

      expect(await listSessionWorktreeDirs(tmp.root, makeConfig())).toEqual(['session-a', 'session-b']);
    } finally {
      await tmp.cleanup();
    }
  });

  it('skips a stray file under the worktrees path', async () => {
    const tmp = await makeTmpDir();
    try {
      await mkdir(path.join(tmp.root, '.worktrees', 'session-a'), { recursive: true });
      await writeFile(path.join(tmp.root, '.worktrees', 'README'), 'not a worktree\n');

      expect(await listSessionWorktreeDirs(tmp.root, makeConfig())).toEqual(['session-a']);
    } finally {
      await tmp.cleanup();
    }
  });

  it('returns nothing when the worktrees path does not exist', async () => {
    const tmp = await makeTmpDir();
    try {
      expect(await listSessionWorktreeDirs(tmp.root, makeConfig())).toEqual([]);
    } finally {
      await tmp.cleanup();
    }
  });

  it('honours a worktrees path other than the shipped default', async () => {
    const tmp = await makeTmpDir();
    try {
      await mkdir(path.join(tmp.root, 'trees', 'session-a'), { recursive: true });
      await mkdir(path.join(tmp.root, '.worktrees', 'session-ignored'), { recursive: true });

      const config = makeConfig({ worktrees_path: 'trees/' });
      expect(await listSessionWorktreeDirs(tmp.root, config)).toEqual(['session-a']);
    } finally {
      await tmp.cleanup();
    }
  });
});
