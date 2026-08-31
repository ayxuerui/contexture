import path from 'node:path';
import type { StoreConfig } from '../config/schema.js';
import { GRAPH_DOCUMENT_RELATIVE_PATH } from './graph/persist.js';
import { CONFIG_FILE_NAME } from './root.js';
import { excludedPrefixesFor } from './notes/list.js';
import { scanConventions, type ScannedDoc } from './conventions.js';
import { scanProcedures } from './procedures.js';
import { upsertFencedRegionInFile } from './fs/fenced-region.js';
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

/** The one index-entry format both the procedure and convention indexes use. */
function docIndexEntry(doc: ScannedDoc): string {
  return `- [${doc.title}](${doc.path})${doc.description ? ` — ${doc.description}` : ''}`;
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
 * other sections (root-resolution, frontmatter schema, write-path, procedure
 * index) as sibling regions in the same file, never touching this one.
 */
export const AGENTS_MD_LEG_ROUTING_FENCE = htmlCommentFence('retrieval-leg-routing');

export function renderLegRoutingSection(config: StoreConfig): string[] {
  const exclusions = [...new Set(excludedPrefixesFor(config))];
  return substituteBlock(
    agentsTemplate('retrieval-leg-routing').replaceAll('__GRAPH_DOCUMENT_PATH__', GRAPH_DOCUMENT_RELATIVE_PATH),
    '__EXCLUSION_PATHS__',
    exclusions.map((prefix) => `- \`${prefix}\``),
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
 * context-organize spec (task 7.1): the placement procedure is
 * documentation driven entirely by the configured taxonomy, never a
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

  const layerLines = layers.map((layer) => {
    const directoryDefault = Object.entries(config.visibility.directory_defaults).find(
      ([prefix]) => prefix === layer.path || prefix === `${layer.path}/`,
    )?.[1];
    return `- **${layer.name}** (\`${layer.path}/\`): ${layer.description}${
      directoryDefault ? ` Notes here default to visibility "${directoryDefault}" unless given an explicit value.` : ''
    }`;
  });
  return substituteBlock(agentsTemplate('placement'), '__LAYER_LIST__', layerLines).split('\n');
}

export async function buildAgentsPlacementSection(root: string, config: StoreConfig): Promise<{ changed: boolean }> {
  return upsertFencedRegionInFile(agentsMdPath(root), AGENTS_MD_PLACEMENT_FENCE, renderPlacementSection(config));
}

/**
 * harness-portability spec (task 8.5): the canonical template's four
 * required pieces — root-resolution rule, frontmatter schema pointer,
 * write-path rule, and a procedure index — so an agent that has read only
 * this file, with no harness-specific context, has everything it needs
 * (the spec's own "Reading only AGENTS.md is sufficient" scenario).
 */
export const AGENTS_MD_CANONICAL_FENCE = htmlCommentFence('canonical');

export function renderCanonicalSection(config: StoreConfig, procedures: readonly ScannedDoc[]): string[] {
  const text = agentsTemplate('canonical')
    .replaceAll('__CONFIG_FILE_NAME__', CONFIG_FILE_NAME)
    .replaceAll('__VISIBILITY_FIELD__', config.fields.visibility)
    .replaceAll('__DEFAULT_CONTEXT__', config.visibility.default_context)
    .replaceAll('__PROCEDURES_PATH__', config.harness.procedures_path);
  return substituteBlock(text, '__PROCEDURE_INDEX__', procedures.map(docIndexEntry)).split('\n');
}

export async function buildAgentsCanonicalSection(root: string, config: StoreConfig): Promise<{ changed: boolean }> {
  const procedures = await scanProcedures(root, config);
  return upsertFencedRegionInFile(agentsMdPath(root), AGENTS_MD_CANONICAL_FENCE, renderCanonicalSection(config, procedures));
}

/**
 * entry-doc-generation spec: operator conventions as referenced documents.
 * The index lists what is actually on disk at the configured conventions
 * path; contexture ships no seeds here — conventions are definitionally
 * operator-authored, so an empty store gets its own template explaining the
 * mechanism. Both templates end with the same harness-specific-note
 * paragraph; a test asserts they stay byte-identical.
 */
export const AGENTS_MD_CONVENTIONS_FENCE = htmlCommentFence('store-conventions');

export function renderConventionsSection(config: StoreConfig, conventions: readonly ScannedDoc[]): string[] {
  if (conventions.length === 0) {
    return agentsTemplate('store-conventions-empty')
      .replaceAll('__CONVENTIONS_PATH__', config.harness.conventions_path)
      .split('\n');
  }
  return substituteBlock(
    agentsTemplate('store-conventions'),
    '__CONVENTION_INDEX__',
    conventions.map(docIndexEntry),
  ).split('\n');
}

export async function buildAgentsConventionsSection(root: string, config: StoreConfig): Promise<{ changed: boolean }> {
  const conventions = await scanConventions(root, config);
  return upsertFencedRegionInFile(agentsMdPath(root), AGENTS_MD_CONVENTIONS_FENCE, renderConventionsSection(config, conventions));
}
