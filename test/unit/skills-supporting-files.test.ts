import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { StoreConfig } from '../../src/config/schema.js';
import { MANAGED_SKILL_HEADER, syncSkillSeeds, type SkillSeed } from '../../src/core/skills.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

/**
 * ship-a-cross-model-second-opinion-skill, harness-portability requirement
 * "Owned skills may carry supporting files": one scenario per test. The
 * production seed list is not used here — a fixture seed lets a file be
 * "dropped from the package" without editing templates/.
 */
// The sync reads only `harness.skills_path`, and the fixture body ignores the config.
const config = { harness: { skills_path: 'skills/' } } as unknown as StoreConfig;
const SKILLS_DIR = config.harness.skills_path;

function seed(files: Record<string, string> | undefined): SkillSeed {
  return {
    file: 'ctxr-fixture',
    name: 'Fixture',
    description: 'A fixture skill that carries supporting files.',
    body: () => ['Body.'],
    ...(files ? { supportingFiles: () => new Map(Object.entries(files)) } : {}),
  };
}

const PACKAGE_V1 = { 'run.mjs': 'export {};\n', 'personas/a.md': 'persona a\n', 'personas/b.md': 'persona b\n' };

describe('owned skills may carry supporting files', () => {
  it('delivers SKILL.md with the managed header and each supporting file byte-identical', async () => {
    const tmp = await makeTmpDir();
    try {
      const changed = await syncSkillSeeds(tmp.root, config, [seed(PACKAGE_V1)]);
      const dir = path.join(tmp.root, SKILLS_DIR, 'ctxr-fixture');
      expect(await readFile(path.join(dir, 'SKILL.md'), 'utf8')).toContain(MANAGED_SKILL_HEADER);
      for (const [rel, content] of Object.entries(PACKAGE_V1)) expect(await readFile(path.join(dir, rel), 'utf8')).toBe(content);
      expect([...changed].sort()).toEqual(
        ['SKILL.md', ...Object.keys(PACKAGE_V1)].map((rel) => `${SKILLS_DIR}ctxr-fixture/${rel}`).sort(),
      );
    } finally {
      await tmp.cleanup();
    }
  });

  it('a second sync writes nothing', async () => {
    const tmp = await makeTmpDir();
    try {
      await syncSkillSeeds(tmp.root, config, [seed(PACKAGE_V1)]);
      expect(await syncSkillSeeds(tmp.root, config, [seed(PACKAGE_V1)])).toEqual([]);
    } finally {
      await tmp.cleanup();
    }
  });

  it('rewrites a supporting file that drifted, and only that one', async () => {
    const tmp = await makeTmpDir();
    try {
      await syncSkillSeeds(tmp.root, config, [seed(PACKAGE_V1)]);
      await writeFile(path.join(tmp.root, SKILLS_DIR, 'ctxr-fixture/run.mjs'), 'tampered\n');
      expect(await syncSkillSeeds(tmp.root, config, [seed(PACKAGE_V1)])).toEqual([`${SKILLS_DIR}ctxr-fixture/run.mjs`]);
      expect(await readFile(path.join(tmp.root, SKILLS_DIR, 'ctxr-fixture/run.mjs'), 'utf8')).toBe(PACKAGE_V1['run.mjs']);
    } finally {
      await tmp.cleanup();
    }
  });

  it('removes a supporting file the package dropped, and the directory it leaves empty', async () => {
    const tmp = await makeTmpDir();
    try {
      await syncSkillSeeds(tmp.root, config, [seed(PACKAGE_V1)]);
      const v2 = { 'run.mjs': PACKAGE_V1['run.mjs'] };
      const changed = await syncSkillSeeds(tmp.root, config, [seed(v2)]);
      expect([...changed].sort()).toEqual([`${SKILLS_DIR}ctxr-fixture/personas/a.md`, `${SKILLS_DIR}ctxr-fixture/personas/b.md`]);
      const dir = path.join(tmp.root, SKILLS_DIR, 'ctxr-fixture');
      expect(existsSync(path.join(dir, 'personas'))).toBe(false);
      expect(existsSync(path.join(dir, 'run.mjs'))).toBe(true);
      expect(await syncSkillSeeds(tmp.root, config, [seed(v2)])).toEqual([]);
    } finally {
      await tmp.cleanup();
    }
  });

  it('removes a file the package never shipped and names its path', async () => {
    const tmp = await makeTmpDir();
    try {
      await syncSkillSeeds(tmp.root, config, [seed(PACKAGE_V1)]);
      await writeFile(path.join(tmp.root, SKILLS_DIR, 'ctxr-fixture/notes.txt'), 'added by hand\n');
      expect(await syncSkillSeeds(tmp.root, config, [seed(PACKAGE_V1)])).toEqual([`${SKILLS_DIR}ctxr-fixture/notes.txt`]);
      expect(existsSync(path.join(tmp.root, SKILLS_DIR, 'ctxr-fixture/notes.txt'))).toBe(false);
    } finally {
      await tmp.cleanup();
    }
  });

  it('a skill that ships only SKILL.md still prunes stray files from its managed directory', async () => {
    const tmp = await makeTmpDir();
    try {
      await syncSkillSeeds(tmp.root, config, [seed(undefined)]);
      await writeFile(path.join(tmp.root, SKILLS_DIR, 'ctxr-fixture/stray.md'), 'x\n');
      expect(await syncSkillSeeds(tmp.root, config, [seed(undefined)])).toEqual([`${SKILLS_DIR}ctxr-fixture/stray.md`]);
    } finally {
      await tmp.cleanup();
    }
  });

  it('never touches a directory whose SKILL.md carries no managed header', async () => {
    const tmp = await makeTmpDir();
    try {
      const dir = path.join(tmp.root, SKILLS_DIR, 'operator-skill');
      await mkdir(path.join(dir, 'sub'), { recursive: true });
      await writeFile(path.join(dir, 'SKILL.md'), '---\nname: operator-skill\n---\nmine\n');
      await writeFile(path.join(dir, 'sub/anything.txt'), 'keep\n');
      await writeFile(path.join(dir, 'run.mjs'), 'keep\n');
      const changed = await syncSkillSeeds(tmp.root, config, [seed(PACKAGE_V1)]);
      expect(changed.some((p) => p.includes('operator-skill'))).toBe(false);
      expect(await readFile(path.join(dir, 'sub/anything.txt'), 'utf8')).toBe('keep\n');
      expect(await readFile(path.join(dir, 'run.mjs'), 'utf8')).toBe('keep\n');
    } finally {
      await tmp.cleanup();
    }
  });

  it('a same-slug directory that arrives without the header is not pruned', async () => {
    const tmp = await makeTmpDir();
    try {
      const dir = path.join(tmp.root, SKILLS_DIR, 'ctxr-fixture');
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, 'SKILL.md'), '---\nname: ctxr-fixture\n---\noperator text\n');
      await writeFile(path.join(dir, 'keep.txt'), 'keep\n');
      await syncSkillSeeds(tmp.root, config, [seed(PACKAGE_V1)]);
      expect(await readFile(path.join(dir, 'keep.txt'), 'utf8')).toBe('keep\n');
    } finally {
      await tmp.cleanup();
    }
  });

  it('removing the whole skill removes its directory with every supporting file in it', async () => {
    const tmp = await makeTmpDir();
    try {
      await syncSkillSeeds(tmp.root, config, [seed(PACKAGE_V1)]);
      await syncSkillSeeds(tmp.root, config, []);
      expect(existsSync(path.join(tmp.root, SKILLS_DIR, 'ctxr-fixture'))).toBe(false);
    } finally {
      await tmp.cleanup();
    }
  });
});
