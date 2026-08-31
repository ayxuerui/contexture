import { existsSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { execute as init } from '../../src/commands/init.js';
import { execute as update } from '../../src/commands/update.js';
import { readConfig } from '../../src/config/load.js';
import { MANAGED_SKILL_HEADER, PROCEDURES } from '../../src/core/procedures.js';
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
];

/**
 * owned-skills-expansion and session-submit-and-land, harness-portability
 * scenario "Update delivers the expanded skill set to an existing store"
 * (task 2.3 / 3.2): a store seeded by an earlier release — missing skills,
 * the old placement text — receives every new and changed copy from one
 * `ctxr update`, and the next update is a no-op.
 */
describe('owned skills: delivered by init, expanded by update', () => {
  it('init writes all twelve owned skills with the managed header', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = makeFakeEnv({ cwd: tmp.root, env: GIT_IDENTITY });
      await init(env, { root: tmp.root, profile: 'para' });
      expect(PROCEDURES).toHaveLength(12);
      for (const p of PROCEDURES) {
        const file = path.join(tmp.root, '.claude/skills', p.file, 'SKILL.md');
        expect(existsSync(file), p.file).toBe(true);
        expect(await readFile(file, 'utf8')).toContain(MANAGED_SKILL_HEADER);
      }
      const agents = await readFile(path.join(tmp.root, 'AGENTS.md'), 'utf8');
      for (const p of PROCEDURES) expect(agents).toContain(`[${p.file}](.claude/skills/${p.file}/SKILL.md)`);
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

      // Rewind to the previous release's skill set: the five new ones absent, placement at its old four-line text.
      for (const slug of SKILLS_ADDED_BY_THIS_RELEASE) {
        await rm(path.join(tmp.root, '.claude/skills', slug), { recursive: true, force: true });
      }
      const agentsPath = path.join(tmp.root, 'AGENTS.md');
      await writeFile(
        agentsPath,
        (await readFile(agentsPath, 'utf8'))
          .split('\n')
          .filter((line) => !SKILLS_ADDED_BY_THIS_RELEASE.some((slug) => line.includes(`[${slug}]`)))
          .join('\n'),
      );
      const placementPath = path.join(tmp.root, '.claude/skills/ctxr-placement/SKILL.md');
      await writeFile(
        placementPath,
        `---\nname: ctxr-placement\ndescription: Choose the right taxonomy layer for a new or relocated note in this contexture store.\n---\n\n${MANAGED_SKILL_HEADER}\n\n# Placement\n\n1. Read AGENTS.md.\n`,
      );

      const outcome = await update(env, store);
      const changed = outcome.data?.changed ?? [];
      for (const slug of SKILLS_ADDED_BY_THIS_RELEASE) expect(changed).toContain(`.claude/skills/${slug}/SKILL.md`);
      expect(changed).toContain('.claude/skills/ctxr-placement/SKILL.md');
      expect(changed).toContain('AGENTS.md'); // the procedure index grew
      const agents = await readFile(agentsPath, 'utf8');
      for (const slug of SKILLS_ADDED_BY_THIS_RELEASE) expect(agents).toContain(`[${slug}](.claude/skills/${slug}/SKILL.md)`);
      expect(await readFile(placementPath, 'utf8')).toContain('The collision test');

      expect((await update(env, store)).data?.changed).toEqual([]);
    } finally {
      await tmp.cleanup();
    }
  });
});
