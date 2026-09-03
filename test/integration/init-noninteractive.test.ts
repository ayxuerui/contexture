import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';
import { SHIPPED_DEFAULTS } from '../../src/config/defaults.js';
import { profileById } from '../../src/taxonomy/profiles.js';
import { hermeticGitEnv } from '../helpers/git-env.js';
import { runCli } from '../helpers/run-cli.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

const execFileAsync = promisify(execFile);

describe('non-interactive init', () => {
  it('creates the capture tier: an inbox to capture into, excluded from retrieval and tracked in git', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });

      const captureRoot = SHIPPED_DEFAULTS.ingest.capture_root;
      const inboxPath = SHIPPED_DEFAULTS.ingest.inbox_path;

      // There is somewhere to capture into, and it is inside the capture root.
      expect(existsSync(path.join(tmp.root, inboxPath))).toBe(true);
      expect(inboxPath.startsWith(captureRoot)).toBe(true);

      // Both are conventions the store accepted, so the file does not restate them.
      const configText = await readFile(path.join(tmp.root, 'contexture.yaml'), 'utf8');
      expect(configText).not.toContain('capture_root');
      expect(configText).not.toContain('inbox_path');
      expect(configText).not.toContain('exclude_paths');

      // Tracked, not derived and not ignored: provenance is committed.
      const config = parseYaml(configText);
      expect(config.derived?.paths ?? []).not.toContain(captureRoot);
      const gitignore = await readFile(path.join(tmp.root, '.gitignore'), 'utf8');
      expect(gitignore).not.toContain(captureRoot);

      const { stdout: tracked } = await execFileAsync('git', ['ls-files', captureRoot], { cwd: tmp.root, env });
      expect(tracked.trim()).toBe(`${inboxPath}.gitkeep`);

      // And the store is healthy with it there.
      const doctor = await runCli(['doctor', '--json'], { cwd: tmp.root, env });
      expect(doctor.exitCode).toBe(0);
    } finally {
      await tmp.cleanup();
    }
  });

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
