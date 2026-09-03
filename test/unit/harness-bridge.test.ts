import { lstat, mkdir, readFile, readlink, realpath, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { bridgeHarnessSkills, isBridgeBroken } from '../../src/core/harness/bridge.js';

// fs.symlink failing while mkdir/cp on the same parent still succeed is a
// platform-specific condition (no symlink privilege on Windows, a
// filesystem/mount that disallows symlinks specifically) with no portable
// real-filesystem reproduction on Linux — denying write access to the parent
// directory blocks the copy fallback's own mkdir too, not just symlink. This
// module-level mock (wrapping the real implementation by default) is the one
// deviation in this suite from testing through the real filesystem.
vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
  return { ...actual, symlink: vi.fn(actual.symlink) };
});
import type { StoreConfig } from '../../src/config/schema.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

function makeConfig(overrides: Partial<StoreConfig> = {}): StoreConfig {
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
    ingest: { inbox_path: 'inbox/', tracking_params: [] },
    organize: { archive_destination: 'archive/', rollup_stale_days: 7 },
    harness: { skills_path: '.agents/skills/', guidance_path: 'guidance/' },
    adapters: [{ id: 'claude-code', kind: 'harness-generation' }],
    ...overrides,
  };
}

async function writeCanonicalSkill(root: string): Promise<void> {
  const dir = path.join(root, '.agents/skills/some-skill');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'SKILL.md'), '---\nname: some-skill\n---\nbody\n', 'utf8');
}

describe('bridgeHarnessSkills', () => {
  it('creates a directory symlink resolving to the canonical skills path', async () => {
    const tmp = await makeTmpDir();
    try {
      await writeCanonicalSkill(tmp.root);
      const config = makeConfig();

      const results = await bridgeHarnessSkills(tmp.root, config);
      expect(results).toEqual([{ harness: 'claude-code', path: '.claude/skills/', mode: 'symlink' }]);

      const harnessAbs = path.join(tmp.root, '.claude/skills');
      const stat = await lstat(harnessAbs);
      expect(stat.isSymbolicLink()).toBe(true);

      const canonicalReal = await realpath(path.join(tmp.root, '.agents/skills'));
      const harnessReal = await realpath(harnessAbs);
      expect(harnessReal).toBe(canonicalReal);

      const throughBridge = await readFile(path.join(harnessAbs, 'some-skill/SKILL.md'), 'utf8');
      expect(throughBridge).toContain('name: some-skill');
    } finally {
      await tmp.cleanup();
    }
  });

  it('is idempotent: a second run writes nothing and reports no changes', async () => {
    const tmp = await makeTmpDir();
    try {
      await writeCanonicalSkill(tmp.root);
      const config = makeConfig();
      await bridgeHarnessSkills(tmp.root, config);

      const second = await bridgeHarnessSkills(tmp.root, config);
      expect(second).toEqual([]);
    } finally {
      await tmp.cleanup();
    }
  });

  it('falls back to copying every skill when the platform refuses to create a symlink', async () => {
    const tmp = await makeTmpDir();
    try {
      await writeCanonicalSkill(tmp.root);
      const config = makeConfig();

      vi.mocked(symlink).mockRejectedValueOnce(Object.assign(new Error('EPERM'), { code: 'EPERM' }));

      const results = await bridgeHarnessSkills(tmp.root, config);
      expect(results).toEqual([{ harness: 'claude-code', path: '.claude/skills/', mode: 'copy' }]);

      const harnessAbs = path.join(tmp.root, '.claude/skills');
      const stat = await lstat(harnessAbs);
      expect(stat.isSymbolicLink()).toBe(false);
      expect(stat.isDirectory()).toBe(true);
      const copied = await readFile(path.join(harnessAbs, 'some-skill/SKILL.md'), 'utf8');
      expect(copied).toContain('name: some-skill');
    } finally {
      await tmp.cleanup();
    }
  });

  it('repairs a harness directory materialized as a regular file (a symlink-hostile checkout)', async () => {
    const tmp = await makeTmpDir();
    try {
      await writeCanonicalSkill(tmp.root);
      const config = makeConfig();

      await mkdir(path.join(tmp.root, '.claude'), { recursive: true });
      await writeFile(path.join(tmp.root, '.claude/skills'), '../.agents/skills', 'utf8'); // what a broken clone leaves behind

      expect(await isBridgeBroken(tmp.root, config.harness.skills_path, '.claude/skills/')).toBe(true);

      const results = await bridgeHarnessSkills(tmp.root, config);
      expect(results).toEqual([{ harness: 'claude-code', path: '.claude/skills/', mode: 'symlink' }]);

      const stat = await lstat(path.join(tmp.root, '.claude/skills'));
      expect(stat.isSymbolicLink()).toBe(true);
    } finally {
      await tmp.cleanup();
    }
  });

  it('repairs a symlink pointing at the wrong location', async () => {
    const tmp = await makeTmpDir();
    try {
      await writeCanonicalSkill(tmp.root);
      const config = makeConfig();

      const elsewhere = path.join(tmp.root, 'elsewhere');
      await mkdir(elsewhere, { recursive: true });
      await mkdir(path.join(tmp.root, '.claude'), { recursive: true });
      await symlink(elsewhere, path.join(tmp.root, '.claude/skills'), 'dir');

      expect(await isBridgeBroken(tmp.root, config.harness.skills_path, '.claude/skills/')).toBe(true);

      const results = await bridgeHarnessSkills(tmp.root, config);
      expect(results).toEqual([{ harness: 'claude-code', path: '.claude/skills/', mode: 'symlink' }]);

      const target = await readlink(path.join(tmp.root, '.claude/skills'));
      expect(path.resolve(path.join(tmp.root, '.claude'), target)).toBe(path.resolve(tmp.root, '.agents/skills'));
    } finally {
      await tmp.cleanup();
    }
  });

  it('creates no bridge when a harness declares no adapters', async () => {
    const tmp = await makeTmpDir();
    try {
      await writeCanonicalSkill(tmp.root);
      const config = makeConfig({ adapters: [] });

      const results = await bridgeHarnessSkills(tmp.root, config);
      expect(results).toEqual([]);
      await expect(lstat(path.join(tmp.root, '.claude/skills'))).rejects.toThrow();
    } finally {
      await tmp.cleanup();
    }
  });

  it('creates no bridge when a store overrides the harness directory to equal the canonical path', async () => {
    const tmp = await makeTmpDir();
    try {
      await writeCanonicalSkill(tmp.root);
      const config = makeConfig({
        adapters: [{ id: 'claude-code', kind: 'harness-generation', skills_dir: '.agents/skills/' }],
      });

      const results = await bridgeHarnessSkills(tmp.root, config);
      expect(results).toEqual([]);
    } finally {
      await tmp.cleanup();
    }
  });
});

describe('isBridgeBroken', () => {
  it('is false for a working symlink bridge and true before one exists', async () => {
    const tmp = await makeTmpDir();
    try {
      await writeCanonicalSkill(tmp.root);
      expect(await isBridgeBroken(tmp.root, '.agents/skills/', '.claude/skills/')).toBe(true);
      await bridgeHarnessSkills(tmp.root, makeConfig());
      expect(await isBridgeBroken(tmp.root, '.agents/skills/', '.claude/skills/')).toBe(false);
    } finally {
      await tmp.cleanup();
    }
  });
});
