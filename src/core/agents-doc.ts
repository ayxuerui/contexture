import path from 'node:path';
import type { StoreConfig } from '../config/schema.js';
import { CONFIG_FILE_NAME } from './root.js';
import { excludedPrefixesFor } from './notes/list.js';
import { procedurePaths, PROCEDURES } from './procedures.js';
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

/**
 * context-organize spec (task 7.1): the placement procedure is
 * documentation driven entirely by the configured taxonomy, never a
 * hardcoded layout — this section is generated purely from
 * `config.taxonomy.layers`, so it reads correctly under PARA, Zettelkasten,
 * Diátaxis, or any custom taxonomy without a single layer name appearing in
 * this file's own source.
 */
export const AGENTS_MD_PLACEMENT_FENCE = htmlCommentFence('placement');

export function renderPlacementSection(config: StoreConfig): string[] {
  const { layers } = config.taxonomy;
  if (layers.length === 0) {
    return [
      '## Placing a new note',
      '',
      'This store\'s taxonomy declares no top-level layers — place new notes directly at the store root (or',
      'wherever related notes already live) and rely on wikilinks and `contexture graph` for organization,',
      'rather than a folder hierarchy.',
    ];
  }

  const lines = [
    '## Placing a new note',
    '',
    'This store\'s taxonomy declares these layers — choose the one whose description best matches the note:',
    '',
  ];
  for (const layer of layers) {
    const directoryDefault = Object.entries(config.visibility.directory_defaults).find(
      ([prefix]) => prefix === layer.path || prefix === `${layer.path}/`,
    )?.[1];
    lines.push(
      `- **${layer.name}** (\`${layer.path}/\`): ${layer.description}${
        directoryDefault ? ` Notes here default to visibility "${directoryDefault}" unless given an explicit value.` : ''
      }`,
    );
  }
  lines.push('', "If no layer fits, use the store's uncategorized/catch-all location and revisit placement later.");
  return lines;
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

export function renderCanonicalSection(config: StoreConfig): string[] {
  const lines = [
    '## Store fundamentals',
    '',
    '### Root resolution',
    '',
    `Every contexture command resolves the store root in this order: an explicit `+
      '`--root <path>` flag; the `CONTEXTURE_ROOT` environment variable; walking up from the current directory ' +
      `looking for \`${CONFIG_FILE_NAME}\`. No other flag or environment variable selects the root.`,
    '',
    '### Frontmatter schema',
    '',
    `- Visibility field: \`${config.fields.visibility}:\` — resolves explicit value, then directory default, then the ` +
      `configured fail-closed default (\`${config.visibility.default_context}\`). See \`contexture note resolve <path>\`.`,
    '- Source-identity fields (assigned only by `contexture ingest`, never hand-written): `source_type`, `source_id`, `source_hash`, `ingested`.',
    '- Disclosure audience tags (optional, hand-written): `audience: [<name>, ...]`.',
    '',
    '### Write path',
    '',
    'Every write to this store happens inside a session worktree, never directly on the default branch: `contexture ' +
      'session start` creates one, then `contexture session submit` validates, commits, pushes, and opens (or ' +
      'reports how to open) a pull request. Do not edit files in the store root directly.',
    '',
    '### Procedure index',
    '',
    'Judgment-driven operations, documented as portable markdown under ' +
      `\`${config.harness.procedures_path}\` — read one directly, no harness-specific discovery required:`,
    '',
  ];
  const paths = procedurePaths(config);
  PROCEDURES.forEach((procedure, i) => {
    lines.push(`- [${procedure.name}](${paths[i]})`);
  });
  return lines;
}

export async function buildAgentsCanonicalSection(root: string, config: StoreConfig): Promise<{ changed: boolean }> {
  return upsertFencedRegionInFile(agentsMdPath(root), AGENTS_MD_CANONICAL_FENCE, renderCanonicalSection(config));
}
