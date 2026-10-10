import { DEFAULT_SKILLS_PATH } from '../../config/defaults.js';
import type { HarnessGenerationAdapter } from '../types.js';

/**
 * A skills-only harness-generation adapter
 * (support-codex-and-antigravity-harnesses): Codex reads `AGENTS.md` at the
 * store root and discovers skills under `.agents/skills/` natively, so this
 * adapter declares no entry file and its skills directory is the canonical
 * one — no bridge is created on a store using the default skills path.
 *
 * `entryDocumentMaxBytes` is Codex's `project_doc_max_bytes` default:
 * measured on codex-cli 0.154.0, it stops reading project docs at exactly
 * 32,768 bytes, combined across every `AGENTS.md` from the repo root down to
 * the working directory. Only the operator's own `~/.codex/config.toml` (or
 * `-c`) raises it — a repo-level `.codex/config.toml` is not honored for it,
 * even with the project trusted — which is why a store records a raised
 * value as its own override rather than this adapter guessing at it.
 *
 * No permission config (design.md D4): Codex ignores a repo-level config for
 * the settings that matter, and interactive Codex already asks the operator
 * to approve each git step its sandbox refuses.
 */
export const codexHarnessAdapter: HarnessGenerationAdapter = {
  id: 'codex',
  kind: 'harness-generation',
  interfaceVersion: 2,
  skillsDir: DEFAULT_SKILLS_PATH,
  entryDocumentMaxBytes: 32_768,
};
