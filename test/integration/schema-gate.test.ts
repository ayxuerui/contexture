import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import type { MigrationStep } from '../../src/config/migrations.js';
import { ExitCode } from '../../src/core/exit-codes.js';
import { createExecFileGitRunner } from '../../src/core/git/exec.js';
import { run } from '../../src/run.js';
import { makeFakeEnv, readAll } from '../helpers/fake-env.js';
import { SUPPORTED_SCHEMA_VERSION } from '../../src/config/schema.js';
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
 * doctor. `update` is here too since migrate-stores-on-update: it is the one
 * command allowed to open an older store, but only one within the migration
 * floor — and the shipped ladder is empty, so against the real binary every
 * older store is below it, and update refuses exactly like doctor does.
 */
describe.each(['doctor', 'update'] as const)('schema-version gate (%s)', (command) => {
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

  /**
   * retire-store-migrations: the older direction is refused at config load,
   * not merely reported by doctor. The message must name the version, not a
   * shape error against keys whose superseded spellings the schema dropped.
   */
  it('exits 2 naming both versions when schema_version is older than supported', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await gitInit(tmp.root, env);
      const text = await readFile(path.join(FIXTURES_DIR, 'older-schema.yaml'), 'utf8');
      await writeFile(path.join(tmp.root, 'contexture.yaml'), text);

      const result = await runCli([command, '--json'], { cwd: tmp.root, env });
      expect(result.exitCode).toBe(2);
      const parsed = JSON.parse(result.stdout);
      expect(parsed.findings[0].code).toBe('config.schema_version.behind');
      expect(parsed.findings[0].message).toContain('3');
      expect(parsed.findings[0].message).toContain(String(SUPPORTED_SCHEMA_VERSION));
      // Below the floor nothing can carry it forward, so no command — update included —
      // points at `ctxr update`, and the file is left exactly as it was.
      expect(parsed.findings[0].details.remedy).toBe('by_hand');
      expect(parsed.findings[0].message).not.toContain('ctxr update');
      expect(await readFile(path.join(tmp.root, 'contexture.yaml'), 'utf8')).toBe(text);
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

/**
 * migrate-stores-on-update: the remedy a behind-version refusal names depends on
 * the migration floor. The shipped ladder is empty, so these run in-process with
 * a test ladder through RunEnv's `migrationSteps` seam — the only way to have a
 * store that is older than supported yet within reach of a migration.
 */
describe('the behind-version refusal names its remedy', () => {
  const v = SUPPORTED_SCHEMA_VERSION;
  // One step from v-1, so the floor is v-1: a store at v-1 is within reach, v-2 is not.
  const ladder: MigrationStep[] = [{ from: v - 1, retires: [], apply: () => undefined }];

  async function refusal(command: string, recorded: number): Promise<{ exitCode: ExitCode; finding: any; text: string; after: string }> {
    const tmp = await makeTmpDir();
    try {
      const text = `schema_version: ${recorded}\ntaxonomy: { profile: para, layers: [] }\n`;
      await writeFile(path.join(tmp.root, 'contexture.yaml'), text);
      await gitInit(tmp.root, hermeticGitEnv());
      const env = makeFakeEnv({ cwd: tmp.root, git: createExecFileGitRunner(), migrationSteps: ladder });
      const exitCode = await run([command, '--json'], env);
      const envelope = JSON.parse(readAll(env.io.stdout as never));
      const after = await readFile(path.join(tmp.root, 'contexture.yaml'), 'utf8');
      return { exitCode, finding: envelope.findings[0], text, after };
    } finally {
      await tmp.cleanup();
    }
  }

  it('names `ctxr update` when another command meets a store within the floor', async () => {
    const { exitCode, finding, text, after } = await refusal('doctor', v - 1);
    expect(exitCode).toBe(ExitCode.Usage);
    expect(finding.code).toBe('config.schema_version.behind');
    expect(finding.details.remedy).toBe('update');
    expect(finding.message).toContain('ctxr update');
    expect(after).toBe(text);
  });

  it('refuses a store below the floor even for update, naming no command', async () => {
    const { exitCode, finding, text, after } = await refusal('update', v - 2);
    expect(exitCode).toBe(ExitCode.Usage);
    expect(finding.code).toBe('config.schema_version.behind');
    expect(finding.details.remedy).toBe('by_hand');
    expect(finding.details.floor).toBe(v - 1);
    expect(finding.message).not.toContain('ctxr update');
    expect(after).toBe(text);
  });
});
