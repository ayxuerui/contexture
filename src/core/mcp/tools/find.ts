import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { joinBaseUrl, noteRoute } from '../../browse/page-url.js';
import { catalogSectionsFor, sectionForNote } from '../../catalog/model.js';
import { isUnderAnyPrefix } from '../../fs/prefix.js';
import { listCaptures, listNotes } from '../../notes/list.js';
import { readCatalogGlosses } from '../../records.js';
import type { Store } from '../../store.js';
import { ToolRefusal } from '../jsonrpc.js';
import type { Snapshot } from '../sync.js';

/**
 * remote-access spec, *`find` stands in for a client's own content
 * matching*; context-retrieval's bounded exception. Literal,
 * case-insensitive substring matching over the notes the store's
 * enumeration admits, in path order, with no score. Captures — inbox files
 * on the default branch and on pending `capture/` branches — come back in
 * `unfiled`, never among the notes (context-ingest's exception, design.md
 * D6). With no text, the catalog as a map to pick selectors from.
 */

export const MAX_LINES_PER_HIT = 3;
export const MAX_LINE_CHARS = 240;
export const DEFAULT_MAX_MATCHES = 25;
export const DEFAULT_MAX_MAP_NOTES = 500;
export const MAX_RESULTS = 1000;
const MAX_TEXT_CHARS = 200;

export interface FindArgs {
  text?: string;
  under?: string;
  max?: number;
}

export interface MatchingLine {
  line: number;
  text: string;
}

export interface NoteHit {
  path: string;
  gloss: string;
  lines: MatchingLine[];
  matching_lines: number;
  url: string | null;
}

export interface UnfiledHit {
  path: string;
  lines: MatchingLine[];
  matching_lines: number;
  pending_merge: boolean;
  branch: string | null;
}

export type FindResult =
  | { mode: 'match'; text: string; notes: NoteHit[]; notes_omitted: number; unfiled: UnfiledHit[]; unfiled_omitted: number }
  | { mode: 'map'; sections: { id: string; notes: { path: string; gloss: string; url: string | null }[] }[]; notes_omitted: number };

export const FIND_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    text: { type: 'string', description: 'Literal text to look for, case-insensitive. Omit it to get the map of the store instead.', maxLength: MAX_TEXT_CHARS },
    under: { type: 'string', description: 'Only look under this folder of the store, e.g. "projects/".' },
    max: { type: 'integer', minimum: 1, maximum: MAX_RESULTS, description: `How many notes to return (default ${DEFAULT_MAX_MATCHES} when matching, ${DEFAULT_MAX_MAP_NOTES} for the map).` },
  },
  additionalProperties: false,
} as const;

export function parseFindArgs(args: Record<string, unknown>): FindArgs {
  const out: FindArgs = {};
  if (args.text !== undefined && args.text !== null) {
    if (typeof args.text !== 'string') throw new ToolRefusal('mcp.invalid_arguments', '"text" must be a string.');
    if (args.text.length > MAX_TEXT_CHARS) throw new ToolRefusal('mcp.invalid_arguments', `"text" is at most ${MAX_TEXT_CHARS} characters.`);
    if (args.text.trim().length > 0) out.text = args.text.trim();
  }
  if (args.under !== undefined && args.under !== null) {
    if (typeof args.under !== 'string') throw new ToolRefusal('mcp.invalid_arguments', '"under" must be a string.');
    const under = args.under.trim().replace(/^\.?\/+/, '');
    if (under.length > 0) out.under = under;
  }
  if (args.max !== undefined && args.max !== null) {
    if (typeof args.max !== 'number' || !Number.isInteger(args.max) || args.max < 1 || args.max > MAX_RESULTS) {
      throw new ToolRefusal('mcp.invalid_arguments', `"max" must be a whole number from 1 to ${MAX_RESULTS}.`);
    }
    out.max = args.max;
  }
  return out;
}

function matchLines(text: string, needle: string): { lines: MatchingLine[]; count: number } {
  const lines: MatchingLine[] = [];
  let count = 0;
  const all = text.split(/\r?\n/);
  for (let i = 0; i < all.length; i += 1) {
    const line = all[i]!;
    if (!line.toLowerCase().includes(needle)) continue;
    count += 1;
    if (lines.length < MAX_LINES_PER_HIT) {
      lines.push({ line: i + 1, text: line.length > MAX_LINE_CHARS ? `${line.slice(0, MAX_LINE_CHARS - 1)}…` : line });
    }
  }
  return { lines, count };
}

const byPath = (a: { path: string }, b: { path: string }): number => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

export async function find(store: Store, snapshot: Snapshot, args: FindArgs): Promise<FindResult> {
  const baseUrl = store.config.serve?.base_url;
  const linkFor = (notePath: string): string | null => joinBaseUrl(baseUrl, noteRoute(notePath));
  const glosses = await readCatalogGlosses(store);
  const scope = (p: string): boolean => args.under === undefined || isUnderAnyPrefix(p, [args.under]);
  const notes = (await listNotes(store.root, store.config)).filter((n) => scope(n.path)).sort(byPath);

  if (args.text === undefined) {
    const max = args.max ?? DEFAULT_MAX_MAP_NOTES;
    const sections = catalogSectionsFor(store.config);
    const grouped = new Map<string, { path: string; gloss: string; url: string | null }[]>(sections.map((s) => [s.id, []]));
    let listed = 0;
    for (const note of notes) {
      if (listed >= max) break;
      grouped.get(sectionForNote(sections, note.path).id)!.push({ path: note.path, gloss: glosses.get(note.path) ?? '', url: linkFor(note.path) });
      listed += 1;
    }
    return {
      mode: 'map',
      sections: [...grouped.entries()].filter(([, entries]) => entries.length > 0).map(([id, entries]) => ({ id, notes: entries })),
      notes_omitted: notes.length - listed,
    };
  }

  const needle = args.text.toLowerCase();
  const max = args.max ?? DEFAULT_MAX_MATCHES;

  // Raw file text, frontmatter included, so line numbers are the file's own — what grep would report.
  const noteHits: NoteHit[] = [];
  for (const note of notes) {
    const { lines, count } = matchLines(await readFile(path.join(store.root, note.path), 'utf8'), needle);
    if (count > 0) noteHits.push({ path: note.path, gloss: glosses.get(note.path) ?? '', lines, matching_lines: count, url: linkFor(note.path) });
  }

  const inbox = store.config.ingest.inbox_path;
  const unfiled: UnfiledHit[] = [];
  for (const capture of (await listCaptures(store.root, store.config)).sort(byPath)) {
    if (!isUnderAnyPrefix(capture.path, [inbox]) || !scope(capture.path)) continue;
    const { lines, count } = matchLines(await readFile(path.join(store.root, capture.path), 'utf8'), needle);
    if (count > 0) unfiled.push({ path: capture.path, lines, matching_lines: count, pending_merge: false, branch: null });
  }
  const pending = [...snapshot.pending].sort((a, b) => byPath(a, b) || (a.branch < b.branch ? -1 : 1));
  for (const capture of pending) {
    if (!scope(capture.path)) continue;
    const { lines, count } = matchLines(capture.text, needle);
    if (count > 0) unfiled.push({ path: capture.path, lines, matching_lines: count, pending_merge: true, branch: capture.branch });
  }

  return {
    mode: 'match',
    text: args.text,
    notes: noteHits.slice(0, max),
    notes_omitted: Math.max(0, noteHits.length - max),
    unfiled: unfiled.slice(0, max),
    unfiled_omitted: Math.max(0, unfiled.length - max),
  };
}
