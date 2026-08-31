import path from 'node:path';
import type { StoreConfig } from '../config/schema.js';
import { GRAPH_DOCUMENT_RELATIVE_PATH } from './graph/persist.js';
import { CONFIG_FILE_NAME } from './root.js';
import { excludedPrefixesFor } from './notes/list.js';
import { scanConventions, type ScannedDoc } from './conventions.js';
import { identityFilePaths } from './identity.js';
import { scanProcedures } from './procedures.js';
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
    '- **Catalog** (`ctxr catalog show --section <id>`): a curated, coverage-guaranteed index of every retrievable note, one section per taxonomy layer.',
    '- **Graph** (`ctxr graph query ...`): the wikilink graph between notes — neighbors, shortest path, hubs, orphans, clusters, bridges; `--type <relation>` follows one configured relation.',
    `- **Graph document** (\`${GRAPH_DOCUMENT_RELATIVE_PATH}\`, rebuilt by \`ctxr graph build\`): hub notes by cluster, cross-cluster bridges, and orphans — read it for cluster context before writing.`,
    '',
    'For a literal or entity question the catalog and graph do not answer (a specific string, an exact identifier, a phrase),',
    'use your own direct content-matching tool (e.g. grep/ripgrep) against the store, scoped to exclude:',
    '',
    ...exclusions.map((prefix) => `- \`${prefix}\``),
    '',
    'There is no `ctxr search` command. Ranked or semantic search is deferred to a future version — do not look for one.',
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
 * `ctxr search`. This section documents the one rule that write must
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
    'Before ingesting, run `ctxr source check <path> --source-id <id>` to get one of four verdicts:',
    '`new`, `already_ingested`, `alternate_source_match`, or `multiple_matches` — the last one means stop and',
    'resolve the ambiguity yourself rather than guessing which existing note it is.',
    '',
    'To ingest, run `ctxr ingest <path> --source-type <type> --source-id <id>`. It stamps the four fields',
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
      'wherever related notes already live) and rely on wikilinks and `ctxr graph` for organization,',
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

export function renderCanonicalSection(config: StoreConfig, procedures: readonly ScannedDoc[]): string[] {
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
      `configured fail-closed default (\`${config.visibility.default_context}\`). See \`ctxr note resolve <path>\`.`,
    '- Source-identity fields (assigned only by `ctxr ingest`, never hand-written): `source_type`, `source_id`, `source_hash`, `ingested`.',
    '- Disclosure audience tags (optional, hand-written): `audience: [<name>, ...]`.',
    '',
    '### Write path',
    '',
    'Every write to this store happens inside a session worktree, never directly on the default branch: `ctxr ' +
      'session start` creates one, then `ctxr session submit` validates, commits, pushes, and opens (or ' +
      'reports how to open) a pull request. Do not edit files in the store root directly.',
    '',
    '### Procedure index',
    '',
    'Judgment-driven operations, documented as portable markdown under ' +
      `\`${config.harness.procedures_path}\` — read one directly, no harness-specific discovery required:`,
    '',
  ];
  for (const procedure of procedures) {
    lines.push(`- [${procedure.title}](${procedure.path})${procedure.description ? ` — ${procedure.description}` : ''}`);
  }
  return lines;
}

export async function buildAgentsCanonicalSection(root: string, config: StoreConfig): Promise<{ changed: boolean }> {
  const procedures = await scanProcedures(root, config);
  return upsertFencedRegionInFile(agentsMdPath(root), AGENTS_MD_CANONICAL_FENCE, renderCanonicalSection(config, procedures));
}

/**
 * entry-doc-generation spec: operator conventions as referenced documents.
 * The index lists what is actually on disk at the configured conventions
 * path; contexture ships no seeds here — conventions are definitionally
 * operator-authored, so an empty store's section explains the mechanism.
 */
export const AGENTS_MD_CONVENTIONS_FENCE = htmlCommentFence('store-conventions');

export function renderConventionsSection(config: StoreConfig, conventions: readonly ScannedDoc[]): string[] {
  const lines = ['## Store conventions', ''];
  if (conventions.length === 0) {
    lines.push(
      `This store declares no convention documents yet. Operator-authored conventions (content style, field`,
      `semantics, house rules) belong as markdown files under \`${config.harness.conventions_path}\` — each is`,
      'indexed here on regeneration, referenced by path, never inlined.',
    );
    return lines;
  }
  lines.push('Operator-authored conventions for this store — read the ones relevant to your task:', '');
  for (const doc of conventions) {
    lines.push(`- [${doc.title}](${doc.path})${doc.description ? ` — ${doc.description}` : ''}`);
  }
  return lines;
}

export async function buildAgentsConventionsSection(root: string, config: StoreConfig): Promise<{ changed: boolean }> {
  const conventions = await scanConventions(root, config);
  return upsertFencedRegionInFile(agentsMdPath(root), AGENTS_MD_CONVENTIONS_FENCE, renderConventionsSection(config, conventions));
}

/**
 * agent-identity spec (contexture-home-layout): identity reachable open-box
 * — a harness with no identity-injection adapter that reads only AGENTS.md
 * still learns which files carry identity and that they load at session
 * start. References by path only, never inlined content, so editing an
 * identity file never requires regenerating this section.
 */
export const AGENTS_MD_IDENTITY_FENCE = htmlCommentFence('agent-identity');

export function renderIdentitySection(config: StoreConfig): string[] {
  const paths = identityFilePaths(config);
  return [
    '## Agent identity — load at session start',
    '',
    'This store carries durable agent identity as plain files. Before doing anything else in a session,',
    'read all three (harnesses with a native injection mechanism may already have loaded them for you):',
    '',
    ...paths.map((p) => `- \`${p}\``),
    '',
    'They are identity, not knowledge: excluded from every retrieval leg, and never edited as part of',
    'ordinary note work.',
  ];
}

export async function buildAgentsIdentitySection(root: string, config: StoreConfig): Promise<{ changed: boolean }> {
  return upsertFencedRegionInFile(agentsMdPath(root), AGENTS_MD_IDENTITY_FENCE, renderIdentitySection(config));
}
