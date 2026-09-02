import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { catalogSectionsFor, sectionFileName } from '../catalog/model.js';
import { graphDocumentPath } from '../graph/persist.js';
import { listNotes, type Note } from '../notes/list.js';
import type { Store } from '../store.js';

export interface CatalogRoute {
  id: string;
  absolutePath: string;
}

export interface PublishFileRoute {
  /** URL-relative path under /publish/, e.g. "my-page/index.html". */
  urlPath: string;
  absolutePath: string;
}

export interface RouteTable {
  /** Keyed by store-relative note path (the same string used as the note's URL and its graph node id). */
  notes: ReadonlyMap<string, Note>;
  /** Keyed by catalog section id. */
  catalog: ReadonlyMap<string, CatalogRoute>;
  graphDocumentPath: string;
  /** Keyed by the exact URL-relative path under /publish/ — a lookup miss is the only traversal guard needed (design.md D2). */
  publishFiles: ReadonlyMap<string, PublishFileRoute>;
}

async function walkFiles(root: string, relative = ''): Promise<PublishFileRoute[]> {
  let entries;
  try {
    entries = await readdir(path.join(root, relative), { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }

  const files: PublishFileRoute[] = [];
  for (const entry of entries) {
    const entryRelative = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(root, entryRelative)));
    } else if (entry.isFile()) {
      files.push({ urlPath: entryRelative, absolutePath: path.join(root, entryRelative) });
    }
  }
  return files;
}

/**
 * local-browsing-surface design.md D2: built fresh from the store's own
 * enumeration on every call, never cached — so a path outside every
 * configured location is absent from the table by construction, and a
 * request for it is an ordinary lookup miss rather than a check that could
 * be forgotten on one route and not another.
 */
export async function buildRouteTable(store: Store): Promise<RouteTable> {
  const noteList = await listNotes(store.root, store.config);
  const notes = new Map(noteList.map((note) => [note.path, note]));

  const catalog = new Map(
    catalogSectionsFor(store.config).map((section) => [
      section.id,
      { id: section.id, absolutePath: path.join(store.root, store.config.catalog.path, sectionFileName(section)) },
    ]),
  );

  const publishRoot = path.join(store.root, store.config.publish.path);
  const publishFiles = new Map((await walkFiles(publishRoot)).map((file) => [file.urlPath, file]));

  return { notes, catalog, graphDocumentPath: graphDocumentPath(store), publishFiles };
}

/** The distinct top-level page folders under the publish route, for the index page. */
export function publishSlugs(table: RouteTable): string[] {
  const slugs = new Set<string>();
  for (const urlPath of table.publishFiles.keys()) {
    const slug = urlPath.split('/')[0];
    if (slug) slugs.add(slug);
  }
  return [...slugs].sort();
}
