import path from 'node:path';
import { GraphIdentityCollisionError } from '../errors.js';
import type { Note } from '../notes/list.js';

/**
 * context-retrieval spec: node identity is the note's path relative to the
 * store root — never the filename stem — so two notes sharing a filename in
 * different directories are two distinct nodes (the failure mode this
 * fixes: pkm's original stem-based graph silently merged such notes).
 *
 * graph-context-document spec (D2): every node also carries a POSITIONAL
 * cluster — the first `cluster_depth` directory segments of its path — so
 * the graph document can group hubs and detect bridges without a single
 * layer name entering the rule.
 */
export interface GraphNode {
  id: string;
  path: string;
  cluster: string;
}

export type DanglingReason = 'not_found' | 'ambiguous';

export interface DanglingLink {
  from: string;
  target: string;
  reason: DanglingReason;
}

/** The edge type of an ordinary wikilink; every other type is a configured relation name (D3). */
export const LINK_EDGE_TYPE = 'link';

export interface GraphEdge {
  src: string;
  dst: string;
  type: string;
}

export interface GraphBuildResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  dangling: DanglingLink[];
}

export interface GraphBuildOptions {
  /** Relation names whose section headings type the wikilinks under them (graph-context-document D3). Empty: no typed edges. */
  relations?: readonly string[];
  /** How many leading directory segments form a node's cluster (graph-context-document D2). */
  clusterDepth?: number;
}

export const DEFAULT_CLUSTER_DEPTH = 2;
/** The cluster of a note that lives directly at the store root. */
export const ROOT_CLUSTER = '(root)';

export function clusterOf(notePath: string, depth: number = DEFAULT_CLUSTER_DEPTH): string {
  const directories = notePath.split('/').slice(0, -1);
  if (directories.length === 0) return ROOT_CLUSTER;
  return directories.slice(0, Math.max(1, depth)).join('/');
}

const WIKILINK_RE = /\[\[([^\]|#]+)/g;
const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/;

export interface LinkOccurrence {
  target: string;
  type: string;
}

function normalizeHeading(text: string): string {
  return text.replace(/:+\s*$/, '').trim().toLowerCase();
}

/**
 * graph-context-document spec (D3): a wikilink inside a section whose
 * heading — trimmed, trailing colon stripped, compared case-insensitively —
 * names a configured relation is typed with that relation; the section ends
 * at the next heading of the same or a higher level. Everything else,
 * including links on heading lines themselves, is an ordinary link. With
 * an empty vocabulary every link is ordinary, so a store that declares no
 * relations gets exactly the graph it had before.
 */
export function extractLinks(body: string, relations: readonly string[] = []): LinkOccurrence[] {
  const vocabulary = new Map<string, string>();
  for (const name of relations) vocabulary.set(normalizeHeading(name), name);

  const links: LinkOccurrence[] = [];
  let section: { type: string; level: number } | null = null;

  for (const line of body.split('\n')) {
    const heading = HEADING_RE.exec(line);
    if (heading) {
      const level = heading[1]!.length;
      const relation = vocabulary.get(normalizeHeading(heading[2]!));
      if (relation !== undefined) {
        section = { type: relation, level };
      } else if (section && level <= section.level) {
        section = null;
      }
      for (const target of targetsIn(line)) links.push({ target, type: LINK_EDGE_TYPE });
      continue;
    }
    for (const target of targetsIn(line)) links.push({ target, type: section?.type ?? LINK_EDGE_TYPE });
  }
  return links;
}

function targetsIn(line: string): string[] {
  const targets: string[] = [];
  let match: RegExpExecArray | null;
  WIKILINK_RE.lastIndex = 0;
  while ((match = WIKILINK_RE.exec(line))) {
    targets.push(match[1]!.trim());
  }
  return targets;
}

/** Every wikilink target in a body, in order, regardless of section — the pre-typed-edge view callers outside the graph still want. */
export function extractLinkTargets(body: string): string[] {
  return extractLinks(body).map((link) => link.target);
}

/**
 * Builds the graph from an in-memory note list, so the fatal-collision path
 * is directly testable by injecting two notes with an identical `.path` —
 * a real `listNotes()` result can never produce this (paths are unique
 * filesystem keys), so this is a defensive check on the invariant, not a
 * scenario reachable through normal use.
 *
 * Wikilinks are resolved by filename stem (Obsidian's own convention, which
 * pkm's content already relies on). An AMBIGUOUS stem — two notes sharing a
 * filename — does not fail the build; it degrades to a reported dangling
 * link, consistent with "two same-named notes are a valid, expected state"
 * (the node-identity requirement's own scenario).
 */
/**
 * The filename-stem -> path(s) index every wikilink resolution in the
 * system reads (the graph build here, and local-browsing-surface's
 * link-resolver) — factored out so both consult exactly one index and can't
 * silently diverge on what a stem resolves to.
 */
export function buildStemIndex(notes: readonly Note[]): Map<string, string[]> {
  const stemIndex = new Map<string, string[]>();
  for (const note of notes) {
    const stem = path.basename(note.path, '.md');
    const list = stemIndex.get(stem) ?? [];
    list.push(note.path);
    stemIndex.set(stem, list);
  }
  return stemIndex;
}

export type StemResolution = { path: string } | { reason: DanglingReason };

/** Classifies a wikilink target against a stem index — exactly one match resolves, zero or many don't. */
export function resolveStem(stemIndex: ReadonlyMap<string, string[]>, target: string): StemResolution {
  const resolved = stemIndex.get(target);
  if (!resolved) return { reason: 'not_found' };
  if (resolved.length > 1) return { reason: 'ambiguous' };
  return { path: resolved[0]! };
}

export function buildGraphFromNotes(notes: readonly Note[], options: GraphBuildOptions = {}): GraphBuildResult {
  const idCounts = new Map<string, number>();
  for (const note of notes) idCounts.set(note.path, (idCounts.get(note.path) ?? 0) + 1);
  const collisions = [...idCounts.entries()].filter(([, count]) => count > 1).map(([id]) => id);
  if (collisions.length > 0) {
    throw new GraphIdentityCollisionError(collisions);
  }

  const stemIndex = buildStemIndex(notes);

  const depth = options.clusterDepth ?? DEFAULT_CLUSTER_DEPTH;
  const nodes: GraphNode[] = notes.map((n) => ({ id: n.path, path: n.path, cluster: clusterOf(n.path, depth) }));
  const edges: GraphEdge[] = [];
  const dangling: DanglingLink[] = [];

  for (const note of notes) {
    for (const { target, type } of extractLinks(note.body, options.relations ?? [])) {
      const resolution = resolveStem(stemIndex, target);
      if ('reason' in resolution) {
        dangling.push({ from: note.path, target, reason: resolution.reason });
      } else {
        edges.push({ src: note.path, dst: resolution.path, type });
      }
    }
  }

  return { nodes, edges, dangling };
}

/** The build options a store's configuration implies — the one place config is translated for the graph. */
export function graphBuildOptions(config: { retrieval: { relations: readonly string[]; graph: { cluster_depth: number } } }): GraphBuildOptions {
  return { relations: config.retrieval.relations, clusterDepth: config.retrieval.graph.cluster_depth };
}
