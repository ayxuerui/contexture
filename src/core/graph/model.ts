import path from 'node:path';
import { GraphIdentityCollisionError } from '../errors.js';
import type { Note } from '../notes/list.js';

/**
 * context-retrieval spec: node identity is the note's path relative to the
 * store root — never the filename stem — so two notes sharing a filename in
 * different directories are two distinct nodes (the failure mode this
 * fixes: pkm's original stem-based graph silently merged such notes).
 */
export interface GraphNode {
  id: string;
  path: string;
}

export type DanglingReason = 'not_found' | 'ambiguous';

export interface DanglingLink {
  from: string;
  target: string;
  reason: DanglingReason;
}

export interface GraphEdge {
  src: string;
  dst: string;
  type: 'link';
}

export interface GraphBuildResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  dangling: DanglingLink[];
}

const WIKILINK_RE = /\[\[([^\]|#]+)/g;

function extractLinkTargets(body: string): string[] {
  const targets: string[] = [];
  let match: RegExpExecArray | null;
  WIKILINK_RE.lastIndex = 0;
  while ((match = WIKILINK_RE.exec(body))) {
    targets.push(match[1]!.trim());
  }
  return targets;
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
export function buildGraphFromNotes(notes: readonly Note[]): GraphBuildResult {
  const idCounts = new Map<string, number>();
  for (const note of notes) idCounts.set(note.path, (idCounts.get(note.path) ?? 0) + 1);
  const collisions = [...idCounts.entries()].filter(([, count]) => count > 1).map(([id]) => id);
  if (collisions.length > 0) {
    throw new GraphIdentityCollisionError(collisions);
  }

  const stemIndex = new Map<string, string[]>();
  for (const note of notes) {
    const stem = path.basename(note.path, '.md');
    const list = stemIndex.get(stem) ?? [];
    list.push(note.path);
    stemIndex.set(stem, list);
  }

  const nodes: GraphNode[] = notes.map((n) => ({ id: n.path, path: n.path }));
  const edges: GraphEdge[] = [];
  const dangling: DanglingLink[] = [];

  for (const note of notes) {
    for (const target of extractLinkTargets(note.body)) {
      const resolved = stemIndex.get(target);
      if (!resolved) {
        dangling.push({ from: note.path, target, reason: 'not_found' });
      } else if (resolved.length > 1) {
        dangling.push({ from: note.path, target, reason: 'ambiguous' });
      } else {
        edges.push({ src: note.path, dst: resolved[0]!, type: 'link' });
      }
    }
  }

  return { nodes, edges, dangling };
}
