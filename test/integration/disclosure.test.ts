import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hermeticGitEnv } from '../helpers/git-env.js';
import { runCli } from '../helpers/run-cli.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

async function writeNote(root: string, relPath: string, content: string): Promise<void> {
  const full = path.join(root, relPath);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content);
}

async function setDisclosureConfig(root: string, yamlBlock: string): Promise<void> {
  const configPath = path.join(root, 'contexture.yaml');
  const text = await readFile(configPath, 'utf8');
  const replaced = text.replace(/disclosure:\n(?:  .*\n?)*/, yamlBlock);
  await writeFile(configPath, replaced);
}

/** Task 5.5's literal verification. */
describe('contexture check / graph --as (real CLI)', () => {
  it('a hard wall returns the wall verdict even when an explicit tag would otherwise allow', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      await setDisclosureConfig(
        tmp.root,
        'disclosure:\n  internal_audiences: []\n  hard_walls:\n    - audience: external\n      note_path_prefix: secrets/\n      verdict: deny\n',
      );
      await writeNote(tmp.root, 'secrets/wall.md', '---\nlens: shared\naudience: [external]\n---\nSensitive.\n');

      const result = await runCli(['check', 'secrets/wall.md', '--audience', 'external', '--json'], {
        cwd: tmp.root,
        env,
      });
      expect(result.exitCode).toBe(4); // DisclosureDeny
      const data = JSON.parse(result.stdout).data;
      expect(data).toEqual({ path: 'secrets/wall.md', audience: 'external', verdict: 'deny', rung: 'hard_wall' });
    } finally {
      await tmp.cleanup();
    }
  });

  it('an untagged external audience returns ASK, not DENY or ALLOW, with its own exit code', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      await writeNote(tmp.root, 'projects/plain.md', '---\nlens: shared\n---\nNothing special.\n');

      const result = await runCli(['check', 'projects/plain.md', '--audience', 'external', '--json'], {
        cwd: tmp.root,
        env,
      });
      expect(result.exitCode).toBe(5); // DisclosureAsk
      expect(result.exitCode).not.toBe(0);
      expect(result.exitCode).not.toBe(4);
      const data = JSON.parse(result.stdout).data;
      expect(data.verdict).toBe('ask');
      expect(data.rung).toBe('external_default');
    } finally {
      await tmp.cleanup();
    }
  });

  it('an explicit tag allows, distinctly from ASK and DENY, when no wall applies', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      await writeNote(tmp.root, 'projects/tagged.md', '---\nlens: shared\naudience: [external]\n---\nShareable.\n');

      const result = await runCli(['check', 'projects/tagged.md', '--audience', 'external', '--json'], {
        cwd: tmp.root,
        env,
      });
      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout).data.verdict).toBe('allow');
    } finally {
      await tmp.cleanup();
    }
  });

  it('graph neighbors --as ctx-a omits a one-hop neighbor whose resolved visibility ctx-a cannot see', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      await writeNote(tmp.root, 'projects/a.md', '---\nlens: ctx-a\n---\nLinks to [[b]].\n');
      await writeNote(tmp.root, 'projects/b.md', '---\nlens: ctx-b\n---\nNot visible to ctx-a.\n');
      await runCli(['graph', 'build'], { cwd: tmp.root, env });

      const unfiltered = await runCli(['graph', 'query', 'neighbors', 'projects/a.md', '--json'], {
        cwd: tmp.root,
        env,
      });
      expect(JSON.parse(unfiltered.stdout).data.neighbors).toEqual(['projects/b.md']);

      const filtered = await runCli(['graph', 'query', 'neighbors', 'projects/a.md', '--as', 'ctx-a', '--json'], {
        cwd: tmp.root,
        env,
      });
      expect(filtered.exitCode).toBe(0);
      expect(JSON.parse(filtered.stdout).data.neighbors).toEqual([]);
    } finally {
      await tmp.cleanup();
    }
  });

  it('doctor fails on a note relying on the fail-closed default (task 5.2)', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      await writeNote(tmp.root, 'projects/untagged.md', 'No frontmatter at all.\n');

      const result = await runCli(['doctor', '--json'], { cwd: tmp.root, env });
      expect(result.exitCode).not.toBe(0);
      const data = JSON.parse(result.stdout).data;
      expect(
        data.checks.some(
          (c: { id: string; result: string }) => c.id === 'visibility.fail_closed_default_invariant' && c.result === 'fail',
        ),
      ).toBe(true);
    } finally {
      await tmp.cleanup();
    }
  });
});

