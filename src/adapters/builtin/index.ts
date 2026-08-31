import { githubForgeAdapter } from '../forge/github.js';
import { claudeCodeHarnessAdapter } from '../harness/claude-code.js';
import type { Adapter } from '../types.js';

/**
 * Every adapter shipped with contexture itself, resolved by (kind, id)
 * against contexture.yaml's declared list. No identity-injection adapter
 * ships: AGENTS.md's generated agent-identity section already reaches
 * every harness open-box (entry-doc-generation D4), and a harness entry
 * file must contain nothing beyond its AGENTS.md import.
 */
export const BUILTIN_ADAPTERS: readonly Adapter[] = [githubForgeAdapter, claudeCodeHarnessAdapter];
