import { describe, expect, it } from 'vitest';
import { hermeticGitEnv } from '../helpers/git-env.js';
import { runCli } from '../helpers/run-cli.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

describe('no store root found', () => {
  it('doctor exits 2, naming all three places checked, in a fresh empty directory', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv({ CONTEXTURE_STORE_ROOT: undefined, CONTEXTURE_ROOT: undefined });
      const result = await runCli(['doctor', '--json'], { cwd: tmp.root, env });
      expect(result.exitCode).toBe(2);
      const parsed = JSON.parse(result.stdout);
      expect(parsed.findings[0].code).toBe('root.not_found');
      expect(parsed.findings[0].message).toContain('--root');
      expect(parsed.findings[0].message).toContain('CONTEXTURE_STORE_ROOT');
      expect(parsed.findings[0].message).toContain(tmp.root);
    } finally {
      await tmp.cleanup();
    }
  });
});
