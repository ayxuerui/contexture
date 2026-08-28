import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hermeticGitEnv } from '../helpers/git-env.js';
import { runCli } from '../helpers/run-cli.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

const VALID_CONFIG = [
  'schema_version: 1',
  'taxonomy: { profile: para, layers: [] }',
  'fields: { visibility: scope }',
  'visibility: { default_context: private, directory_defaults: {} }',
  'derived: { paths: [] }',
  'retrieval: { exclude_paths: [] }',
  '',
].join('\n');

describe('not-a-git-repository refusal', () => {
  it('doctor refuses a root with a valid contexture.yaml but no .git', async () => {
    const tmp = await makeTmpDir();
    try {
      await writeFile(path.join(tmp.root, 'contexture.yaml'), VALID_CONFIG);
      const env = hermeticGitEnv();
      const result = await runCli(['doctor', '--json'], { cwd: tmp.root, env });
      expect(result.exitCode).toBe(2);
      const parsed = JSON.parse(result.stdout);
      expect(parsed.findings[0].code).toBe('root.not_a_git_repository');
    } finally {
      await tmp.cleanup();
    }
  });
});
