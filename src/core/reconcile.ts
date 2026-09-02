import path from 'node:path';
import { DEFAULT_BASELINE_CONVENTIONS_FILE_NAME } from '../config/defaults.js';
import type { StoreConfig } from '../config/schema.js';
import { CLI_VERSION } from '../version.js';
import type { RunEnv } from './env.js';
import {
  agentsMdPath,
  AGENTS_MD_SECTION_ORDER,
  buildAgentsCanonicalSection,
  buildAgentsCaptureSection,
  buildAgentsConventionsSection,
  buildAgentsLegRoutingSection,
  buildAgentsMissionSection,
  buildAgentsPlacementSection,
} from './agents-doc.js';
import type { Finding } from './envelope.js';
import { syncBaselineConventions } from './convention-doc.js';
import { removeFencedRegionFromFile, reorderFencedRegionsInFile, upsertFencedRegionInFile } from './fs/fenced-region.js';
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

/**
 * compose-store-guidance-documents: the conventions fence was renamed from
 * `store-conventions` to `conventions` (dropping the redundant "store-"
 * prefix — every sibling fence/template already omits it, e.g. `canonical`,
 * `placement`, `mission`). Same one-time cleanup shape as the identity
 * retirement above: `buildAgentsConventionsSection` already writes the new
 * `contexture:conventions` fence via the loop below, so this only needs to
 * remove the orphaned old one.
 */
const RETIRED_AGENTS_MD_STORE_CONVENTIONS_FENCE = htmlCommentFence('store-conventions');

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

  // The owned skill copies are refreshed unconditionally here — not because
  // any AGENTS.md section reads them anymore (inline-conventions-and-mission
  // removed the skill index), but because init/update must still deliver
  // the skill files to disk regardless of what AGENTS.md renders.
  changed.push(...(await syncShippedSkills(root, config)));
  const vendoredResult = await syncVendoredSkills(root, config, CLI_VERSION);
  changed.push(...vendoredResult.changed);
  const findings: Finding[] = [...vendoredResult.findings];

  // Bridges every declared harness's skills directory to the canonical
  // path (creating, or repairing a broken one) — after the skills
  // themselves are current, so a freshly created bridge or copy reflects
  // this run's content, not a stale one.
  changed.push(...(await bridgeHarnessSkills(root, config)).map((r) => r.path));

  // Same reason, same ordering constraint as skills: the shipped baseline
  // convention file must be current on disk BEFORE buildAgentsConventionsSection
  // scans the guidance directory and inlines it (compose-store-guidance-documents).
  note(
    path.join(config.harness.guidance_path, DEFAULT_BASELINE_CONVENTIONS_FILE_NAME).split(path.sep).join('/'),
    (await syncBaselineConventions(root, config)).changed,
  );

  let agentsChanged = false;
  for (const build of [
    buildAgentsLegRoutingSection,
    buildAgentsCaptureSection,
    buildAgentsPlacementSection,
    buildAgentsCanonicalSection,
    buildAgentsMissionSection,
    buildAgentsConventionsSection,
  ]) {
    if ((await build(root, config)).changed) agentsChanged = true;
  }
  if ((await removeFencedRegionFromFile(agentsMdPath(root), RETIRED_AGENTS_MD_IDENTITY_FENCE)).changed) agentsChanged = true;
  if ((await removeFencedRegionFromFile(agentsMdPath(root), RETIRED_AGENTS_MD_STORE_CONVENTIONS_FENCE)).changed) agentsChanged = true;
  // harness-portability spec "Generated sections render in a fixed order":
  // reorders once every section fence above has been written/refreshed, so
  // a first-time init and a subsequent update converge on the same layout.
  // A no-op when the fences aren't all contiguous — see `reorderFencedRegions`.
  if ((await reorderFencedRegionsInFile(agentsMdPath(root), AGENTS_MD_SECTION_ORDER)).changed) agentsChanged = true;
  note('AGENTS.md', agentsChanged);

  const { changed: hookFiles } = await installHooks(root, config.git.default_branch);
  changed.push(...hookFiles);
  await configureHooksPath(env.git, root);

  return { changed: [...new Set(changed)], findings };
}
