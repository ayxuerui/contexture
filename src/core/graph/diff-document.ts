import path from 'node:path';
import { LINK_EDGE_TYPE, type GraphEdge } from './model.js';
import { isEmptyDelta, type GraphDelta } from './diff.js';

/**
 * review-the-knowledge-diff (D5): one render of a delta, used by the command's
 * human summary and by the review view — one derivation, two renders, the
 * same pattern as `graph.json` / `graph.md`. It carries only what the delta
 * carries: paths, link targets, edge types, counts and source entries, never a
 * note body, and no text an agent wrote about the change.
 *
 * The document is a list of parts rather than one string because the review
 * view renders markdown with `html: false`: a `<details>` group is emitted by
 * the caller around its rendered markdown, not parsed out of it. `toMarkdown`
 * writes each group under a `##` heading instead, because its reader is a
 * terminal, where a literal `<details>` tag is noise.
 */
export type DiffDocumentPart = { kind: 'markdown'; text: string } | { kind: 'details'; summary: string; text: string };

export interface DiffDocumentOptions {
  /** The href for a path the caller can serve, or null to leave it as text. Absent: no path is linked. */
  linkFor?: (notePath: string) => string | null;
  /** Append the link-delta diagram (D8). The human summary omits it. */
  diagram?: boolean;
}

/** D8: past this many changed links the diagram is replaced by one line, so it never becomes unreadable. */
export const MAX_DIAGRAM_EDGES = 50;

/** A code span that survives any backtick run in the text, with table pipes escaped. */
function code(text: string): string {
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map((match) => match[0].length));
  const fence = '`'.repeat(longest + 1);
  const padded = text.startsWith('`') || text.endsWith('`') ? ` ${text} ` : text;
  return `${fence}${padded.replace(/\|/g, '\\|')}${fence}`;
}

function pathCell(notePath: string, options: DiffDocumentOptions): string {
  const href = options.linkFor?.(notePath) ?? null;
  return href === null ? code(notePath) : `[${code(notePath)}](${href})`;
}

