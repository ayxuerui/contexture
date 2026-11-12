import type { CommandOutcome, CommandRequires } from '../core/command.js';
import type { Finding } from '../core/envelope.js';
import { ExitCode } from '../core/exit-codes.js';
import type { GraphBuildResult } from '../core/graph/model.js';
import { renderGraphDocument, type GraphDocumentSummary } from '../core/graph/document.js';
import { GRAPH_DOCUMENT_RELATIVE_PATH, writeGraph, writeGraphDocument } from '../core/graph/persist.js';
import { buildPerNoteRecords, type PerNoteRecord } from '../core/records.js';
import { buildReadViewGraph, unavailableMounts, type UnavailableMount } from '../core/shared-stores.js';
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
  /** mount-shared-stores: declared mounts the read view could not include. Absent for a store with no mounts. */
  unavailableMounts?: UnavailableMount[];
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
  const { graph, view } = await buildReadViewGraph(store.root, store.config);
  const unavailable = unavailableMounts(view.mounts);
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
  for (const mount of unavailable) {
    findings.push({
      code: 'shared_stores.mount_unavailable',
      severity: 'warning',
      message:
        mount.state === 'absent'
          ? `Mount "${mount.name}" is not cloned at ${mount.location}, so its notes are not in the graph. Run \`ctxr shared-stores sync\`.`
          : `Mount "${mount.name}" at ${mount.location} is not a store (${mount.reason}), so its notes are not in the graph.`,
      subject: mount.location,
    });
  }

  return {
    exitCode: ExitCode.Ok,
    data: { nodeCount: graph.nodes.length, edgeCount: graph.edges.length, dangling: graph.dangling, document: { path: GRAPH_DOCUMENT_RELATIVE_PATH, ...summary }, records, ...(view.mounts.length > 0 ? { unavailableMounts: unavailable } : {}) },
    findings,
    humanSummary: `Graph built: ${graph.nodes.length} node(s), ${graph.edges.length} edge(s) (${summary.typedLinks} typed), ${graph.dangling.length} dangling link(s); ${summary.clusters} cluster(s), ${summary.bridges} bridge(s), ${summary.orphans} orphan(s) → ${GRAPH_DOCUMENT_RELATIVE_PATH}.`,
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}
