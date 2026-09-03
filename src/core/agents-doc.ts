import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { StoreConfig } from '../config/schema.js';
import { GRAPH_DOCUMENT_RELATIVE_PATH } from './graph/persist.js';
import { CONFIG_FILE_NAME } from './root.js';
import { excludedPrefixesFor } from './notes/list.js';
import { extractDocMetadata, inlineDocBody, scanConventions, type ScannedDoc } from './conventions.js';
import { readFencedRegionFromFile, removeFencedRegionFromFile, upsertFencedRegionInFile } from './fs/fenced-region.js';
import { htmlCommentFence } from './markers.js';
import { packagedTemplate, substituteBlock } from './templates.js';

/**
 * extract-agents-doc-templates: each generated AGENTS.md section's prose
 * lives in `templates/agents/<fence-slug>.md`, named for the fence it lands
 * in, so the file a reviewer opens and the region it writes share a name.
 * Only genuinely per-store data — the exclusion list, the taxonomy layers,
 * the scanned indexes — is computed here and substituted in.
 */
function agentsTemplate(name: string): string {
  return packagedTemplate('agents', name);
}

export function agentsMdPath(root: string): string {
  return path.join(root, 'AGENTS.md');
}

/**
 * context-retrieval spec (task 4.5): the leg-routing rule that tells an
 * agent which of its two retrieval legs to use for a given question — the
 * catalog/graph (contexture-built-and-maintained) or its own direct content
 * matching (grep, scoped by the store's declared exclusion paths). This is
 * one fenced region within AGENTS.md; Phase 8 adds the canonical template's
 * other sections (root-resolution, frontmatter schema, write-path, skill
 * index) as sibling regions in the same file, never touching this one.
 */
export const AGENTS_MD_LEG_ROUTING_FENCE = htmlCommentFence('retrieval-leg-routing');

function trimTrailingSlash(prefix: string): string {
  return prefix.replace(/\/+$/, '');
}

/**
 * inline-conventions-and-mission: `excludedPrefixesFor` deliberately includes
 * both a parent path (e.g. `.contexture/`) and paths nested under it (e.g.
 * `.contexture/cache/`) — each has its own reason to be there, and the note
 * walker (`notes/list.ts`) needs the full, unfiltered set to skip directories
 * early rather than descend and filter every file. Rendering that list
 * verbatim produces a dozen-plus redundant bullets, so this collapses any
 * prefix already covered by an ancestor prefix for display only — the
 * exclusion logic itself is untouched.
 */
function collapseNestedPrefixes(prefixes: readonly string[]): string[] {
  // Original (possibly trailing-slash) form preserved per trimmed key, since
  // this list mixes directory prefixes and bare file exclusions (AGENTS.md,
  // log.md) — the collapse test itself compares on the trimmed form only.
  const originalByTrimmed = new Map<string, string>();
  for (const prefix of prefixes) {
    const trimmed = trimTrailingSlash(prefix);
    if (!originalByTrimmed.has(trimmed)) originalByTrimmed.set(trimmed, prefix);
  }
  const trimmed = [...originalByTrimmed.keys()];
  return trimmed
    .filter((path) => !trimmed.some((other) => other !== path && path.startsWith(`${other}/`)))
    .sort()
    .map((path) => originalByTrimmed.get(path)!);
}

export function renderLegRoutingSection(config: StoreConfig): string[] {
  const exclusions = collapseNestedPrefixes(excludedPrefixesFor(config));
  return substituteBlock(
    agentsTemplate('retrieval-leg-routing').replaceAll('__GRAPH_DOCUMENT_PATH__', GRAPH_DOCUMENT_RELATIVE_PATH),
    '__EXCLUSION_PATHS__',
    [exclusions.map((prefix) => `\`${prefix}\``).join(', ')],
  ).split('\n');
}

/** Idempotently reconciles AGENTS.md's leg-routing section from current config — called at init and on re-init. */
export async function buildAgentsLegRoutingSection(root: string, config: StoreConfig): Promise<{ changed: boolean }> {
  return upsertFencedRegionInFile(agentsMdPath(root), AGENTS_MD_LEG_ROUTING_FENCE, renderLegRoutingSection(config));
}

