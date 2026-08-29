import path from 'node:path';
import type { StoreConfig } from '../config/schema.js';
import { excludedPrefixesFor } from './notes/list.js';
import { upsertFencedRegionInFile } from './fs/fenced-region.js';
import { htmlCommentFence } from './markers.js';

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

export function agentsMdPath(root: string): string {
  return path.join(root, 'AGENTS.md');
}

export function renderLegRoutingSection(config: StoreConfig): string[] {
  const exclusions = [...new Set(excludedPrefixesFor(config))];
  return [
    '## Retrieval: which leg to use',
    '',
    'contexture builds and maintains two retrieval tools ahead of time — consult them first:',
    '',
    '- **Catalog** (`contexture catalog show --section <id>`): a curated, coverage-guaranteed index of every retrievable note, one section per taxonomy layer.',
    '- **Graph** (`contexture graph query ...`): the wikilink graph between notes — neighbors, shortest path, hubs, orphans.',
    '',
    'For a literal or entity question the catalog and graph do not answer (a specific string, an exact identifier, a phrase),',
    'use your own direct content-matching tool (e.g. grep/ripgrep) against the store, scoped to exclude:',
    '',
    ...exclusions.map((prefix) => `- \`${prefix}\``),
    '',
    'There is no `contexture search` command. Ranked or semantic search is deferred to a future version — do not look for one.',
  ];
}

/** Idempotently reconciles AGENTS.md's leg-routing section from current config — called at init and on re-init. */
export async function buildAgentsLegRoutingSection(root: string, config: StoreConfig): Promise<{ changed: boolean }> {
  return upsertFencedRegionInFile(agentsMdPath(root), AGENTS_MD_LEG_ROUTING_FENCE, renderLegRoutingSection(config));
}

/**
 * context-ingest spec (task 6.3): capture is a plain file write an agent
 * does directly with its own tools — no CLI command wraps it, the same
 * "agents gather, the CLI computes/writes/verifies" split that dropped
 * `contexture search`. This section documents the one rule that write must
 * follow, so it isn't only tribal knowledge: no source-identity fields, and
 * where the file goes.
 */
export const AGENTS_MD_CAPTURE_FENCE = htmlCommentFence('capture-and-ingest');

export function renderCaptureSection(config: StoreConfig): string[] {
  return [
    '## Capturing and ingesting new material',
    '',
    `To capture something new, write a plain markdown file directly into \`${config.ingest.inbox_path}\` —`,
    'no CLI command wraps this. That file MUST NOT contain any of these frontmatter fields; contexture assigns',
    'them once, at ingest, and never before:',
    '',
    '- `source_type`',
    '- `source_id`',
    '- `source_hash`',
    '- `ingested`',
    '',
    'Before ingesting, run `contexture source check <path> --source-id <id>` to get one of four verdicts:',
    '`new`, `already_ingested`, `alternate_source_match`, or `multiple_matches` — the last one means stop and',
    'resolve the ambiguity yourself rather than guessing which existing note it is.',
    '',
    'To ingest, run `contexture ingest <path> --source-type <type> --source-id <id>`. It stamps the four fields',
    'above onto the file in place and rebuilds the catalog, so the result already has a catalog entry.',
  ];
}

export async function buildAgentsCaptureSection(root: string, config: StoreConfig): Promise<{ changed: boolean }> {
  return upsertFencedRegionInFile(agentsMdPath(root), AGENTS_MD_CAPTURE_FENCE, renderCaptureSection(config));
}
