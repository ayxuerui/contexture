import { githubForgeAdapter } from '../forge/github.js';
import { claudeCodeHarnessAdapter } from '../harness/claude-code.js';
import { claudeCodeIdentityAdapter } from '../identity/claude-code.js';
import type { Adapter } from '../types.js';

/** Every adapter shipped with contexture itself, resolved by (kind, id) against contexture.yaml's declared list. */
export const BUILTIN_ADAPTERS: readonly Adapter[] = [
  githubForgeAdapter,
  claudeCodeHarnessAdapter,
  claudeCodeIdentityAdapter,
];