/**
 * context-ingest spec (task 6.3): capture is a plain file write an agent
 * does directly with its own tools — no CLI command wraps it, the same
 * "agents gather, the CLI computes/writes/verifies" split that dropped
 * `ctxr search`. This section documents the one rule that write must
 * follow, so it isn't only tribal knowledge: no source-identity fields, and
 * where the file goes.
 */
export const AGENTS_MD_CAPTURE_FENCE = htmlCommentFence('capture-and-ingest');

export function renderCaptureSection(config: StoreConfig): string[] {
  return agentsTemplate('capture-and-ingest').replaceAll('__INBOX_PATH__', config.ingest.inbox_path).split('\n');
}

export async function buildAgentsCaptureSection(root: string, config: StoreConfig): Promise<{ changed: boolean }> {
  return upsertFencedRegionInFile(agentsMdPath(root), AGENTS_MD_CAPTURE_FENCE, renderCaptureSection(config));
}

/**
 * context-organize spec (task 7.1): the placement skill's documentation is
 * driven entirely by the configured taxonomy, never a
 * hardcoded layout — the layer list is generated purely from
 * `config.taxonomy.layers`, so it reads correctly under PARA, Zettelkasten,
 * Diátaxis, or any custom taxonomy without a single layer name appearing in
 * this file's own source. A store with no declared layers gets its own
 * template rather than a swapped-out middle, so both variants read as
 * complete documents.
 */
export const AGENTS_MD_PLACEMENT_FENCE = htmlCommentFence('placement');

export function renderPlacementSection(config: StoreConfig): string[] {
  const { layers } = config.taxonomy;
  if (layers.length === 0) return agentsTemplate('placement-no-layers').split('\n');

  const layerLines = layers.map((layer) => `- **${layer.name}** (\`${layer.path}/\`): ${layer.description}`);
  return substituteBlock(agentsTemplate('placement'), '__LAYER_LIST__', layerLines).split('\n');
}

export async function buildAgentsPlacementSection(root: string, config: StoreConfig): Promise<{ changed: boolean }> {
  return upsertFencedRegionInFile(agentsMdPath(root), AGENTS_MD_PLACEMENT_FENCE, renderPlacementSection(config));
}

/**
 * harness-portability spec (inline-conventions-and-mission): the canonical
 * template's required pieces — root-resolution rule, frontmatter schema
 * pointer, write-path rule, and the harness/store identity boundary — so an
 * agent that has read only this file, with no harness-specific context, has
 * everything it needs (the spec's own "Reading only AGENTS.md is
 * sufficient" scenario). The skill index this section used to carry is gone
 * (see the REMOVED "The skill index reflects the files on disk" requirement)
 * — on a harness with native skill auto-discovery it duplicated content
 * already in context; a harness without one still reaches every skill by
 * path at the configured skills path.
 */
export const AGENTS_MD_CANONICAL_FENCE = htmlCommentFence('canonical');

/**
 * context-organize spec, kept through inline-conventions-and-mission's
 * design decision "the identity/mission pointer coexists with the inlined
 * Mission section": when `organize.mission_path` is configured, the
 * canonical section still names it as a document to load at session start,
 * immediately followed (as its own fenced section — see
 * `renderMissionSection` below) by that document's full inlined body.
 * Nothing is rendered when unset: the `__MISSION_POINTER__` template line
 * disappears entirely (via `substituteBlock`'s empty-list case), not a
 * placeholder.
 */
function renderMissionPointer(config: StoreConfig): string[] {
  const { mission_path: missionPath } = config.organize;
  if (!missionPath) return [];
  return [
    '',
    `Load \`${missionPath}\` at the start of every session — this store's standing current-state document, ` +
      'kept current by the mission skill and written through `ctxr rollup write`; its full content follows in the "Mission" section below.',
  ];
}

