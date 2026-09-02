import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { execute as init } from '../../src/commands/init.js';
import { execute as update } from '../../src/commands/update.js';
import { readConfig } from '../../src/config/load.js';
import { ExitCode } from '../../src/core/exit-codes.js';
import { MANAGED_SKILL_HEADER } from '../../src/core/skills.js';
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

  it('refreshes a drifted ctxr-owned skill copy and a stale generated AGENTS.md section', async () => {
    const tmp = await makeTmpDir();
    try {
      const { store, env } = await freshStore(tmp.root);
      const skillPath = path.join(tmp.root, '.agents/skills/ctxr-placement/SKILL.md');
      await writeFile(skillPath, 'stale copy from an older contexture\n');
      const agentsPath = path.join(tmp.root, 'AGENTS.md');
      await writeFile(agentsPath, (await readFile(agentsPath, 'utf8')).replaceAll('`ctxr ', '`contexture '));

      const outcome = await update(env, store);
      expect(outcome.data?.changed).toContain('.agents/skills/ctxr-placement/SKILL.md');
      expect(outcome.data?.changed).toContain('AGENTS.md');
      expect(await readFile(skillPath, 'utf8')).toContain(MANAGED_SKILL_HEADER);
      const agents = await readFile(agentsPath, 'utf8');
      expect(agents).not.toContain('`contexture ');
      expect(agents).toContain('`ctxr session start`');
      expect(await update(env, store)).toMatchObject({ data: { changed: [] } });
    } finally {
      await tmp.cleanup();
    }
  });

  it('removes a pre-existing store\'s orphaned "agent identity" AGENTS.md section (retired by remove-agent-identity)', async () => {
    const tmp = await makeTmpDir();
    try {
      const { store, env } = await freshStore(tmp.root);
      const agentsPath = path.join(tmp.root, 'AGENTS.md');
      const before = await readFile(agentsPath, 'utf8');
      const orphanedFence = [
        '',
        '<!-- >>> contexture:agent-identity (managed — do not edit) >>> -->',
        '## Agent identity',
        '',
        'Load at session start: `.contexture/identity/posture.md`.',
        '<!-- <<< contexture:agent-identity <<< -->',
      ].join('\n');
      await writeFile(agentsPath, `${before.replace(/\n$/, '')}${orphanedFence}\n`);

      const outcome = await update(env, store);
      expect(outcome.data?.changed).toContain('AGENTS.md');
      const after = await readFile(agentsPath, 'utf8');
      expect(after).not.toContain('agent-identity');
      expect(after).not.toContain('Agent identity');
      expect(after).toBe(before);
      // Idempotent: a store with no orphaned fence left to remove reports no further AGENTS.md change from this step.
      expect(await update(env, store)).toMatchObject({ data: { changed: [] } });
    } finally {
      await tmp.cleanup();
    }
  });

  it('never rewrites operator content: an operator skill survives an update', async () => {
    const tmp = await makeTmpDir();
    try {
      const { store, env } = await freshStore(tmp.root);
      await mkdir(path.join(tmp.root, '.agents/skills/mine'), { recursive: true });
      await writeFile(path.join(tmp.root, '.agents/skills/mine/SKILL.md'), '---\nname: mine\n---\nmine\n');

      await update(env, store);
      expect(await readFile(path.join(tmp.root, '.agents/skills/mine/SKILL.md'), 'utf8')).toBe('---\nname: mine\n---\nmine\n');
    } finally {
      await tmp.cleanup();
    }
  });
});
