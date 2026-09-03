import { lstat, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hermeticGitEnv } from '../helpers/git-env.js';
import { runCli } from '../helpers/run-cli.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

describe('vendored skills and the harness bridge (real CLI)', () => {
  it('a store declaring both harnesses resolves both to the canonical skills path, with every skill readable through each, and AGENTS.md naming only the canonical path', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      const init = await runCli(['init', '--profile', 'para', '--harness', 'claude-code,hermes-agent'], { cwd: tmp.root, env });
      expect(init.exitCode).toBe(0);

      // Both harness directories resolve to the same real location as canonical.
      const canonicalStat = await lstat(path.join(tmp.root, '.agents/skills'));
      expect(canonicalStat.isDirectory()).toBe(true);
      for (const harnessDir of ['.claude/skills', '.hermes/skills']) {
        const stat = await lstat(path.join(tmp.root, harnessDir));
        expect(stat.isSymbolicLink(), `${harnessDir} should be a symlink`).toBe(true);
      }

      // Every owned and vendored skill is readable through each harness path.
      for (const harnessDir of ['.claude/skills', '.hermes/skills']) {
        const throughBridge = await readFile(path.join(tmp.root, harnessDir, 'frontend-design/SKILL.md'), 'utf8');
        expect(throughBridge).toContain('name: frontend-design');

        // The set is plural: a bridge that only resolves the first entry is a
        // bridge that half works, and reading one skill through it would not
        // catch that.
        const secondAxis = await readFile(path.join(tmp.root, harnessDir, 'eli5/SKILL.md'), 'utf8');
        expect(secondAxis).toContain('name: eli5');
        const owned = await readFile(path.join(tmp.root, harnessDir, 'ctxr-publish/SKILL.md'), 'utf8');
        expect(owned).toContain('name: ctxr-publish');
      }

      // AGENTS.md names the canonical path only — never the harness-specific mirrors
      // (inline-conventions-and-mission removed the per-skill index entirely).
      const agentsMd = await readFile(path.join(tmp.root, 'AGENTS.md'), 'utf8');
      expect(agentsMd).toContain('.agents/skills/');
      expect(agentsMd).not.toContain('.claude/skills');
      expect(agentsMd).not.toContain('.hermes/skills');

      const verify = await runCli(['verify', '--portable', '--json'], { cwd: tmp.root, env });
      expect(verify.exitCode).toBe(0);
    } finally {
      await tmp.cleanup();
    }
  });

  it('doctor reports a harness directory materialized as a regular file as a broken bridge, and update repairs it', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      const init = await runCli(['init', '--profile', 'para', '--harness', 'claude-code'], { cwd: tmp.root, env });
      expect(init.exitCode).toBe(0);

      // Simulate a checkout that could not represent the committed symlink.
      await rm(path.join(tmp.root, '.claude/skills'), { recursive: true, force: true });
      await writeFile(path.join(tmp.root, '.claude/skills'), '../.agents/skills', 'utf8');

      const doctor = await runCli(['doctor', '--json'], { cwd: tmp.root, env });
      expect(doctor.exitCode).not.toBe(0);
      const doctorData = JSON.parse(doctor.stdout);
      expect(doctorData.findings.some((f: { code: string }) => f.code === 'harness_portability.broken_bridge')).toBe(true);

      const update = await runCli(['update', '--json'], { cwd: tmp.root, env });
      expect(update.exitCode).toBe(0);

      const repairedStat = await lstat(path.join(tmp.root, '.claude/skills'));
      expect(repairedStat.isSymbolicLink()).toBe(true);

      const doctorAfter = await runCli(['doctor', '--json'], { cwd: tmp.root, env });
      expect(doctorAfter.exitCode).toBe(0);
    } finally {
      await tmp.cleanup();
    }
  });
});
