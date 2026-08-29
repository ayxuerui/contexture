import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { writeFileAtomic } from '../fs/atomic.js';
import type { Store } from '../store.js';
import type { GraphBuildResult } from './model.js';

/** A derived artifact, atomically written, under the home directory's cache subpath (the default derived path). */
export function graphFilePath(store: Store): string {
  return path.join(store.root, '.contexture', 'cache', 'graph.json');
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
