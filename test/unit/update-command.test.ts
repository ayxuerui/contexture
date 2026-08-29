import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { execute as init } from '../../src/commands/init.js';
import { execute as update } from '../../src/commands/update.js';
import { readConfig } from '../../src/config/load.js';
import { ExitCode } from '../../src/core/exit-codes.js';
import { MANAGED_SKILL_HEADER } from '../../src/core/procedures.js';
import type { Store } from '../../src/core/store.js';
import { makeFakeEnv } from '../helpers/fake-env.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

const GIT_IDENTITY = {
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
};

async function freshStore(root: string): Promise<{ store: Store; env: ReturnType<typeof makeFakeEnv> }> {
  const env = makeFakeEnv({ cwd: root, env: GIT_IDENTITY });
  await init(env, { root, profile: 'para' });
  return { store: { root, config: await readConfig(root) }, env };
}

describe('ctxr update', () => {
  it('reports nothing changed on a store that is already current', async () => {
    const tmp = await makeTmpDir();
    try {
      const { store, env } = await freshStore(tmp.root);
      // init does not run the adapters, so the first update legitimately writes their outputs…
      const first = await update(env, store);
      expect(first.data?.changed?.sort()).toEqual(['.claude/settings.json', 'CLAUDE.md']);
      // …and only then is the store current.
      const outcome = await update(env, store);
      expect(outcome.exitCode).toBe(ExitCode.Ok);
      expect(outcome.data?.changed).toEqual([]);
    } finally {
      await tmp.cleanup();
    }
  });

  it('refreshes a drifted contexture-owned skill copy and a stale generated AGENTS.md section', async () => {
    const tmp = await makeTmpDir();
    try {
      const { store, env } = await freshStore(tmp.root);
      const skillPath = path.join(tmp.root, '.claude/skills/contexture-placement/SKILL.md');
      await writeFile(skillPath, 'stale copy from an older contexture\n');
      const agentsPath = path.join(tmp.root, 'AGENTS.md');
      await writeFile(agentsPath, (await readFile(agentsPath, 'utf8')).replaceAll('`ctxr ', '`contexture '));

      const outcome = await update(env, store);
      expect(outcome.data?.changed).toContain('.claude/skills/contexture-placement/SKILL.md');
      expect(outcome.data?.changed).toContain('AGENTS.md');
      expect(await readFile(skillPath, 'utf8')).toContain(MANAGED_SKILL_HEADER);
      const agents = await readFile(agentsPath, 'utf8');
      expect(agents).not.toContain('`contexture ');
      // The index is a disk scan: it must reflect the FRESH copy in the same run, not the stale one.
      expect(agents).toContain('[contexture-placement](.claude/skills/contexture-placement/SKILL.md) — Choose the right taxonomy layer');
      expect(await update(env, store)).toMatchObject({ data: { changed: [] } });
    } finally {
      await tmp.cleanup();
    }
  });

  it('never rewrites operator content: identity files and operator skills survive an update', async () => {
    const tmp = await makeTmpDir();
    try {
      const { store, env } = await freshStore(tmp.root);
      const posture = path.join(tmp.root, '.contexture/identity/posture.md');
      await writeFile(posture, 'my posture\n');
      await mkdir(path.join(tmp.root, '.claude/skills/mine'), { recursive: true });
      await writeFile(path.join(tmp.root, '.claude/skills/mine/SKILL.md'), '---\nname: mine\n---\nmine\n');

      await update(env, store);
      expect(await readFile(posture, 'utf8')).toBe('my posture\n');
      expect(await readFile(path.join(tmp.root, '.claude/skills/mine/SKILL.md'), 'utf8')).toBe('---\nname: mine\n---\nmine\n');
    } finally {
      await tmp.cleanup();
    }
  });
});