export function renderCanonicalSection(config: StoreConfig): string[] {
  return substituteBlock(
    agentsTemplate('canonical')
      .replaceAll('__CONFIG_FILE_NAME__', CONFIG_FILE_NAME)
      .replaceAll('__SKILLS_PATH__', config.harness.skills_path),
    '__MISSION_POINTER__',
    renderMissionPointer(config),
  ).split('\n');
}

export async function buildAgentsCanonicalSection(root: string, config: StoreConfig): Promise<{ changed: boolean }> {
  return upsertFencedRegionInFile(agentsMdPath(root), AGENTS_MD_CANONICAL_FENCE, renderCanonicalSection(config));
}

/**
 * inline-conventions-and-mission: the store's current mission, inlined as
 * its own fenced section — replacing the pointer-only rendering this used to
 * get. `missionRaw` is the mission note's raw file content, read by the
 * caller (`buildAgentsMissionSection`) so this stays a pure, synchronous
 * renderer like every other section in this file; `null` means unconfigured
 * or the note doesn't exist, either of which renders nothing at all.
 */
export const AGENTS_MD_MISSION_FENCE = htmlCommentFence('mission');

export function renderMissionSection(config: StoreConfig, missionRaw: string | null): string[] {
  const { mission_path: missionPath } = config.organize;
  if (!missionPath || missionRaw === null) return [];
  const doc = extractDocMetadata(missionRaw, missionPath);
  return substituteBlock(
    agentsTemplate('mission').replaceAll('__MISSION_PATH__', missionPath),
    '__MISSION_BODY__',
    inlineDocBody(doc, 1),
  ).split('\n');
}

