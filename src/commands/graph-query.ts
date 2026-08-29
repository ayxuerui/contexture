import type { CommandOutcome, CommandRequires } from '../core/command.js';
import { GraphNodeNotFoundError, GraphNotBuiltError } from '../core/errors.js';
import { ExitCode } from '../core/exit-codes.js';
import type { Direction, HubEntry } from '../core/graph/query.js';
import { hubs, neighbors, orphans, shortestPath, subgraph } from '../core/graph/query.js';
import type { GraphBuildResult } from '../core/graph/model.js';
import { readGraph } from '../core/graph/persist.js';
import { filterGraphByAudience } from '../core/graph/visibility-filter.js';
import type { Store } from '../core/store.js';

export const requires: CommandRequires = { store: 'required' };

/**
 * context-visibility spec: when `--as <context>` is given, the graph is
 * filtered to only nodes visible to that context BEFORE any traversal runs
 * — see filterGraphByAudience. Every subcommand below routes through this
 * one loader so none of them can accidentally query the unfiltered graph.
 */
async function loadGraph(store: Store, as?: string): Promise<GraphBuildResult> {
  const graph = await readGraph(store);
  if (!graph) throw new GraphNotBuiltError();
  return as ? filterGraphByAudience(store, graph, as) : graph;
}

function assertNode(graph: GraphBuildResult, nodeId: string): void {
  if (!graph.nodes.some((n) => n.id === nodeId)) throw new GraphNodeNotFoundError(nodeId);
}

function outcome<TData>(store: Store, data: TData, humanSummary: string): CommandOutcome<TData> {
  return {
    exitCode: ExitCode.Ok,
    data,
    findings: [],
    humanSummary,
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}

export interface NeighborsFlags {
  node: string;
  depth?: number;
  direction?: Direction;
  as?: string;
}

export async function executeNeighbors(
  store: Store,
  flags: NeighborsFlags,
): Promise<CommandOutcome<{ neighbors: string[] }>> {
  const graph = await loadGraph(store, flags.as);
  assertNode(graph, flags.node);
  const result = neighbors(graph, flags.node, { depth: flags.depth, direction: flags.direction });
  return outcome(store, { neighbors: result }, `${result.length} neighbor(s) of "${flags.node}".`);
}

export interface PathFlags {
  from: string;
  to: string;
  as?: string;
}

export async function executePath(
  store: Store,
  flags: PathFlags,
): Promise<CommandOutcome<{ path: string[] | null }>> {
  const graph = await loadGraph(store, flags.as);
  assertNode(graph, flags.from);
  assertNode(graph, flags.to);
  const result = shortestPath(graph, flags.from, flags.to);
  return outcome(
    store,
    { path: result },
    result ? `Path: ${result.join(' -> ')}` : `No path from "${flags.from}" to "${flags.to}".`,
  );
}

export interface SubgraphFlags {
  ids: string[];
  as?: string;
}

export async function executeSubgraph(store: Store, flags: SubgraphFlags): Promise<CommandOutcome<GraphBuildResult>> {
  const graph = await loadGraph(store, flags.as);
  for (const id of flags.ids) assertNode(graph, id);
  const result = subgraph(graph, flags.ids);
  return outcome(store, result, `Subgraph: ${result.nodes.length} node(s), ${result.edges.length} edge(s).`);
}

export interface HubsFlags {
  top?: number;
  as?: string;
}

export async function executeHubs(store: Store, flags: HubsFlags = {}): Promise<CommandOutcome<{ hubs: HubEntry[] }>> {
  const graph = await loadGraph(store, flags.as);
  const result = hubs(graph, flags.top ?? 10);
  return outcome(store, { hubs: result }, `Top ${result.length} hub(s) by backlink count.`);
}

export interface OrphansFlags {
  as?: string;
}

export async function executeOrphans(store: Store, flags: OrphansFlags = {}): Promise<CommandOutcome<{ orphans: string[] }>> {
  const graph = await loadGraph(store, flags.as);
  const result = orphans(graph);
  return outcome(store, { orphans: result }, `${result.length} orphan node(s) (no links in or out).`);
}
