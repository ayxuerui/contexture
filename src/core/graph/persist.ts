import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { GraphCarriesExcludedNoteError, GraphNotBuiltError } from '../errors.js';
import { writeFileAtomic } from '../fs/atomic.js';
import { listNotes } from '../notes/list.js';
import type { Store } from '../store.js';
import type { GraphBuildResult } from './model.js';

/** A derived artifact, atomically written, under the home directory's cache subpath (the default derived path). */
export function graphFilePath(store: Store): string {
  return path.join(store.root, '.contexture', 'cache', 'graph.json');
}

/** graph-context-document spec: the human-readable render lives beside the artifact; this is the path AGENTS.md and the skills name. */
export const GRAPH_DOCUMENT_RELATIVE_PATH = '.contexture/cache/graph.md';

export function graphDocumentPath(store: Store): string {
  return path.join(store.root, ...GRAPH_DOCUMENT_RELATIVE_PATH.split('/'));
}

export async function writeGraphDocument(store: Store, text: string): Promise<void> {
  const filePath = graphDocumentPath(store);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFileAtomic(filePath, text);
}

export async function writeGraph(store: Store, graph: GraphBuildResult): Promise<void> {
  const filePath = graphFilePath(store);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFileAtomic(filePath, `${JSON.stringify(graph, null, 2)}\n`);
}

export async function readGraph(store: Store): Promise<GraphBuildResult | null> {
  try {
    return JSON.parse(await readFile(graphFilePath(store), 'utf8')) as GraphBuildResult;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * compose-the-retrieval-pass spec: the one seam through which every graph
 * query and the retrieval pass read the persisted graph, so the exclusion
 * guarantee is enforced in a single place rather than per caller.
 *
 * Refuses an OVER-inclusive graph — one carrying a note the store's own
 * enumeration no longer admits — because answering from it would surface
 * excluded material. Tolerates an UNDER-inclusive one (a note added since the
 * last build): it withholds nothing, and failing there would make every query
 * brittle for a condition with no withholding consequence. `doctor`'s
 * staleness check is what reports that case.
 */
export async function readAdmittedGraph(store: Store): Promise<GraphBuildResult> {
  const graph = await readGraph(store);
  if (!graph) throw new GraphNotBuiltError();
  const admitted = new Set((await listNotes(store.root, store.config)).map((note) => note.path));
  const excluded = graph.nodes.filter((node) => !admitted.has(node.id)).map((node) => node.id);
  if (excluded.length > 0) throw new GraphCarriesExcludedNoteError(excluded);
  return graph;
}
