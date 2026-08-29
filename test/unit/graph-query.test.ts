import { describe, expect, it } from 'vitest';
import type { GraphBuildResult } from '../../src/core/graph/model.js';
import { hubs, neighbors, orphans, shortestPath, subgraph } from '../../src/core/graph/query.js';

// a -> b -> c, d is isolated
function chainGraph(): GraphBuildResult {
  return {
    nodes: [{ id: 'a', path: 'a.md' }, { id: 'b', path: 'b.md' }, { id: 'c', path: 'c.md' }, { id: 'd', path: 'd.md' }],
    edges: [
      { src: 'a', dst: 'b', type: 'link' },
      { src: 'b', dst: 'c', type: 'link' },
    ],
    dangling: [{ from: 'a', target: 'ghost', reason: 'not_found' }],
  };
}

describe('neighbors', () => {
  it('defaults to depth 1, both directions', () => {
    expect(neighbors(chainGraph(), 'b')).toEqual(['a', 'c']);
  });

  it('respects direction: out', () => {
    expect(neighbors(chainGraph(), 'a', { direction: 'out' })).toEqual(['b']);
    expect(neighbors(chainGraph(), 'b', { direction: 'out' })).toEqual(['c']);
  });

  it('respects direction: in', () => {
    expect(neighbors(chainGraph(), 'c', { direction: 'in' })).toEqual(['b']);
    expect(neighbors(chainGraph(), 'a', { direction: 'in' })).toEqual([]);
  });

  it('expands with depth > 1', () => {
    expect(neighbors(chainGraph(), 'a', { depth: 2, direction: 'out' })).toEqual(['b', 'c']);
  });

  it('returns an empty list for an isolated node', () => {
    expect(neighbors(chainGraph(), 'd')).toEqual([]);
  });
});

describe('shortestPath', () => {
  it('finds the direct path along a chain', () => {
    expect(shortestPath(chainGraph(), 'a', 'c')).toEqual(['a', 'b', 'c']);
  });

  it('returns [from] when from === to', () => {
    expect(shortestPath(chainGraph(), 'a', 'a')).toEqual(['a']);
  });

  it('returns null when no path exists', () => {
    expect(shortestPath(chainGraph(), 'a', 'd')).toBeNull();
  });

  it('treats edges as traversable in both directions', () => {
    expect(shortestPath(chainGraph(), 'c', 'a')).toEqual(['c', 'b', 'a']);
  });
});

describe('hubs', () => {
  it('ranks nodes by backlink count, descending, tie-broken by id', () => {
    const graph: GraphBuildResult = {
      nodes: [{ id: 'a', path: 'a.md' }, { id: 'b', path: 'b.md' }, { id: 'c', path: 'c.md' }],
      edges: [
        { src: 'a', dst: 'c', type: 'link' },
        { src: 'b', dst: 'c', type: 'link' },
      ],
      dangling: [],
    };
    expect(hubs(graph, 10)).toEqual([
      { id: 'c', backlinks: 2 },
      { id: 'a', backlinks: 0 },
      { id: 'b', backlinks: 0 },
    ]);
  });

  it('respects the top-N cap', () => {
    expect(hubs(chainGraph(), 1)).toHaveLength(1);
  });
});

describe('orphans', () => {
  it('lists only nodes with no edges in or out', () => {
    expect(orphans(chainGraph())).toEqual(['d']);
  });
});

describe('subgraph', () => {
  it('filters nodes, edges, and dangling links to the given id set', () => {
    const result = subgraph(chainGraph(), ['a', 'b']);
    expect(result.nodes.map((n) => n.id).sort()).toEqual(['a', 'b']);
    expect(result.edges).toEqual([{ src: 'a', dst: 'b', type: 'link' }]);
    expect(result.dangling).toEqual([{ from: 'a', target: 'ghost', reason: 'not_found' }]);
  });

  it('drops an edge whose endpoint falls outside the id set', () => {
    const result = subgraph(chainGraph(), ['b', 'c']);
    expect(result.edges).toEqual([{ src: 'b', dst: 'c', type: 'link' }]);
  });
});
