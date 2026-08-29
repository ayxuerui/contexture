import { listNotes } from '../notes/list.js';
import { resolveVisibility } from '../notes/visibility.js';
import type { Store } from '../store.js';
import type { GraphBuildResult } from './model.js';
import { subgraph } from './query.js';

/**
 * context-visibility spec: "excluded... before that operation ranks,
 * traverses, or otherwise processes results" — filtering the persisted
 * graph down to only visible nodes BEFORE calling neighbors/shortestPath/
 * hubs/orphans means an excluded note contributes no edges to any of them,
 * not merely a post-hoc omission from the final list. A node with no
 * corresponding current note (a stale graph entry) is excluded rather than
 * included — visibility can't be resolved for it, so it fails closed.
 */
export async function filterGraphByAudience(
  store: Store,
  graph: GraphBuildResult,
  audience: string,
): Promise<GraphBuildResult> {
  const notes = await listNotes(store.root, store.config);
  const byPath = new Map(notes.map((note) => [note.path, note]));

  const visibleIds = graph.nodes
    .filter((node) => {
      const note = byPath.get(node.path);
      if (!note) return false;
      return resolveVisibility(store.config, note).value === audience;
    })
    .map((node) => node.id);

  return subgraph(graph, visibleIds);
}
