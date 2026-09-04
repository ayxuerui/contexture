import { open, readdir } from 'node:fs/promises';
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
  /** Keyed by page path (the same key `publishPages` reports); the page's own declared name, when it has one. */
  publishTitles: ReadonlyMap<string, string>;
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

/** The file every published-page directory carries, and the route the navigation links a page to. */
export const PUBLISH_INDEX_FILE = 'index.html';

function pagesFromPublishFiles(publishFiles: ReadonlyMap<string, PublishFileRoute>): string[] {
  const pages = new Set<string>();
  for (const urlPath of publishFiles.keys()) {
    const separator = urlPath.lastIndexOf('/');
    if (separator === -1) continue;
    if (urlPath.slice(separator + 1) !== PUBLISH_INDEX_FILE) continue;
    pages.add(urlPath.slice(0, separator));
  }
  return [...pages].sort();
}

/**
 * browse-navigation-by-folder design.md D4: a published page is a directory
 * holding an index page, at whatever depth it sits — not an immediate child
 * of the publish path. A directory that only contains other pages is a
 * grouping node with no page of its own, and a page nested several
 * directories deep is addressable at its full path rather than collapsed
 * onto a top-level ancestor that may hold no index page at all.
 */
export function publishPages(table: RouteTable): string[] {
  return pagesFromPublishFiles(table.publishFiles);
}

/** design.md D4 (serve-page-names-theme-and-nav-toggle): a page's title is always in its <head>, well within this bound. */
const TITLE_PREFIX_BYTES = 4096;
const TITLE_MAX_LENGTH = 120;

const TITLE_TAG_RE = /<title[^>]*>([\s\S]*?)<\/title>/i;
const ENTITY_RE = /&(#x?[0-9a-f]+|[a-z]+);/gi;
const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

function decodeEntities(text: string): string {
  return text.replace(ENTITY_RE, (match, body: string) => {
    if (body.startsWith('#')) {
      const isHex = body[1] === 'x' || body[1] === 'X';
      const codePoint = Number.parseInt(body.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return match;
      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return match;
      }
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named ?? match;
  });
}

/**
 * design.md D1/D4 (serve-page-names-theme-and-nav-toggle): extracts a
 * page's declared name from a bounded prefix of its HTML source. A prefix
 * truncated mid-tag has no closing </title> within it, so the regex simply
 * fails to match and the caller falls back — no partial-tag text is ever
 * returned.
 */
function extractTitle(htmlPrefix: string): string | undefined {
  const match = TITLE_TAG_RE.exec(htmlPrefix);
  if (!match) return undefined;
  const collapsed = decodeEntities(match[1] ?? '').replace(/\s+/g, ' ').trim();
  if (collapsed.length === 0) return undefined;
  return collapsed.length > TITLE_MAX_LENGTH ? collapsed.slice(0, TITLE_MAX_LENGTH) : collapsed;
}

/**
 * Reads only the first TITLE_PREFIX_BYTES of the file — a page's title is
 * always in its <head>, and this keeps the per-request cost proportional to
 * page count rather than page size (design.md D4). Sliced as a Buffer and
 * decoded afterward, so a multibyte character straddling the boundary is
 * never split mid-sequence before decoding.
 */
async function readPageTitle(absolutePath: string): Promise<string | undefined> {
  let handle;
  try {
    handle = await open(absolutePath, 'r');
  } catch {
    return undefined;
  }
  try {
    const buffer = Buffer.alloc(TITLE_PREFIX_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, TITLE_PREFIX_BYTES, 0);
    return extractTitle(buffer.subarray(0, bytesRead).toString('utf8'));
  } catch {
    return undefined;
  } finally {
    await handle.close();
  }
}

async function resolvePublishTitles(
  pages: readonly string[],
  publishFiles: ReadonlyMap<string, PublishFileRoute>,
): Promise<ReadonlyMap<string, string>> {
  const titles = new Map<string, string>();
  await Promise.all(
    pages.map(async (page) => {
      const indexRoute = publishFiles.get(`${page}/${PUBLISH_INDEX_FILE}`);
      if (!indexRoute) return;
      const title = await readPageTitle(indexRoute.absolutePath);
      if (title) titles.set(page, title);
    }),
  );
  return titles;
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
  const publishTitles = await resolvePublishTitles(pagesFromPublishFiles(publishFiles), publishFiles);

  return { notes, catalog, graphDocumentPath: graphDocumentPath(store), publishFiles, publishTitles };
}
