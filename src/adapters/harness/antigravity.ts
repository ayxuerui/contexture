import { DEFAULT_SKILLS_PATH } from '../../config/defaults.js';
import type { HarnessGenerationAdapter } from '../types.js';

/**
 * A skills-only harness-generation adapter
 * (support-codex-and-antigravity-harnesses): Antigravity loads `AGENTS.md` as
 * an always-on rule and discovers workspace skills under `.agents/skills/`,
 * so this adapter declares no entry file and needs no bridge on a store using
 * the default skills path.
 *
 * No `GEMINI.md` wrapper: Antigravity loads `AGENTS.md` and `GEMINI.md` side
 * by side, so a file importing the former would load the store's
 * fundamentals twice.
 *
 * `entryDocumentMaxBytes` is the per-file rule cap Antigravity documents and
 * agy 1.3.2 was measured against: content past about 24,000 bytes is never
 * seen, and there is no setting that raises it.
 */
export const antigravityHarnessAdapter: HarnessGenerationAdapter = {
  id: 'antigravity',
  kind: 'harness-generation',
  interfaceVersion: 2,
  skillsDir: DEFAULT_SKILLS_PATH,
  entryDocumentMaxBytes: 24_000,
};
