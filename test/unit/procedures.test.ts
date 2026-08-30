import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { StoreConfig } from '../../src/config/schema.js';
import { MANAGED_SKILL_HEADER, procedurePaths, PROCEDURES, syncShippedSkills } from '../../src/core/procedures.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

function makeConfig(): StoreConfig {
  return {
    schema_version: 1,
    taxonomy: { profile: 'para', layers: [] },
    fields: { visibility: 'scope' },
    visibility: { default_context: 'private', directory_defaults: {}, contexts: {} },
    derived: { paths: [] },
    retrieval: { exclude_paths: ['procedures/'] },
    git: { default_branch: 'main' },
    session: { branch_prefix: 'session/', worktrees_path: '.worktrees/' },
    write_lifecycle: { diff_size_ceiling_lines: 2000 },
    catalog: { path: 'catalog/', section_max_bytes: 32768 },
    disclosure: { internal_audiences: [], hard_walls: [] },
    ingest: { inbox_path: 'inbox/' },
    organize: { archive_path: 'archive/' },
    identity: { path: 'identity/' },
    harness: { procedures_path: 'procedures/', conventions_path: 'conventions/' },
    adapters: [],
  };
}

describe('PROCEDURES', () => {
  it('names the four judgment-side operations from the task list', () => {
    expect(PROCEDURES.map((p) => p.name)).toEqual([
      'Ingest orchestration',
      'Placement',
      'Connection finding',
      'Organize audit',
    ]);
  });
});

describe('syncShippedSkills', () => {
  it('writes every ctxr-owned skill as <slug>/SKILL.md with name/description frontmatter and the managed header', async () => {
    const tmp = await makeTmpDir();
    try {
      const written = await syncShippedSkills(tmp.root, makeConfig());
      expect(written.sort()).toEqual(procedurePaths(makeConfig()).sort());
      const placement = await readFile(path.join(tmp.root, 'procedures/ctxr-placement/SKILL.md'), 'utf8');
      expect(placement).toContain('name: ctxr-placement');
      expect(placement).toContain('description:');
      expect(placement).toContain(MANAGED_SKILL_HEADER);
    } finally {
      await tmp.cleanup();
    }
  });

  it('is byte-stable: a second sync writes nothing', async () => {
    const tmp = await makeTmpDir();
    try {
      await syncShippedSkills(tmp.root, makeConfig());
      expect(await syncShippedSkills(tmp.root, makeConfig())).toEqual([]);
    } finally {
      await tmp.cleanup();
    }
  });

  it('OVERWRITES a drifted ctxr-owned copy (they are owned by contexture, refreshed by update)', async () => {
    const tmp = await makeTmpDir();
    try {
      await syncShippedSkills(tmp.root, makeConfig());
      const skillPath = path.join(tmp.root, 'procedures/ctxr-placement/SKILL.md');
      const { writeFile } = await import('node:fs/promises');
      await writeFile(skillPath, 'hand-edited\n');

      const written = await syncShippedSkills(tmp.root, makeConfig());
      expect(written).toEqual(['procedures/ctxr-placement/SKILL.md']);
      expect(await readFile(skillPath, 'utf8')).not.toBe('hand-edited\n');
    } finally {
      await tmp.cleanup();
    }
  });

  it('never touches an operator-authored skill alongside', async () => {
    const tmp = await makeTmpDir();
    try {
      const { mkdir, writeFile } = await import('node:fs/promises');
      await mkdir(path.join(tmp.root, 'procedures/my-skill'), { recursive: true });
      await writeFile(path.join(tmp.root, 'procedures/my-skill/SKILL.md'), '---\nname: my-skill\n---\nmine\n');

      await syncShippedSkills(tmp.root, makeConfig());
      expect(await readFile(path.join(tmp.root, 'procedures/my-skill/SKILL.md'), 'utf8')).toBe('---\nname: my-skill\n---\nmine\n');
    } finally {
      await tmp.cleanup();
    }
  });
});

describe('syncShippedSkills removes managed copies the installed version no longer ships', () => {
  it('removes a stale contexture-owned directory (managed header) but never an operator skill', async () => {
    const tmp = await makeTmpDir();
    try {
      const { mkdir, writeFile } = await import('node:fs/promises');
      const { existsSync } = await import('node:fs');
      await mkdir(path.join(tmp.root, 'procedures/ctxr-old-slug'), { recursive: true });
      await writeFile(
        path.join(tmp.root, 'procedures/ctxr-old-slug/SKILL.md'),
        `---\nname: ctxr-old-slug\n---\n\n${MANAGED_SKILL_HEADER}\n\n# Old\n`,
      );
      await mkdir(path.join(tmp.root, 'procedures/mine'), { recursive: true });
      await writeFile(path.join(tmp.root, 'procedures/mine/SKILL.md'), '---\nname: mine\n---\nmine\n');

      const changed = await syncShippedSkills(tmp.root, makeConfig());
      expect(changed).toContain('procedures/ctxr-old-slug/SKILL.md');
      expect(existsSync(path.join(tmp.root, 'procedures/ctxr-old-slug'))).toBe(false);
      expect(existsSync(path.join(tmp.root, 'procedures/mine/SKILL.md'))).toBe(true);
    } finally {
      await tmp.cleanup();
    }
  });
});
