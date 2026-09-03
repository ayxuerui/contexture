import path from 'node:path';
import type { StoreConfig } from '../../config/schema.js';
import { catalogSectionsFor, sectionForNote } from '../catalog/model.js';
import { contentHashOfBody } from '../content/canonicalize.js';
import { CatalogSectionNotFoundError, NoteNotFoundError } from '../errors.js';
import { extractLinkTargets, type GraphBuildResult } from '../graph/model.js';
import { backlinkCounts, bridges, hubs } from '../graph/query.js';
import { isUnderAnyPrefix, type Note } from '../notes/list.js';
import { readCatalogGlosses } from '../records.js';
import type { Store } from '../store.js';

/**
 * compose-the-retrieval-pass spec: retrieval is one pass — enter positionally
 * or relationally, expand through the built graph, widen with the agent's own
 * content matching. This module computes the first two steps.
 *
 * It takes SELECTORS, never a query string, and returns identities, glosses
 * and evidence, never note bodies. That is what keeps bootstrap D2 closed:
 * with no query there is no note-against-query relevance to define or tune.
 */

/** Why a note is in the result. Entry reasons order; qualifiers only describe (D5). */
export const ENTRY_REASONS = ['seed', 'catalog_section', 'under_prefix', 'backlink', 'link_in', 'link_out'] as const;
export type EntryReason = (typeof ENTRY_REASONS)[number];

export const QUALIFIERS = ['hub', 'bridge', 'no_gloss'] as const;
export type Qualifier = (typeof QUALIFIERS)[number];

export type Tier = 'normal' | 'demoted';

export interface GatherEntry {
  selector: 'seed' | 'section' | 'under' | 'entity';
  value: string;
}

export interface GatherResult {
  path: string;
  section: string;
  cluster: string;
  gloss: string;
  hash: string;
  bytes: number;
  tier: Tier;
  hops: number;
  labels: string[];
}

export interface GatherOutcome {
  entries: GatherEntry[];
  hops: number;
  budget: { maxNotes: number; returned: number; omitted: number; truncated: boolean };
  notes: GatherResult[];
}

export interface GatherOptions {
  seeds?: readonly string[];
  sections?: readonly string[];
  under?: readonly string[];
  entities?: readonly string[];
  hops?: number;
  direction?: 'in' | 'out' | 'both';
  type?: string;
  maxNotes?: number;
}

function tierOf(notePath: string, config: StoreConfig): Tier {
  return isUnderAnyPrefix(notePath, config.retrieval.demote_paths) ? 'demoted' : 'normal';
}

/** A total order over structural facts alone: no weight, no coefficient, nothing tunable (D3). */
function compare(a: GatherResult, b: GatherResult): number {
  if (a.tier !== b.tier) return a.tier === 'demoted' ? 1 : -1;
  if (a.hops !== b.hops) return a.hops - b.hops;
  const rank = (r: GatherResult): number =>
    Math.min(...r.labels.map((l) => ENTRY_REASONS.indexOf(l as EntryReason)).filter((i) => i >= 0));
  const byReason = rank(a) - rank(b);
  if (byReason !== 0) return byReason;
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
}

interface Reached {
  hops: number;
  labels: Set<string>;
}

/** Adjacency in both directions, kept separate so an expansion can say which way the edge ran. */
function adjacency(graph: GraphBuildResult, type?: string): { out: Map<string, string[]>; in: Map<string, string[]> } {
  const out = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (type !== undefined && edge.type !== type) continue;
    (out.get(edge.src) ?? out.set(edge.src, []).get(edge.src)!).push(edge.dst);
    (incoming.get(edge.dst) ?? incoming.set(edge.dst, []).get(edge.dst)!).push(edge.src);
  }
  return { out, in: incoming };
}