/** visibility-contexts-and-wall-verdicts task 3.2. */
describe('context mapping and richer walls (real CLI)', () => {
  async function setVisibilityContexts(root: string, yamlBlock: string): Promise<void> {
    const configPath = path.join(root, 'contexture.yaml');
    const text = await readFile(configPath, 'utf8');
    // Replace the rendered empty mapping with the test's mapping.
    await writeFile(configPath, text.replace('  contexts: {}\n', yamlBlock));
  }

  it('a shared visibility value appears under graph query --as for BOTH mapped contexts, and an unmapped value stays hidden', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      await setVisibilityContexts(
        tmp.root,
        '  contexts:\n    ctx-a: [ctx-a, ctx-shared]\n    ctx-b: [ctx-b, ctx-shared]\n',
      );
      await writeNote(tmp.root, 'projects/a.md', '---\nlens: ctx-a\n---\nLinks to [[shared]] and [[b]].\n');
      await writeNote(tmp.root, 'projects/shared.md', '---\nlens: ctx-shared\n---\nShared note.\n');
      await writeNote(tmp.root, 'projects/b.md', '---\nlens: ctx-b\n---\nOther context.\n');
      await runCli(['graph', 'build'], { cwd: tmp.root, env });

      const asA = await runCli(['graph', 'query', 'neighbors', 'projects/a.md', '--as', 'ctx-a', '--json'], {
        cwd: tmp.root,
        env,
      });
      expect(asA.exitCode).toBe(0);
      expect(JSON.parse(asA.stdout).data.neighbors).toEqual(['projects/shared.md']); // shared visible, ctx-b hidden

      const orphansAsB = await runCli(['graph', 'query', 'orphans', '--as', 'ctx-b', '--json'], { cwd: tmp.root, env });
      const orphans = JSON.parse(orphansAsB.stdout).data.orphans;
      expect(orphans).toContain('projects/shared.md'); // visible to ctx-b too (orphaned since a.md is filtered out)
      expect(orphans).not.toContain('projects/a.md');
    } finally {
      await tmp.cleanup();
    }
  });

  it('a wildcard ASK wall returns exit 5 for a non-exempt audience and falls through for the exempted one', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      await setDisclosureConfig(
        tmp.root,
        'disclosure:\n  internal_audiences: []\n  hard_walls:\n    - audience: "*"\n      note_path_prefix: walled/\n      except: [ctx-a]\n      verdict: ask\n',
      );
      await writeNote(tmp.root, 'walled/n.md', '---\nlens: shared\naudience: [ctx-a, ctx-b]\n---\nWalled.\n');

      const nonExempt = await runCli(['check', 'walled/n.md', '--audience', 'ctx-b', '--json'], { cwd: tmp.root, env });
      expect(nonExempt.exitCode).toBe(5);
      expect(JSON.parse(nonExempt.stdout).data).toEqual({
        path: 'walled/n.md',
        audience: 'ctx-b',
        verdict: 'ask',
        rung: 'hard_wall',
      });

      const exempt = await runCli(['check', 'walled/n.md', '--audience', 'ctx-a', '--json'], { cwd: tmp.root, env });
      expect(exempt.exitCode).toBe(0);
      expect(JSON.parse(exempt.stdout).data.rung).toBe('explicit_tag');
    } finally {
      await tmp.cleanup();
    }
  });
});