export async function buildAgentsMissionSection(root: string, config: StoreConfig): Promise<{ changed: boolean }> {
  const { mission_path: missionPath } = config.organize;
  let missionRaw: string | null = null;
  if (missionPath) {
    try {
      missionRaw = await readFile(path.join(root, missionPath), 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }
  const body = renderMissionSection(config, missionRaw);
  // `upsertFencedRegionInFile` appends a fence pair unconditionally when it's
  // absent, even with an empty body — wrong here, where "unconfigured" must
  // mean the section is absent entirely, never an empty fence pair. Removal
  // is idempotent (a no-op when the fence isn't there), so this also cleans
  // up correctly if a store had a mission configured and then unset it.
  if (body.length === 0) {
    return removeFencedRegionFromFile(agentsMdPath(root), AGENTS_MD_MISSION_FENCE);
  }
  return upsertFencedRegionInFile(agentsMdPath(root), AGENTS_MD_MISSION_FENCE, body);
}

/**
 * harness-portability spec (inline-conventions-and-mission, folded into one
 * template by compose-store-guidance-documents): operator conventions
 * inlined in full. What's on disk at the configured conventions path is
 * inlined body-and-all — heading-demoted under a heading naming its title,
 * with a provenance line naming its source path — never referenced by a
 * link alone; contexture ships no seeds here — conventions are
 * definitionally operator-authored, so an empty store gets an explanation of
 * the mechanism instead. One template (`conventions.md`) carries both: the
 * empty-vs-populated difference is entirely in the lines `renderConventionsSection`
 * computes for its one `__CONVENTION_BODY__` slot, so the surrounding frame
 * (heading, harness-specific-note paragraph) exists in exactly one place and
 * cannot drift between two copies the way it could when it shipped as two
 * separate template files.
 */
export const AGENTS_MD_CONVENTIONS_FENCE = htmlCommentFence('conventions');

/** Exported so doctor/verify can check a specific convention file's inlined block for drift without re-deriving the format. */
export function renderConventionBlock(doc: ScannedDoc): string[] {
  return [`### ${doc.title}`, '', ...inlineDocBody(doc, 2), '', `_Source: ${doc.path}_`];
}

function conventionsBody(config: StoreConfig, conventions: readonly ScannedDoc[]): string[] {
  if (conventions.length === 0) {
    return [
      'This store declares no convention documents yet. Operator-authored conventions (content style, field',
      `semantics, house rules) belong as markdown files under \`${config.harness.guidance_path}\` — each is`,
      'inlined here in full on regeneration.',
    ];
  }
  const blocks = conventions.map(renderConventionBlock);
  const bodies = blocks.flatMap((block, i) => (i === blocks.length - 1 ? block : [...block, '']));
  return ['Operator-authored conventions for this store, inlined in full:', '', ...bodies];
}

export function renderConventionsSection(config: StoreConfig, conventions: readonly ScannedDoc[]): string[] {
  return substituteBlock(agentsTemplate('conventions'), '__CONVENTION_BODY__', conventionsBody(config, conventions)).split('\n');
}

export async function buildAgentsConventionsSection(root: string, config: StoreConfig): Promise<{ changed: boolean }> {
  const conventions = await scanConventions(root, config);
  return upsertFencedRegionInFile(agentsMdPath(root), AGENTS_MD_CONVENTIONS_FENCE, renderConventionsSection(config, conventions));
}

/**
 * harness-portability spec: "Generated sections render in a fixed order" —
 * hard rules and current state first, operating mechanics next, the long
 * operator reference last. `reconcileStore` passes this straight to
 * `reorderFencedRegionsInFile`; a mission-less store simply never has the
 * mission fence present, which the reorder primitive already treats as
 * "skip it," not an error.
 */
export const AGENTS_MD_SECTION_ORDER = [
  AGENTS_MD_CANONICAL_FENCE,
  AGENTS_MD_MISSION_FENCE,
  AGENTS_MD_LEG_ROUTING_FENCE,
  AGENTS_MD_CAPTURE_FENCE,
  AGENTS_MD_PLACEMENT_FENCE,
  AGENTS_MD_CONVENTIONS_FENCE,
];

export interface AgentsMdDrift {
  /** Store-relative paths of convention files whose inlined block no longer matches the source. */
  driftedConventions: string[];
  /** The configured mission path, when its inlined section no longer matches the source; null otherwise. */
  driftedMission: string | null;
}

/**
 * harness-portability spec: "The entry document's inlined content matches
 * its sources" — shared by `ctxr doctor` (reports every drifted file) and
 * `ctxr verify --portable` (stops at the first one), per design.md's
 * "Drift detection reuses render, not a hash": re-runs the same renderers
 * `buildAgents*Section` uses and diffs against what is currently inside each
 * fence, rather than storing a separate content hash anywhere.
 */
export async function checkAgentsMdDrift(root: string, config: StoreConfig): Promise<AgentsMdDrift> {
  const filePath = agentsMdPath(root);

  const conventions = await scanConventions(root, config);
  const conventionsRegion = (await readFencedRegionFromFile(filePath, AGENTS_MD_CONVENTIONS_FENCE)).join('\n');
  const freshConventionsSection = renderConventionsSection(config, conventions).join('\n');
  const driftedConventions: string[] = [];
  if (freshConventionsSection !== conventionsRegion) {
    if (conventions.length === 0) {
      driftedConventions.push(config.harness.guidance_path);
    } else {
      for (const doc of conventions) {
        if (!conventionsRegion.includes(renderConventionBlock(doc).join('\n'))) driftedConventions.push(doc.path);
      }
      // Every individual block present, yet the whole section still differs
      // (a reordering, an added/removed file, a template change): still real
      // drift, just not attributable to one file — report the whole set.
      if (driftedConventions.length === 0) driftedConventions.push(...conventions.map((doc) => doc.path));
    }
  }

  let driftedMission: string | null = null;
  const missionPath = config.organize.mission_path;
  if (missionPath) {
    let missionRaw: string | null = null;
    try {
      missionRaw = await readFile(path.join(root, missionPath), 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
    const missionRegion = (await readFencedRegionFromFile(filePath, AGENTS_MD_MISSION_FENCE)).join('\n');
    const freshMissionSection = renderMissionSection(config, missionRaw).join('\n');
    if (freshMissionSection !== missionRegion) driftedMission = missionPath;
  }

  return { driftedConventions, driftedMission };
}
