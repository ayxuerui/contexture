import { readFile } from 'node:fs/promises';
import { contentHashOfBody } from '../content/canonicalize.js';
import { buildStemIndex, extractLinkTargets } from '../graph/model.js';
import type { Note } from '../notes/list.js';
import { parseNoteText } from '../notes/parse.js';

/**
 * two-kinds-of-published-page design.md D4: the note a permanent page
 * represents is the FIRST wikilink in its README's body, frontmatter
 * excluded. `filing.ts` reads the same link to decide whose page a page is,
 * so the reading lives here once and both call it — a page `gather` counts as
 * a subject's and a page `check` says represents that subject cannot disagree.
 */
export interface LeadLink {
  /** The wikilink target as written: the stem before any `|alias` or `#heading`. */
  target: string;
  /** Zero-based index of the raw README line holding it, frontmatter lines counted. */
  line: number;
}

/**
 * Parsed rather than grepped so frontmatter is excluded, matching how the graph
 * resolves a wikilink. `extractLinkTargets` reports occurrences in body order,
 * so the first line that yields one holds the lead.
 */
export function readLeadLink(readmeRaw: string, readmePath: string): LeadLink | null {
  const { body } = parseNoteText(readmeRaw, readmePath);
  const frontmatterLines = readmeRaw.slice(0, readmeRaw.length - body.length).split('\n').length - 1;
  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const target = extractLinkTargets(lines[i]!)[0];
    if (target !== undefined) return { target, line: frontmatterLines + i };
  }
  return null;
}

export type RepresentedResolution = { note: Note } | { none: true } | { ambiguous: string[] };

/**
 * By filename stem, through the one stem index every wikilink resolution in the
 * system reads (`buildStemIndex`): exactly one note resolves, zero or two-plus
 * do not. The candidates are named so the author can qualify the link.
 */
export function resolveRepresented(notes: readonly Note[], stem: string): RepresentedResolution {
  const paths = buildStemIndex(notes).get(stem) ?? [];
  if (paths.length === 0) return { none: true };
  if (paths.length > 1) return { ambiguous: [...paths].sort() };
  return { note: notes.find((note) => note.path === paths[0])! };
}

/** The catalog's frozen-hash form, so an agent that has learned one has learned both (D5). */
const HASH_MARKER_RE = /\s*<!-- hash:([0-9a-f]{16}) -->/;

export function readHashMarker(line: string): string | null {
  return HASH_MARKER_RE.exec(line)?.[1] ?? null;
}

/**
 * D5: the marker is written once and never overwritten. A line that already
 * carries one comes back unchanged — confirming a page against a changed note
 * takes removing the marker by hand and stamping again.
 */
export function appendHashMarker(line: string, hash: string): string {
  if (readHashMarker(line) !== null) return line;
  // A CRLF file's line keeps its `\r`, so nothing but the marker changes.
  const ending = line.endsWith('\r') ? '\r' : '';
  return `${line.replace(/\s+$/, '')} <!-- hash:${hash} -->${ending}`;
}

/** The represented note's hash — `contentHashOfBody`, imported and never re-spelled. */
export function representedNoteHash(note: Note): string {
  return contentHashOfBody(note.body);
}

export type Representation =
  | { status: 'no-link' }
  | { status: 'not-found'; target: string }
  | { status: 'ambiguous'; target: string; candidates: string[] }
  | { status: 'not-stamped'; note: string; hash: string; lead: LeadLink }
  | { status: 'stale'; note: string; hash: string; recorded: string; lead: LeadLink }
  | { status: 'current'; note: string; hash: string; lead: LeadLink };

/** Where a permanent page stands against its note — one reading for `publish check`, `publish stamp` and lint. */
export function assessRepresentation(readmeRaw: string, readmePath: string, notes: readonly Note[]): Representation {
  const lead = readLeadLink(readmeRaw, readmePath);
  if (lead === null) return { status: 'no-link' };
  const resolved = resolveRepresented(notes, lead.target);
  if ('none' in resolved) return { status: 'not-found', target: lead.target };
  if ('ambiguous' in resolved) return { status: 'ambiguous', target: lead.target, candidates: resolved.ambiguous };
  const hash = representedNoteHash(resolved.note);
  const recorded = readHashMarker(readmeRaw.split('\n')[lead.line]!);
  if (recorded === null) return { status: 'not-stamped', note: resolved.note.path, hash, lead };
  if (recorded !== hash) return { status: 'stale', note: resolved.note.path, hash, recorded, lead };
  return { status: 'current', note: resolved.note.path, hash, lead };
}

export async function readReadme(readmeAbsolutePath: string): Promise<string | null> {
  try {
    return await readFile(readmeAbsolutePath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}
