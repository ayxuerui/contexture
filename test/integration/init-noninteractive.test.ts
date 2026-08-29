import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';
import { profileById } from '../../src/taxonomy/profiles.js';
import { hermeticGitEnv } from '../helpers/git-env.js';
import { runCli } from '../helpers/run-cli.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

const execFileAsync = promisify(execFile);

describe('non-interactive init', () => {
  it('creates PARA by default, commits once, prints no prompt, and doctor is clean', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();

      const initResult = await runCli(['init'], { cwd: tmp.root, env });
      expect(initResult.exitCode).toBe(0);
      expect(initResult.stderr).not.toContain('Choose a taxonomy profile');
      expect(initResult.stdout).not.toContain('Choose a taxonomy profile');

      const configText = await readFile(path.join(tmp.root, 'contexture.yaml'), 'utf8');
      const config = parseYaml(configText) as { taxonomy: { layers: { name: string }[] } };
      expect(config.taxonomy.layers.map((l) => l.name)).toEqual(
        profileById('para')!.layers.map((l) => l.name),
      );

      const { stdout: log } = await execFileAsync('git', ['log', '--oneline'], { cwd: tmp.root, env });
      expect(log.trim().split('\n')).toHaveLength(1);
      const { stdout: status } = await execFileAsync('git', ['status', '--porcelain'], { cwd: tmp.root, env });
      expect(status.trim()).toBe('');

      const doctorResult = await runCli(['doctor', '--json'], { cwd: tmp.root, env });
      expect(doctorResult.exitCode).toBe(0);
      const doctorEnvelope = JSON.parse(doctorResult.stdout);
      expect(doctorEnvelope.status).toBe('ok');
      expect(doctorEnvelope.data.summary.fail).toBe(0);
      // A fresh, non-interactive init has no notes, so the only check that
      // can fire against an empty store is hook health — and init just
      // installed correct hooks, so it should pass.
      expect(doctorEnvelope.data.checks.every((c: { result: string }) => c.result !== 'fail')).toBe(true);
    } finally {
      await tmp.cleanup();
    }
  });
});