function table(header: readonly string[], rows: readonly (readonly string[])[]): string {
  return [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`, ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n');
}

const REASON_TEXT: Readonly<Record<string, string>> = { not_found: 'not found', ambiguous: 'ambiguous' };

function stemOf(notePath: string): string {
  return path.posix.basename(notePath, '.md');
}

/** Mermaid's entity form, so a label's quotes, brackets and pipes cannot end the label early. */
function mermaidLabel(text: string): string {
  return text.replace(/[#"<>|[\]{}()]/g, (ch) => `#${ch.charCodeAt(0)};`);
}

/** D8: added links solid, removed links dashed, nodes labelled by stem; edge types label a typed link. */
export function renderDiagram(added: readonly GraphEdge[], removed: readonly GraphEdge[]): string | null {
  const changed = added.length + removed.length;
  if (changed === 0) return null;
  if (changed > MAX_DIAGRAM_EDGES) {
    return `The link delta has ${changed} changed links, more than the diagram draws (${MAX_DIAGRAM_EDGES}); the tables above list every one.`;
  }
  const ids = new Map<string, string>();
  for (const edge of [...added, ...removed]) {
    for (const notePath of [edge.src, edge.dst]) if (!ids.has(notePath)) ids.set(notePath, `n${ids.size}`);
  }
  const arrow = (edge: GraphEdge, solid: boolean): string => {
    const label = edge.type === LINK_EDGE_TYPE ? '' : `|${mermaidLabel(edge.type)}|`;
    return `  ${ids.get(edge.src)} ${solid ? '-->' : '-.->'}${label} ${ids.get(edge.dst)}`;
  };
  return [
    '```mermaid',
    'flowchart LR',
    ...[...ids].map(([notePath, id]) => `  ${id}["${mermaidLabel(stemOf(notePath))}"]`),
    ...added.map((edge) => arrow(edge, true)),
    ...removed.map((edge) => arrow(edge, false)),
    '```',
  ].join('\n');
}

export function renderDiffParts(delta: GraphDelta, options: DiffDocumentOptions = {}): DiffDocumentPart[] {
  const cell = (notePath: string): string => pathCell(notePath, options);
  const parts: DiffDocumentPart[] = [
    {
      kind: 'markdown',
      text: ['# Knowledge changes', '', `- Base commit: ${code(delta.base)}`, `- Head commit: ${code(delta.head)}`].join('\n'),
    },
  ];
  if (isEmptyDelta(delta)) {
    parts.push({ kind: 'markdown', text: 'No knowledge changes: this range changes no note.' });
    return parts;
  }

  const c = delta.counts;
  parts.push({
    kind: 'markdown',
    text: table(
      ['Kind', 'Count'],
      [
        ['Notes added', String(c.notes_added)],
        ['Notes removed', String(c.notes_removed)],
        ['Notes modified', String(c.notes_modified)],
        ['Notes moved', String(c.notes_moved)],
        ['Notes archived', String(c.notes_archived)],
        ['Links added', String(c.links_added)],
        ['Links removed', String(c.links_removed)],
        ['Dangling links introduced', String(c.dangling_introduced)],
        ['Dangling links resolved', String(c.dangling_resolved)],
        ['Notes whose inbound links changed', String(c.inbound_changed)],
        ['Rollups touched', String(c.rollups_touched)],
        ['Notes citing new sources', String(c.sources_cited)],
      ],
    ),
  });

  const group = (summary: string, count: number, text: string): void => {
    if (count > 0) parts.push({ kind: 'details', summary: `${summary} (${count})`, text });
  };
  const edgeRows = (edges: readonly GraphEdge[]) => edges.map((e) => [cell(e.src), cell(e.dst), code(e.type)]);
  const danglingRows = (links: GraphDelta['dangling']['introduced']) =>
    links.map((d) => [cell(d.from), code(d.target), REASON_TEXT[d.reason] ?? d.reason]);

  group('Notes added', c.notes_added, table(['Note'], delta.notes.added.map((p) => [cell(p)])));
  group('Notes removed', c.notes_removed, table(['Note'], delta.notes.removed.map((p) => [code(p)])));
  group('Notes modified', c.notes_modified, table(['Note'], delta.notes.modified.map((p) => [cell(p)])));
  group('Notes moved', c.notes_moved, table(['From', 'To'], delta.notes.moved.map((r) => [code(r.from), cell(r.to)])));
  group('Notes archived', c.notes_archived, table(['From', 'To'], delta.notes.archived.map((r) => [code(r.from), cell(r.to)])));
  group('Links added', c.links_added, table(['From', 'To', 'Type'], edgeRows(delta.links.added)));
  group('Links removed', c.links_removed, table(['From', 'To', 'Type'], edgeRows(delta.links.removed)));
  group('Dangling links introduced', c.dangling_introduced, table(['From', 'Target', 'Reason'], danglingRows(delta.dangling.introduced)));
  group('Dangling links resolved', c.dangling_resolved, table(['From', 'Target', 'Reason'], danglingRows(delta.dangling.resolved)));
  group(
    'Notes whose inbound links changed',
    c.inbound_changed,
    table(
      ['Note', 'Gained from', 'Lost from', 'Has rollup'],
      delta.inbound.map((i) => [cell(i.path), i.gained.map(code).join(', '), i.lost.map(code).join(', '), i.rollup ? 'yes' : 'no']),
    ),
  );
  group('Rollups touched', c.rollups_touched, table(['Note', 'Region'], delta.rollups.map((r) => [cell(r.path), r.change])));
  group(
    'Sources newly cited',
    c.sources_cited,
    table(['Note', 'Sources'], delta.sources.map((s) => [cell(s.path), s.cited.map(code).join(', ')])),
  );

  if (options.diagram) {
    const diagram = renderDiagram(delta.links.added, delta.links.removed);
    if (diagram !== null) parts.push({ kind: 'markdown', text: ['## Link delta', '', diagram].join('\n') });
  }
  return parts;
}

/** The parts as one markdown document, each group under a `##` heading naming it and its count. */
export function toMarkdown(parts: readonly DiffDocumentPart[]): string {
  return parts.map((part) => (part.kind === 'markdown' ? part.text : [`## ${part.summary}`, '', part.text].join('\n'))).join('\n\n');
}

export function renderDiffDocument(delta: GraphDelta, options: DiffDocumentOptions = {}): string {
  return `${toMarkdown(renderDiffParts(delta, options))}\n`;
}
