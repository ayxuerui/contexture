import path from 'node:path';
import type { StoreConfig } from '../../config/schema.js';
import { contentHashOfBody } from '../content/canonicalize.js';
import type { Note } from '../notes/list.js';

/**
 * context-catalog spec: one section per configured taxonomy layer, plus a
 * catch-all "uncategorized" (or, for a zero-layer profile like
 * Zettelkasten, a single "notes" section covering everything) — so every
 * retrievable note always has exactly one section to belong to, never zero.
 */
export interface CatalogSection {
  id: string;
  /** The taxonomy layer path this section corresponds to, or null for the catch-all. */
  layerPath: string | null;
}

export function catalogSectionsFor(config: StoreConfig): CatalogSection[] {
  if (config.taxonomy.layers.length === 0) {
    return [{ id: 'notes', layerPath: null }];
  }
  return [
    ...config.taxonomy.layers.map((layer) => ({ id: layer.path.replace(/\/+$/, ''), layerPath: layer.path })),
    { id: 'uncategorized', layerPath: null },
  ];
}

export function sectionForNote(sections: readonly CatalogSection[], notePath: string): CatalogSection {
  for (const section of sections) {
    if (section.layerPath) {
      const prefix = section.layerPath.endsWith('/') ? section.layerPath : `${section.layerPath}/`;
      if (notePath.startsWith(prefix)) return section;
    }
  }
  return sections[sections.length - 1]!; // the catch-all is always last
}

export function sectionFileName(section: CatalogSection): string {
  return `${section.id}.md`;
}

export interface CatalogGlossEntry {
  gloss: string;
  /** The content hash at the moment the gloss was last confirmed non-empty — frozen, like source-hash. */
  hash?: string;
}

const ENTRY_RE = /^- \[\[(.*?)\]\] \(`([^`]+)`\) — (.*?)(?:\s*<!-- hash:([0-9a-f]{16}) -->)?$/;

/** Extracts existing entries' glosses (and confirmed hashes) keyed by note path, so a rebuild can preserve them. */
export function parseCatalogGlosses(body: string): Map<string, CatalogGlossEntry> {
  const entries = new Map<string, CatalogGlossEntry>();
  for (const line of body.split('\n')) {
    const match = ENTRY_RE.exec(line);
    if (match) {
      entries.set(match[2]!, { gloss: match[3] ?? '', hash: match[4] });
    }
  }
  return entries;
}

/** The store's answer to "what is this note called": frontmatter `title`, else the filename stem. */
export function titleFor(note: Note): string {
  const fmTitle = note.frontmatter?.title;
  if (typeof fmTitle === 'string' && fmTitle.length > 0) return fmTitle;
  return path.basename(note.path, '.md');
}

/**
 * Structure (identity + path) is always freshly generated; the gloss is
 * preserved from `existing` when present, and left empty for a note that
 * has never appeared before — never fabricated (context-catalog spec). The
 * confirmed hash is stamped the first time a gloss becomes non-empty, then
 * frozen — the same "frozen at confirmation, not live" discipline
 * context-ingest applies to source-hash.
 */
export function renderCatalogEntry(note: Note, existing: ReadonlyMap<string, CatalogGlossEntry>): string {
  const prior = existing.get(note.path);
  const gloss = prior?.gloss ?? '';
  const hash = gloss.length > 0 ? (prior?.hash ?? contentHashOfBody(note.body)) : undefined;
  const hashSuffix = hash ? ` <!-- hash:${hash} -->` : '';
  return `- [[${titleFor(note)}]] (\`${note.path}\`) — ${gloss}${hashSuffix}`;
}
