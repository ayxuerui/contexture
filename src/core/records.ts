import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { catalogSectionsFor, parseCatalogGlosses, sectionFileName } from './catalog/model.js';
import { contentHashOfBody } from './content/canonicalize.js';
import { listNotes } from './notes/list.js';
import { resolveVisibility } from './notes/visibility.js';
import type { Store } from './store.js';

/**
 * context-retrieval spec: a stable per-note record `{id, path, visibility,
 * gloss, hash}`, usable as input to a future (v2) search capability without
 * re-deriving note identity. Shared by `graph build --emit-records` and
 * `catalog build --emit-records` so both commands agree on the shape.
 */
export interface PerNoteRecord {
  id: string;
  path: string;
  visibility: string;
  gloss: string;
  hash: string;
}

async function readIfExists(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return '';
    throw err;
  }
}

export async function buildPerNoteRecords(store: Store): Promise<PerNoteRecord[]> {
  const notes = await listNotes(store.root, store.config);
  const sections = catalogSectionsFor(store.config);
  const catalogDir = path.join(store.root, store.config.catalog.path);

  const glosses = new Map<string, string>();
  for (const section of sections) {
    const body = await readIfExists(path.join(catalogDir, sectionFileName(section)));
    for (const [notePath, entry] of parseCatalogGlosses(body)) {
      glosses.set(notePath, entry.gloss);
    }
  }

  return notes.map((note) => ({
    id: note.path,
    path: note.path,
    visibility: resolveVisibility(store.config, note).value,
    gloss: glosses.get(note.path) ?? '',
    hash: contentHashOfBody(note.body),
  }));
}
