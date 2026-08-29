import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { contentHashOfBody } from '../content/canonicalize.js';
import { upsertFencedRegionInFile } from '../fs/fenced-region.js';
import { htmlCommentFence } from '../markers.js';
import { listNotes, type Note } from '../notes/list.js';
import type { Store } from '../store.js';
import {
  catalogSectionsFor,
  parseCatalogGlosses,
  renderCatalogEntry,
  sectionFileName,
  sectionForNote,
  type CatalogSection,
} from './model.js';

export const CATALOG_FENCE = htmlCommentFence('catalog');

async function readIfExists(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return '';
    throw err;
  }
}

function groupBySection(notes: readonly Note[], sections: readonly CatalogSection[]): Map<string, Note[]> {
  const grouped = new Map<string, Note[]>();
  for (const section of sections) grouped.set(section.id, []);
  for (const note of notes) {
    grouped.get(sectionForNote(sections, note.path).id)!.push(note);
  }
  return grouped;
}

export interface CatalogSectionBuildResult {
  id: string;
  file: string;
  noteCount: number;
  changed: boolean;
}

export interface CatalogBuildResult {
  sections: CatalogSectionBuildResult[];
  totalNotes: number;
}

/**
 * context-catalog spec: regenerates each section's fenced identity/path
 * entries, preserving any already-authored gloss. Re-running with no
 * underlying change is byte-identical (upsertFencedRegionInFile only writes
 * when content actually differs).
 */
export async function buildCatalog(store: Store): Promise<CatalogBuildResult> {
  const notes = await listNotes(store.root, store.config);
  const sections = catalogSectionsFor(store.config);
  const catalogDir = path.join(store.root, store.config.catalog.path);
  await mkdir(catalogDir, { recursive: true });

  const notesBySection = groupBySection(notes, sections);
  const results: CatalogSectionBuildResult[] = [];

  for (const section of sections) {
    const sectionNotes = notesBySection.get(section.id) ?? [];
    const filePath = path.join(catalogDir, sectionFileName(section));
    const existingGlosses = parseCatalogGlosses(await readIfExists(filePath));
    const lines = sectionNotes.map((note) => renderCatalogEntry(note, existingGlosses));
    const { changed } = await upsertFencedRegionInFile(filePath, CATALOG_FENCE, lines);
    results.push({ id: section.id, file: path.relative(store.root, filePath), noteCount: sectionNotes.length, changed });
  }

  return { sections: results, totalNotes: notes.length };
}

export interface CatalogCoverageResult {
  /** Retrievable notes with no catalog entry anywhere. */
  missing: string[];
  /** Catalog entries referencing a path that is no longer a retrievable note (e.g. deleted). */
  dangling: string[];
}

/**
 * context-catalog spec: coverage is a hard invariant in BOTH directions —
 * every retrievable note must have an entry (missing), and every entry must
 * still reference a real, retrievable note (dangling). A deleted note whose
 * stale entry survives a build is exactly the failure this second half
 * catches — `catalog build` only ever ADDS/preserves entries, so removal
 * must be caught here rather than silently left to rot.
 */
export async function checkCatalogCoverage(store: Store): Promise<CatalogCoverageResult> {
  const notes = await listNotes(store.root, store.config);
  const notePaths = new Set(notes.map((n) => n.path));
  const sections = catalogSectionsFor(store.config);
  const catalogDir = path.join(store.root, store.config.catalog.path);

  const cataloged = new Set<string>();
  for (const section of sections) {
    const body = await readIfExists(path.join(catalogDir, sectionFileName(section)));
    for (const notePath of parseCatalogGlosses(body).keys()) cataloged.add(notePath);
  }

  return {
    missing: notes.map((n) => n.path).filter((p) => !cataloged.has(p)),
    dangling: [...cataloged].filter((p) => !notePaths.has(p)).sort(),
  };
}

export interface CatalogStaleEntry {
  path: string;
  section: string;
}

/** context-catalog spec: an entry whose note has changed since its gloss was confirmed needs review. */
export async function checkCatalogStale(store: Store): Promise<CatalogStaleEntry[]> {
  const notes = await listNotes(store.root, store.config);
  const notesByPath = new Map(notes.map((n) => [n.path, n]));
  const sections = catalogSectionsFor(store.config);
  const catalogDir = path.join(store.root, store.config.catalog.path);

  const stale: CatalogStaleEntry[] = [];
  for (const section of sections) {
    const body = await readIfExists(path.join(catalogDir, sectionFileName(section)));
    for (const [notePath, entry] of parseCatalogGlosses(body)) {
      if (!entry.hash) continue; // no confirmed gloss yet — nothing to go stale
      const note = notesByPath.get(notePath);
      if (!note) continue; // handled by coverage, not staleness
      if (contentHashOfBody(note.body) !== entry.hash) {
        stale.push({ path: notePath, section: section.id });
      }
    }
  }
  return stale;
}

/**
 * Returns null ONLY when `sectionId` doesn't name a configured section — a
 * real section that simply hasn't been built yet (or has no notes) returns
 * an empty string, which is a valid, uninteresting result, not an error.
 */
export async function readCatalogSection(store: Store, sectionId: string, asContext?: string): Promise<string | null> {
  const sections = catalogSectionsFor(store.config);
  const section = sections.find((s) => s.id === sectionId);
  if (!section) return null;
  void asContext; // visibility filtering wired in Phase 5
  return readIfExists(path.join(store.root, store.config.catalog.path, sectionFileName(section)));
}

export function catalogSectionPath(store: Store, section: CatalogSection): string {
  return path.join(store.root, store.config.catalog.path, sectionFileName(section));
}
