import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SHIPPED_PROFILES } from '../../src/taxonomy/profiles.js';
import { hermeticGitEnv } from '../helpers/git-env.js';
import { spawnPty } from '../helpers/spawn-pty.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BIN_PATH = path.resolve(HERE, '../../dist/bin.js');

/** Undoes @inquirer/prompts' terminal-width word-wrap and ANSI styling. */
function normalize(text: string): string {
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\s+/g, ' ');
}

describe.skipIf(process.platform === 'win32')('init interactive taxonomy prompt (real pty)', () => {
  it('presents all three shipped profiles with descriptions, blocks, and writes nothing', async () => {
    const tmp = await makeTmpDir();
    const env = hermeticGitEnv();
    const handle = spawnPty(`node ${BIN_PATH} init`, { cwd: tmp.root, env });
    try {
      await handle.waitForOutput((text) => SHIPPED_PROFILES.every((p) => normalize(text).includes(p.name)));

      // Only the genuinely TTY-dependent facts are asserted here: full
      // description content is proven exhaustively (and deterministically)
      // in the unit test via a fake prompter — a real terminal can wrap a
      // long description at an arbitrary column, so matching more than a
      // short, wrap-safe prefix here would make this test brittle for no
      // real gain in coverage.
      const normalized = normalize(handle.capturedText());
      for (const profile of SHIPPED_PROFILES) {
        expect(normalized).toContain(profile.name);
        expect(normalized).toContain(profile.description.slice(0, 12));
      }

      // Give the process a moment to settle, then confirm it's still blocking.
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(handle.child.exitCode).toBeNull();

      // And that it wrote nothing before a selection was made.
      await expect(readFile(path.join(tmp.root, 'contexture.yaml'), 'utf8')).rejects.toThrow();
    } finally {
      handle.child.kill();
      await tmp.cleanup();
    }
  }, 15_000);
});
