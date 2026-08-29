import type { GraphBuildResult } from './model.js';

export type Direction = 'in' | 'out' | 'both';

function buildAdjacency(graph: GraphBuildResult, direction: Direction): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();
  const add = (a: string, b: string): void => {
    const list = adjacency.get(a) ?? [];
    list.push(b);
    adjacency.set(a, list);
  };
  for (const edge of graph.edges) {
    if (direction === 'out' || direction === 'both') add(edge.src, edge.dst);
    if (direction === 'in' || direction === 'both') add(edge.dst, edge.src);
  }
  return adjacency;
}

export interface NeighborsOptions {
  depth?: number;
  direction?: Direction;
}

export function neighbors(graph: GraphBuildResult, nodeId: string, opts: NeighborsOptions = {}): string[] {
  const depth = opts.depth ?? 1;
  const adjacency = buildAdjacency(graph, opts.direction ?? 'both');

  let frontier = new Set([nodeId]);
  const visited = new Set([nodeId]);
  for (let i = 0; i < depth && frontier.size > 0; i += 1) {
    const next = new Set<string>();
    for (const id of frontier) {
      for (const neighbor of adjacency.get(id) ?? []) {
        if (!visited.has(neighbor)) {
          next.add(neighbor);
          visited.add(neighbor);
        }
      }
    }
    frontier = next;
  }
  visited.delete(nodeId);
  return [...visited].sort();
}

export function shortestPath(graph: GraphBuildResult, from: string, to: string): string[] | null {
  if (from === to) return [from];
  const adjacency = buildAdjacency(graph, 'both');
  const queue: string[] = [from];
  const cameFrom = new Map<string, string>();
  const visited = new Set([from]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const neighbor of adjacency.get(current) ?? []) {
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);
      cameFrom.set(neighbor, current);
      if (neighbor === to) {
        const result: string[] = [to];
        let node = to;
        while (cameFrom.has(node)) {
          node = cameFrom.get(node)!;
          result.unshift(node);
        }
        return result;
      }
      queue.push(neighbor);
    }
  }
  return null;
}

export interface HubEntry {
  id: string;
  backlinks: number;
}

export function hubs(graph: GraphBuildResult, top: number): HubEntry[] {
  const counts = new Map<string, number>();
  for (const node of graph.nodes) counts.set(node.id, 0);
  for (const edge of graph.edges) counts.set(edge.dst, (counts.get(edge.dst) ?? 0) + 1);
  return [...counts.entries()]
    .map(([id, backlinks]) => ({ id, backlinks }))
    .sort((a, b) => b.backlinks - a.backlinks || a.id.localeCompare(b.id))
    .slice(0, top);
}

export function orphans(graph: GraphBuildResult): string[] {
  const linked = new Set<string>();
  for (const edge of graph.edges) {
    linked.add(edge.src);
    linked.add(edge.dst);
  }
  return graph.nodes.map((n) => n.id).filter((id) => !linked.has(id)).sort();
}

export function subgraph(graph: GraphBuildResult, ids: readonly string[]): GraphBuildResult {
  const idSet = new Set(ids);
  return {
    nodes: graph.nodes.filter((n) => idSet.has(n.id)),
    edges: graph.edges.filter((e) => idSet.has(e.src) && idSet.has(e.dst)),
    dangling: graph.dangling.filter((d) => idSet.has(d.from)),
  };
}
