import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { execute as init } from '../../src/commands/init.js';
import { execute as update } from '../../src/commands/update.js';
import { readConfig } from '../../src/config/load.js';
import { MANAGED_SKILL_HEADER, SKILLS } from '../../src/core/skills.js';
import type { Store } from '../../src/core/store.js';
import { makeFakeEnv } from '../helpers/fake-env.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

const GIT_IDENTITY = {
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
};

const SKILLS_ADDED_BY_THIS_RELEASE = [
  'ctxr-connection-proposal',
  'ctxr-rollup',
  'ctxr-session-lifecycle',
  'ctxr-session-capture',
  'ctxr-derived-artifacts',
  // session-submit-and-land:
  'ctxr-submit',
  'ctxr-land',
  // publish-artifact-skill:
  'ctxr-publish',
  // keep-the-installed-cli-current:
  'ctxr-upgrade',
  // ship-a-cross-model-second-opinion-skill:
  'ctxr-second-opinion',
  'ctxr-research',
];

/**
 * owned-skills-expansion and session-submit-and-land, harness-portability
 * scenario "Update delivers the expanded skill set to an existing store"
 * (task 2.3 / 3.2): a store seeded by an earlier release — missing skills,
 * the old placement text — receives every new and changed copy from one
 * `ctxr update`, and the next update is a no-op.
 */
describe('owned skills: delivered by init, expanded by update', () => {
  it('init writes all seventeen owned skills with the managed header', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = makeFakeEnv({ cwd: tmp.root, env: GIT_IDENTITY });
      await init(env, { root: tmp.root, profile: 'para' });
      expect(SKILLS).toHaveLength(17);
      for (const p of SKILLS) {
        const file = path.join(tmp.root, '.agents/skills', p.file, 'SKILL.md');
        expect(existsSync(file), p.file).toBe(true);
        expect(await readFile(file, 'utf8')).toContain(MANAGED_SKILL_HEADER);
      }
    } finally {
      await tmp.cleanup();
    }
  });

  it('update on a store seeded by the previous release reports every new and changed copy, then nothing', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = makeFakeEnv({ cwd: tmp.root, env: GIT_IDENTITY });
      await init(env, { root: tmp.root, profile: 'para' });
      const store: Store = { root: tmp.root, config: await readConfig(tmp.root) };
      await update(env, store); // adapters' first outputs — makes the store current

      // Rewind to the previous release's skill set: the five new ones absent,
      // placement at its old four-line text. AGENTS.md carries no skill
      // index (inline-conventions-and-mission removed it), so there is
      // nothing about AGENTS.md itself to rewind for this scenario.
      for (const slug of SKILLS_ADDED_BY_THIS_RELEASE) {
        await rm(path.join(tmp.root, '.agents/skills', slug), { recursive: true, force: true });
      }
      const placementPath = path.join(tmp.root, '.agents/skills/ctxr-placement/SKILL.md');
      await writeFile(
        placementPath,
        `---\nname: ctxr-placement\ndescription: Choose the right taxonomy layer for a new or relocated note in this contexture store.\n---\n\n${MANAGED_SKILL_HEADER}\n\n# Placement\n\n1. Read AGENTS.md.\n`,
      );

      const outcome = await update(env, store);
      const changed = outcome.data?.changed ?? [];
      for (const slug of SKILLS_ADDED_BY_THIS_RELEASE) expect(changed).toContain(`.agents/skills/${slug}/SKILL.md`);
      expect(changed).toContain('.agents/skills/ctxr-placement/SKILL.md');
      for (const slug of SKILLS_ADDED_BY_THIS_RELEASE) {
        expect(existsSync(path.join(tmp.root, '.agents/skills', slug, 'SKILL.md'))).toBe(true);
      }
      expect(await readFile(placementPath, 'utf8')).toContain('What must never enter the store?');

      expect((await update(env, store)).data?.changed).toEqual([]);
    } finally {
      await tmp.cleanup();
    }
  });

  /**
   * run-the-second-opinion-from-the-cli, harness-portability scenario "Update
   * delivers the skill with its runner": a store whose skill still carries the
   * earlier `run.mjs` and prompt fragments gets the one-file skill naming the
   * command, the old files are pruned as managed files the release no longer
   * ships, and a second update changes nothing.
   */
  it('update replaces the second-opinion runner beside the skill with the command, and prunes the old files', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = makeFakeEnv({ cwd: tmp.root, env: GIT_IDENTITY });
      await init(env, { root: tmp.root, profile: 'para' });
      const store: Store = { root: tmp.root, config: await readConfig(tmp.root) };
      await update(env, store);

      // Rewind to the previous release: the managed SKILL.md still pointed at run.mjs, with its fragments beside it.
      const dir = path.join(tmp.root, '.agents/skills/ctxr-second-opinion');
      const skillPath = path.join(dir, 'SKILL.md');
      const current = await readFile(skillPath, 'utf8');
      await writeFile(skillPath, current.replace('ctxr second-opinion preflight', 'node .agents/skills/ctxr-second-opinion/run.mjs --preflight'));
      const earlier = ['run.mjs', 'critic-contract.md', 'lenses.md', 'personas/architect.md', 'personas/pragmatist.md', 'personas/skeptic.md'];
      await mkdir(path.join(dir, 'personas'), { recursive: true });
      for (const rel of earlier) await writeFile(path.join(dir, rel), `earlier ${rel}\n`);

      const changed = (await update(env, store)).data?.changed ?? [];
      expect(changed).toContain('.agents/skills/ctxr-second-opinion/SKILL.md');
      for (const rel of earlier) {
        expect(changed).toContain(`.agents/skills/ctxr-second-opinion/${rel}`);
        expect(existsSync(path.join(dir, rel)), rel).toBe(false);
      }
      expect(existsSync(path.join(dir, 'personas'))).toBe(false);
      const skill = await readFile(skillPath, 'utf8');
      expect(skill).toContain(MANAGED_SKILL_HEADER);
      expect(skill).toContain('ctxr second-opinion preflight');
      expect(skill).not.toContain('run.mjs');

      expect((await update(env, store)).data?.changed).toEqual([]);
    } finally {
      await tmp.cleanup();
    }
  });
});