export function resolveEntrySet(
  notes: readonly Note[],
  config: StoreConfig,
  options: GatherOptions,
): { reached: Map<string, Reached>; entries: GatherEntry[] } {
  const byPath = new Map(notes.map((n) => [n.path, n]));
  const sections = catalogSectionsFor(config);
  const reached = new Map<string, Reached>();
  const entries: GatherEntry[] = [];

  const add = (notePath: string, label: EntryReason): void => {
    const existing = reached.get(notePath);
    if (existing) existing.labels.add(label);
    else reached.set(notePath, { hops: 0, labels: new Set([label]) });
  };

  for (const seed of options.seeds ?? []) {
    entries.push({ selector: 'seed', value: seed });
    if (!byPath.has(seed)) throw new NoteNotFoundError(seed);
    add(seed, 'seed');
  }

  for (const id of options.sections ?? []) {
    entries.push({ selector: 'section', value: id });
    if (!sections.some((s) => s.id === id)) throw new CatalogSectionNotFoundError(id);
    for (const note of notes) if (sectionForNote(sections, note.path).id === id) add(note.path, 'catalog_section');
  }

  for (const prefix of options.under ?? []) {
    entries.push({ selector: 'under', value: prefix });
    for (const note of notes) if (isUnderAnyPrefix(note.path, [prefix])) add(note.path, 'under_prefix');
  }

  // The same backlink enumeration `rollup gather` and `publish gather` use.
  for (const entity of options.entities ?? []) {
    entries.push({ selector: 'entity', value: entity });
    const stem = path.basename(entity, '.md');
    for (const note of notes) {
      if (note.path !== entity && extractLinkTargets(note.body).includes(stem)) add(note.path, 'backlink');
    }
  }

  return { reached, entries };
}

export async function gather(store: Store, notes: readonly Note[], graph: GraphBuildResult, options: GatherOptions): Promise<GatherOutcome> {
  const config = store.config;
  const hopBudget = options.hops ?? 1;
  const maxNotes = options.maxNotes ?? config.retrieval.gather_max_notes;

  const { reached, entries } = resolveEntrySet(notes, config, options);

  // Expansion: the graph, run over whatever entered — the augmentation step,
  // not a leg answering on its own.
  const { out, in: incoming } = adjacency(graph, options.type);
  const direction = options.direction ?? 'both';
  let frontier = [...reached.keys()];
  for (let hop = 1; hop <= hopBudget && frontier.length > 0; hop += 1) {
    const next: string[] = [];
    const step = (from: readonly string[], label: 'link_in' | 'link_out'): void => {
      for (const id of from) {
        const existing = reached.get(id);
        if (existing) {
          if (existing.hops === hop) existing.labels.add(label);
          continue;
        }
        reached.set(id, { hops: hop, labels: new Set([label]) });
        next.push(id);
      }
    };
    for (const id of frontier) {
      if (direction === 'out' || direction === 'both') step(out.get(id) ?? [], 'link_out');
      if (direction === 'in' || direction === 'both') step(incoming.get(id) ?? [], 'link_in');
    }
    frontier = next;
  }

  // Joined against the note list the caller already holds — the same shape
  // `graph build --emit-records` emits, which until now had no consumer.
  const glosses = await readCatalogGlosses(store);
  const bytesOf = new Map(notes.map((n) => [n.path, Buffer.byteLength(n.body, 'utf8')]));
  const hashOf = new Map(notes.map((n) => [n.path, contentHashOfBody(n.body)]));
  const clusterOfNode = new Map(graph.nodes.map((n) => [n.id, n.cluster]));
  const sections = catalogSectionsFor(config);
  const backlinks = backlinkCounts(graph);
  const hubIds = new Set(hubs(graph, config.retrieval.graph.hub_top).filter((h) => (backlinks.get(h.id) ?? 0) > 0).map((h) => h.id));
  const bridgeIds = new Set(bridges(graph, config.retrieval.graph.bridge_top).map((b) => b.id));

  const results: GatherResult[] = [];
  for (const [notePath, hit] of reached) {
    // A node the graph still carries but the store no longer enumerates is not
    // returned; the loader already refuses an over-inclusive graph, so this is
    // the under-inclusive direction (a note deleted since the last build).
    if (!bytesOf.has(notePath)) continue;
    const gloss = glosses.get(notePath) ?? '';
    const labels = [...hit.labels];
    if (gloss.length === 0) labels.push('no_gloss');
    if (hubIds.has(notePath)) labels.push('hub');
    if (bridgeIds.has(notePath)) labels.push('bridge');
    results.push({
      path: notePath,
      section: sectionForNote(sections, notePath).id,
      cluster: clusterOfNode.get(notePath) ?? '',
      gloss,
      hash: hashOf.get(notePath) ?? '',
      bytes: bytesOf.get(notePath) ?? 0,
      tier: tierOf(notePath, config),
      hops: hit.hops,
      labels: labels.sort(),
    });
  }

  results.sort(compare);
  // Truncation removes from the end of the declared order, so a capped result
  // is always a prefix of the uncapped one, and it is never silent.
  const kept = results.slice(0, maxNotes);
  return {
    entries,
    hops: hopBudget,
    budget: { maxNotes, returned: kept.length, omitted: results.length - kept.length, truncated: results.length > kept.length },
    notes: kept,
  };
}
