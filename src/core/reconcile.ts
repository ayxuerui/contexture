import path from 'node:path';
import type { StoreConfig } from '../config/schema.js';
import { CLI_VERSION } from '../version.js';
import type { RunEnv } from './env.js';
import {
  agentsMdPath,
  buildAgentsCanonicalSection,
  buildAgentsCaptureSection,
  buildAgentsConventionsSection,
  buildAgentsLegRoutingSection,
  buildAgentsPlacementSection,
} from './agents-doc.js';
import type { Finding } from './envelope.js';
import { removeFencedRegionFromFile, upsertFencedRegionInFile } from './fs/fenced-region.js';
import { bridgeHarnessSkills } from './harness/bridge.js';
import { configureHooksPath, installHooks } from './hooks.js';
import { commentFence, DERIVED_GITIGNORE_FENCE, htmlCommentFence } from './markers.js';
import { syncShippedSkills, syncVendoredSkills } from './skills.js';

export const WORKTREES_GITIGNORE_FENCE = commentFence('worktrees');

/**
 * remove-agent-identity: AGENTS.md's old "Agent identity" section is an
 * orphaned fence now that nothing calls `upsertFencedRegionInFile` with it —
 * reconstructed from the region name alone (`htmlCommentFence('agent-identity')`,
 * matching the deleted `AGENTS_MD_IDENTITY_FENCE`) since removing the region
 * doesn't require keeping the retired builder function around. A one-time,
 * capability-specific cleanup, not the general orphan-detection mechanism
 * contexture issue #14 tracks.
 */
const RETIRED_AGENTS_MD_IDENTITY_FENCE = htmlCommentFence('agent-identity');

export interface ReconcileResult {
  /** Store-relative paths written this run (an up-to-date store yields none). */
  changed: string[];
  /** e.g. a vendored skill left in place because it was modified locally. */
  findings: Finding[];
}

/**
 * Brings every contexture-OWNED file in a store to the installed package's
 * version: the managed .gitignore blocks, every generated AGENTS.md
 * section, the contexture-owned skill copies, and the git hooks. Operator
 * content is never rewritten. Shared by `ctxr init` (reconciling an
 * existing store) and `ctxr update` (after upgrading contexture).
 * Byte-stable: a second run with nothing changed writes nothing.
 */
export async function reconcileStore(env: RunEnv, root: string, config: StoreConfig): Promise<ReconcileResult> {
  const changed: string[] = [];
  const note = (relativePath: string, didChange: boolean): void => {
    if (didChange) changed.push(relativePath);
  };

  const gitignorePath = path.join(root, '.gitignore');
  note('.gitignore', (await upsertFencedRegionInFile(gitignorePath, DERIVED_GITIGNORE_FENCE, config.derived.paths)).changed);
  note(
    '.gitignore',
    (await upsertFencedRegionInFile(gitignorePath, WORKTREES_GITIGNORE_FENCE, [config.session.worktrees_path])).changed,
  );

  // Files the generated sections index (skills) must be current BEFORE the
  // sections are rendered — the skill index is a disk scan.
  changed.push(...(await syncShippedSkills(root, config)));
  const vendoredResult = await syncVendoredSkills(root, config, CLI_VERSION);
  changed.push(...vendoredResult.changed);
  const findings: Finding[] = [...vendoredResult.findings];

  // Bridges every declared harness's skills directory to the canonical
  // path (creating, or repairing a broken one) — after the skills
  // themselves are current, so a freshly created bridge or copy reflects
  // this run's content, not a stale one.
  changed.push(...(await bridgeHarnessSkills(root, config)).map((r) => r.path));

  let agentsChanged = false;
  for (const build of [
    buildAgentsLegRoutingSection,
    buildAgentsCaptureSection,
    buildAgentsPlacementSection,
    buildAgentsCanonicalSection,
    buildAgentsConventionsSection,
  ]) {
    if ((await build(root, config)).changed) agentsChanged = true;
  }
  if ((await removeFencedRegionFromFile(agentsMdPath(root), RETIRED_AGENTS_MD_IDENTITY_FENCE)).changed) agentsChanged = true;
  note('AGENTS.md', agentsChanged);

  const { changed: hookFiles } = await installHooks(root, config.git.default_branch);
  changed.push(...hookFiles);
  await configureHooksPath(env.git, root);

  return { changed: [...new Set(changed)], findings };
}
