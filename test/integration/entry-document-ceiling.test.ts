import { describe, expect, it } from 'vitest';
import { readConfig } from '../../src/config/load.js';
import {
  renderCanonicalSection,
  renderCaptureSection,
  renderConventionsSection,
  renderLegRoutingSection,
  renderPlacementSection,
} from '../../src/core/agents-doc.js';
import { hermeticGitEnv } from '../helpers/git-env.js';
import { runCli } from '../helpers/run-cli.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

/**
 * lean-composed-entry-document: "contexture's own share of the entry document
 * is held under a ceiling." gbrain's lesson — a written rule to stay short is
 * how an always-loaded file grows; a guard is what keeps it short. Lower this
 * number when a template shrinks. Raising it needs a change that argues for
 * the increase.
 */
const CONTEXTURE_OWNED_CEILING_BYTES = 7_000;

describe('contexture-owned entry document prose', () => {
  it(`stays under ${CONTEXTURE_OWNED_CEILING_BYTES} bytes on a freshly initialized default store`, async () => {
    const tmp = await makeTmpDir();
    try {
      const init = await runCli(['init', '--harness', 'none'], { cwd: tmp.root, env: hermeticGitEnv() });
      expect(init.exitCode).toBe(0);
      const config = await readConfig(tmp.root);
      // Operator content (the mission, the seeded house conventions) is the
      // store's, so the conventions section is measured with no operator files:
      // the shipped baseline plus the section's own framing.
      const sections = [
        renderCanonicalSection(config),
        renderLegRoutingSection(config),
        renderCaptureSection(config),
        renderPlacementSection(config),
        renderConventionsSection(config, []),
      ];
      const total = sections.reduce((sum, lines) => sum + Buffer.byteLength(lines.join('\n'), 'utf8'), 0);
      expect(total, `contexture-owned sections total ${total} bytes; ceiling ${CONTEXTURE_OWNED_CEILING_BYTES}`).toBeLessThanOrEqual(
        CONTEXTURE_OWNED_CEILING_BYTES,
      );
    } finally {
      await tmp.cleanup();
    }
  });
});
