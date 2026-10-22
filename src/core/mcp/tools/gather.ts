import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { isUnderAnyPrefix } from '../../fs/prefix.js';
import { readAdmittedGraph } from '../../graph/persist.js';
import { listNotes } from '../../notes/list.js';
import { gather as runPass, type GatherOutcome, type GatherResult } from '../../retrieval/pass.js';
import { ToolRefusal } from '../jsonrpc.js';
import type { Snapshot } from '../sync.js';

/**
 * remote-access spec, *`gather` returns the retrieval pass with the bodies a
 * client cannot read itself* (design.md D8). The pass runs unchanged against
 * the view's notes and the view's own graph, and still returns no body; this
 * attaches them afterwards, to a prefix of the pass's order, within a byte
 * budget — so the cap never reorders anything, exactly as the pass's own cap.
 */

export const DEFAULT_GATHER_MAX_BYTES = 60_000;

export interface GatherArgs {
  seeds?: string[];
  sections?: string[];
  under?: string[];
  entities?: string[];
  hops?: number;
  direction?: 'in' | 'out' | 'both';
  type?: string;
  max_notes?: number;
}

export interface GatheredNote extends GatherResult {
  /** The note's text, frontmatter included; null once the byte budget is spent. */
  body: string | null;
  /** Set on the first note only, when it alone exceeded the budget and was cut to it. */
  body_clipped?: true;
}

export interface GatherToolResult extends Omit<GatherOutcome, 'notes'> {
  notes: GatheredNote[];
  bodies: { max_bytes: number; returned: number; omitted: number };
}

/** Plain on purpose (see FIND_INPUT_SCHEMA): `parseGatherArgs` enforces every limit. */
export const GATHER_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    seeds: { type: 'array', items: { type: 'string' }, description: 'Note paths to start from, usually from find.' },
    sections: { type: 'array', items: { type: 'string' }, description: 'Catalog section ids whose notes to start from (find with no text lists them).' },
    under: { type: 'array', items: { type: 'string' }, description: 'Folders whose notes to start from, e.g. "projects/".' },
    entities: { type: 'array', items: { type: 'string' }, description: 'Note paths whose backlinks to start from: every note linking to them.' },
    hops: { type: 'integer', description: 'How many links to follow out from the starting notes (default 1; 0 returns only them).' },
    direction: { type: 'string', enum: ['in', 'out', 'both'], description: 'Follow links pointing out, in, or both (default both).' },
    type: { type: 'string', description: 'Follow only links of this relation type.' },
    max_notes: { type: 'integer', description: 'Cap on how many notes to return; the omitted count is reported.' },
  },
} as const;

function stringList(args: Record<string, unknown>, key: string): string[] | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  const list = typeof value === 'string' ? [value] : value;
  if (!Array.isArray(list) || !list.every((v) => typeof v === 'string' && v.trim().length > 0)) {
    throw new ToolRefusal('mcp.invalid_arguments', `"${key}" must be a list of non-empty strings.`);
  }
  return list.map((v: string) => v.trim().replace(/^\.?\/+/, ''));
}

function wholeNumber(args: Record<string, unknown>, key: string, min: number, max: number): number | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new ToolRefusal('mcp.invalid_arguments', `"${key}" must be a whole number from ${min} to ${max}.`);
  }
  return value;
}

export function parseGatherArgs(args: Record<string, unknown>): GatherArgs {
  const out: GatherArgs = {
    seeds: stringList(args, 'seeds'),
    sections: stringList(args, 'sections'),
    under: stringList(args, 'under'),
    entities: stringList(args, 'entities'),
    hops: wholeNumber(args, 'hops', 0, 5),
    max_notes: wholeNumber(args, 'max_notes', 1, 500),
  };
  if (args.direction !== undefined && args.direction !== null) {
    if (args.direction !== 'in' && args.direction !== 'out' && args.direction !== 'both') {
      throw new ToolRefusal('mcp.invalid_arguments', '"direction" is one of in, out, both.');
    }
    out.direction = args.direction;
  }
  if (args.type !== undefined && args.type !== null) {
    if (typeof args.type !== 'string') throw new ToolRefusal('mcp.invalid_arguments', '"type" must be a string.');
    out.type = args.type;
  }
  if ([out.seeds, out.sections, out.under, out.entities].every((l) => l === undefined || l.length === 0)) {
    throw new ToolRefusal('mcp.invalid_arguments', 'Name at least one starting point: seeds, sections, under or entities. Use find first to get note paths.');
  }
  return out;
}

export async function gatherWithBodies(snapshot: Snapshot, args: GatherArgs, maxBytes = DEFAULT_GATHER_MAX_BYTES): Promise<GatherToolResult> {
  const store = snapshot.store;
  const captureRoot = store.config.ingest.capture_root;
  for (const seed of args.seeds ?? []) {
    if (isUnderAnyPrefix(seed, [captureRoot])) {
      throw new ToolRefusal('mcp.capture_not_filed', `"${seed}" is a capture that has not been filed into a note yet, so it cannot start a gather; read it with Read instead.`, { path: seed });
    }
  }

  const notes = await listNotes(store.root, store.config);
  const graph = await readAdmittedGraph(store);
  const pass = await runPass(store, notes, graph, {
    seeds: args.seeds,
    sections: args.sections,
    under: args.under,
    entities: args.entities,
    hops: args.hops,
    direction: args.direction,
    type: args.type,
    maxNotes: args.max_notes,
  });

  let spent = 0;
  let open = true;
  let returned = 0;
  const withBodies: GatheredNote[] = [];
  for (const [index, note] of pass.notes.entries()) {
    if (!open) {
      withBodies.push({ ...note, body: null });
      continue;
    }
    const text = await readFile(path.join(store.root, note.path), 'utf8');
    const bytes = Buffer.byteLength(text, 'utf8');
    if (spent + bytes <= maxBytes) {
      spent += bytes;
      returned += 1;
      withBodies.push({ ...note, body: text });
    } else if (index === 0) {
      // A call never comes back with no text at all: the first note is cut to the budget and says so.
      withBodies.push({ ...note, body: Buffer.from(text, 'utf8').subarray(0, maxBytes).toString('utf8'), body_clipped: true });
      returned += 1;
      open = false;
    } else {
      withBodies.push({ ...note, body: null });
      open = false;
    }
  }

  return { ...pass, notes: withBodies, bodies: { max_bytes: maxBytes, returned, omitted: pass.notes.length - returned } };
}
