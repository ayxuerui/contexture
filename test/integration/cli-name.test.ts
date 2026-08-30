import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hermeticGitEnv } from '../helpers/git-env.js';
import { runCli } from '../helpers/run-cli.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

/** Any instruction to run the CLI under its pre-rename executable name. */
const STALE_INVOCATION =
  /contexture (init|doctor|check|adapters|archive|catalog|graph|ingest|lint|migrate|note|rollup|session|source|verify|search)\b/;

/** cli-contract (cli-distribution-identity): every shipped instruction to run a command names `ctxr`. */
describe('cli-contract: shipped instructions name ctxr (real CLI)', () => {
  it('a freshly initialized store carries no stale invocation', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      expect((await runCli(['init'], { cwd: tmp.root, env })).exitCode).toBe(0);
      expect((await runCli(['adapters', 'generate'], { cwd: tmp.root, env })).exitCode).toBe(0);

      const surfaces = new Map<string, string>();
      surfaces.set('AGENTS.md', await readFile(path.join(tmp.root, 'AGENTS.md'), 'utf8'));
      for (const hook of ['pre-commit', 'pre-push']) {
        surfaces.set(`.githooks/${hook}`, await readFile(path.join(tmp.root, '.githooks', hook), 'utf8'));
      }
      const skillsDir = path.join(tmp.root, '.claude', 'skills');
      for (const dir of await readdir(skillsDir)) {
        surfaces.set(`skills/${dir}`, await readFile(path.join(skillsDir, dir, 'SKILL.md'), 'utf8'));
      }

      // Sanity: we actually gathered every kind of surface the spec names.
      expect([...surfaces.keys()].some((k) => k.startsWith('skills/'))).toBe(true);

      for (const [name, content] of surfaces) {
        expect(content, `${name} still instructs the reader to run contexture <command>`).not.toMatch(STALE_INVOCATION);
      }
      expect(surfaces.get('AGENTS.md')).toMatch(/`ctxr /);
      expect(surfaces.get('.githooks/pre-push')).toContain("'ctxr session submit'");
      expect(surfaces.get('.githooks/pre-commit')).toContain('re-run `ctxr init` or `ctxr doctor`');
      const [skill] = [...surfaces.entries()].filter(([k]) => k.startsWith('skills/')).map(([, v]) => v);
      expect(skill).toContain('`ctxr update`');
    } finally {
      await tmp.cleanup();
    }
  });

  it('an existing store\'s generated regions converge when init reconciles it', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      const agentsPath = path.join(tmp.root, 'AGENTS.md');
      const current = await readFile(agentsPath, 'utf8');
      const legacy = current.replaceAll('`ctxr ', '`contexture ');
      expect(legacy).not.toBe(current);
      await writeFile(agentsPath, legacy);

      expect((await runCli(['init'], { cwd: tmp.root, env })).exitCode).toBe(0);
      const regenerated = await readFile(agentsPath, 'utf8');
      expect(regenerated).not.toMatch(STALE_INVOCATION);
      expect(regenerated).toBe(current);
    } finally {
      await tmp.cleanup();
    }
  });

  it('hooks written under the old executable name are reported stale and rewritten by doctor', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      const hookPath = path.join(tmp.root, '.githooks', 'pre-push');
      const current = await readFile(hookPath, 'utf8');
      const legacy = current.replaceAll('ctxr', 'contexture');
      expect(legacy).not.toBe(current);
      await writeFile(hookPath, legacy);

      const doctor = await runCli(['doctor', '--json'], { cwd: tmp.root, env });
      const checks = JSON.parse(doctor.stdout).data.checks as { id: string; findings?: { code: string }[] }[];
      const hooksHealth = checks.find((c) => c.id === 'git.hooks_health');
      expect(hooksHealth?.findings?.map((f) => f.code)).toContain('git.hooks_health.reinstalled');
      expect(await readFile(hookPath, 'utf8')).toBe(current);
    } finally {
      await tmp.cleanup();
    }
  });
});
