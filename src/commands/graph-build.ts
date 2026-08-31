import type { CommandOutcome, CommandRequires } from '../core/command.js';
import type { Finding } from '../core/envelope.js';
import { ExitCode } from '../core/exit-codes.js';
import { buildGraphFromNotes, graphBuildOptions, type GraphBuildResult } from '../core/graph/model.js';
import { renderGraphDocument, type GraphDocumentSummary } from '../core/graph/document.js';
import { GRAPH_DOCUMENT_RELATIVE_PATH, writeGraph, writeGraphDocument } from '../core/graph/persist.js';
import { listNotes } from '../core/notes/list.js';
import { buildPerNoteRecords, type PerNoteRecord } from '../core/records.js';
import type { Store } from '../core/store.js';

export const requires: CommandRequires = { store: 'required' };

export interface GraphBuildFlags {
  emitRecords?: boolean;
}

export interface GraphBuildData {
  nodeCount: number;
  edgeCount: number;
  dangling: GraphBuildResult['dangling'];
  /** graph-context-document spec: where the human-readable render went, and what each section holds. */
  document: { path: string } & GraphDocumentSummary;
  records?: PerNoteRecord[];
}

/**
 * context-retrieval spec: node identity is path-based, so a genuine identity
 * collision is structurally unreachable through a real note listing —
 * `buildGraphFromNotes` throwing here is a defensive invariant, not a
 * scenario this command tries to recover from. A dangling link (unresolved
 * or ambiguous wikilink target) is the opposite: expected, non-fatal, and
 * reported as a finding rather than failing the build.
 */
export async function execute(store: Store, flags: GraphBuildFlags = {}): Promise<CommandOutcome<GraphBuildData>> {
  const notes = await listNotes(store.root, store.config);
  const graph = buildGraphFromNotes(notes, graphBuildOptions(store.config));
  await writeGraph(store, graph);
  const { text, summary } = renderGraphDocument(graph, store.config.retrieval.graph);
  await writeGraphDocument(store, text);

  const records = flags.emitRecords ? await buildPerNoteRecords(store) : undefined;

  const findings: Finding[] = graph.dangling.map((d) => ({
    code: 'graph.dangling_link',
    severity: 'warning' as const,
    message: `"${d.from}" links to "${d.target}", which is ${d.reason === 'ambiguous' ? 'ambiguous (multiple notes share that name)' : 'not found'}.`,
    subject: d.from,
    details: { target: d.target, reason: d.reason },
  }));

  return {
    exitCode: ExitCode.Ok,
    data: { nodeCount: graph.nodes.length, edgeCount: graph.edges.length, dangling: graph.dangling, document: { path: GRAPH_DOCUMENT_RELATIVE_PATH, ...summary }, records },
    findings,
    humanSummary: `Graph built: ${graph.nodes.length} node(s), ${graph.edges.length} edge(s) (${summary.typedLinks} typed), ${graph.dangling.length} dangling link(s); ${summary.clusters} cluster(s), ${summary.bridges} bridge(s), ${summary.orphans} orphan(s) → ${GRAPH_DOCUMENT_RELATIVE_PATH}.`,
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}
