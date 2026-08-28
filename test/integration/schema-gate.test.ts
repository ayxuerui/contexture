import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { hermeticGitEnv } from '../helpers/git-env.js';
import { runCli } from '../helpers/run-cli.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

const execFileAsync = promisify(execFile);
const FIXTURES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/config');

async function gitInit(root: string, env: Record<string, string | undefined>): Promise<void> {
  await execFileAsync('git', ['init'], { cwd: root, env });
}

/**
 * Table-driven over every non-init command so a later phase's new command
 * that bypasses openStore() fails this automatically. Phase 0 has one:
 * doctor.
 */
describe.each(['doctor'] as const)('schema-version gate (%s)', (command) => {
  it('exits 2 naming both versions when schema_version is newer than supported', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await gitInit(tmp.root, env);
      const text = await readFile(path.join(FIXTURES_DIR, 'newer-schema.yaml'), 'utf8');
      await writeFile(path.join(tmp.root, 'contexture.yaml'), text);

      const result = await runCli([command, '--json'], { cwd: tmp.root, env });
      expect(result.exitCode).toBe(2);
      const parsed = JSON.parse(result.stdout);
      expect(parsed.findings[0].code).toBe('config.schema_version.newer');
      expect(parsed.findings[0].message).toContain('999');
    } finally {
      await tmp.cleanup();
    }
  });

  it('exits 2 naming that schema_version is missing entirely', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await gitInit(tmp.root, env);
      const text = await readFile(path.join(FIXTURES_DIR, 'missing-schema-version.yaml'), 'utf8');
      await writeFile(path.join(tmp.root, 'contexture.yaml'), text);

      const result = await runCli([command, '--json'], { cwd: tmp.root, env });
      expect(result.exitCode).toBe(2);
      const parsed = JSON.parse(result.stdout);
      expect(parsed.findings[0].code).toBe('config.schema_version.missing');
    } finally {
      await tmp.cleanup();
    }
  });

  it('exits 2 naming a non-integer schema_version', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await gitInit(tmp.root, env);
      await writeFile(path.join(tmp.root, 'contexture.yaml'), 'schema_version: "not-a-number"\n');

      const result = await runCli([command, '--json'], { cwd: tmp.root, env });
      expect(result.exitCode).toBe(2);
      const parsed = JSON.parse(result.stdout);
      expect(parsed.findings[0].code).toBe('config.invalid');
    } finally {
      await tmp.cleanup();
    }
  });
});
