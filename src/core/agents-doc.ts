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
