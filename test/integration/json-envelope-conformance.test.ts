import { describe, expect, it } from 'vitest';
import { COMMAND_NAMES } from '../../src/run.js';
import { hermeticGitEnv } from '../helpers/git-env.js';
import { runCli } from '../helpers/run-cli.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

/**
 * Table-driven over every registered command, on BOTH a fresh (uninitialized)
 * directory. The envelope-shape guarantee must hold on the error path just
 * as much as the success path, and iterating COMMAND_NAMES means a later
 * phase's new command is covered the moment it's added there — no one has
 * to remember to write a new test file for it.
 */
describe.each(COMMAND_NAMES)('--json envelope conformance (%s)', (command) => {
  it('emits exactly one parseable JSON value on stdout with the required shape', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      const result = await runCli([command, '--json'], { cwd: tmp.root, env });

      let envelope: unknown;
      expect(() => {
        envelope = JSON.parse(result.stdout);
      }).not.toThrow();

      const e = envelope as Record<string, unknown>;
      expect(e.envelope_version).toBe(1);
      expect(typeof e.cli_version).toBe('string');
      expect(e.command).toBe(command);
      expect(['ok', 'failed', 'error']).toContain(e.status);
      expect(typeof e.exit_code).toBe('number');
      expect(e.store).toHaveProperty('root');
      expect(e.store).toHaveProperty('schema_version');
      expect(Array.isArray(e.findings)).toBe(true);
      expect('data' in e).toBe(true);

      // No human narration leaked into the JSON stdout stream.
      expect(result.stdout.trim().split('\n')).toHaveLength(1);
    } finally {
      await tmp.cleanup();
    }
  });
});
