import type { CommandOutcome, CommandRequires } from '../core/command.js';
import { GraphNodeNotFoundError, GraphNotBuiltError } from '../core/errors.js';
import { ExitCode } from '../core/exit-codes.js';
import type { Direction, HubEntry } from '../core/graph/query.js';
import {
  bridges,
  clusters,
  hubs,
  neighbors,
  orphans,
  shortestPath,
  subgraph,
  type BridgeEntry,
  type ClusterEntry,
} from '../core/graph/query.js';
import type { GraphBuildResult } from '../core/graph/model.js';
import { readGraph } from '../core/graph/persist.js';
import type { Store } from '../core/store.js';

export const requires: CommandRequires = { store: 'required' };

/**
 * Every subcommand below routes through this one loader, so a query can
 * never read a graph the store has not built.
 */
async function loadGraph(store: Store): Promise<GraphBuildResult> {
  const graph = await readGraph(store);
  if (!graph) throw new GraphNotBuiltError();
  return graph;
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
  type?: string;
}

export async function executeNeighbors(
  store: Store,
  flags: NeighborsFlags,
): Promise<CommandOutcome<{ neighbors: string[] }>> {
  const graph = await loadGraph(store);
  assertNode(graph, flags.node);
  const result = neighbors(graph, flags.node, { depth: flags.depth, direction: flags.direction, type: flags.type });
  return outcome(store, { neighbors: result }, `${result.length} neighbor(s) of "${flags.node}".`);
}

export interface PathFlags {
  from: string;
  to: string;
}

export async function executePath(
  store: Store,
  flags: PathFlags,
): Promise<CommandOutcome<{ path: string[] | null }>> {
  const graph = await loadGraph(store);
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
}

export async function executeSubgraph(store: Store, flags: SubgraphFlags): Promise<CommandOutcome<GraphBuildResult>> {
  const graph = await loadGraph(store);
  for (const id of flags.ids) assertNode(graph, id);
  const result = subgraph(graph, flags.ids);
  return outcome(store, result, `Subgraph: ${result.nodes.length} node(s), ${result.edges.length} edge(s).`);
}

export interface HubsFlags {
  top?: number;
}

export async function executeHubs(store: Store, flags: HubsFlags = {}): Promise<CommandOutcome<{ hubs: HubEntry[] }>> {
  const graph = await loadGraph(store);
  const result = hubs(graph, flags.top ?? 10);
  return outcome(store, { hubs: result }, `Top ${result.length} hub(s) by backlink count.`);
}

export type OrphansFlags = Record<string, never>;

export async function executeOrphans(store: Store, flags: OrphansFlags = {}): Promise<CommandOutcome<{ orphans: string[] }>> {
  const graph = await loadGraph(store);
  const result = orphans(graph);
  return outcome(store, { orphans: result }, `${result.length} orphan node(s) (no links in or out).`);
}

export type ClustersFlags = Record<string, never>;

export async function executeClusters(
  store: Store,
  flags: ClustersFlags = {},
): Promise<CommandOutcome<{ clusters: ClusterEntry[] }>> {
  const graph = await loadGraph(store);
  const result = clusters(graph);
  return outcome(store, { clusters: result }, `${result.length} cluster(s).`);
}

export interface BridgesFlags {
  top?: number;
}

export async function executeBridges(
  store: Store,
  flags: BridgesFlags = {},
): Promise<CommandOutcome<{ bridges: BridgeEntry[] }>> {
  const graph = await loadGraph(store);
  const result = bridges(graph, flags.top ?? store.config.retrieval.graph.bridge_top);
  return outcome(store, { bridges: result }, `Top ${result.length} bridge(s) by distinct clusters linked into.`);
}
