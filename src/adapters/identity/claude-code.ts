import type { IdentityInjectionAdapter } from '../types.js';

/**
 * The reference identity-injection adapter, sharing Claude Code's `@path`
 * import mechanism with the harness-generation adapter above but declared
 * as an independent adapter (a different kind) — removing this one from
 * `contexture.yaml`'s adapters list stops identity injection without
 * touching the harness entry file or the canonical identity files
 * themselves (agent-identity spec).
 */
export const claudeCodeIdentityAdapter: IdentityInjectionAdapter = {
  id: 'claude-code',
  kind: 'identity-injection',
  interfaceVersion: 1,
  entryFileName: 'CLAUDE.md',

  render(identityFilePaths: readonly string[]): string[] {
    return identityFilePaths.map((p) => `@${p}`);
  },
};
