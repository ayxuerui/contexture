import type { HarnessGenerationAdapter } from '../types.js';

/**
 * A skills-only harness-generation adapter (vendored-craft-skills spec):
 * Hermes reads the canonical entry document directly, so this adapter
 * declares no entry file and no permission config — its only contribution
 * is `skillsDir`, bridged to the store's configured skills path.
 */
export const hermesAgentHarnessAdapter: HarnessGenerationAdapter = {
  id: 'hermes-agent',
  kind: 'harness-generation',
  interfaceVersion: 2,
  skillsDir: '.hermes/skills/',
};
