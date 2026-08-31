import path from 'node:path';
import type { GitRunner } from './git/exec.js';
import { extractLinkTargets } from './graph/model.js';
import { htmlCommentFence } from './markers.js';
import type { Note } from './notes/list.js';

/** The single fenced region `rollup write` writes into, and the frontmatter timestamp it stamps alongside it. */
export const ROLLUP_FENCE = htmlCommentFence('rollup');
export const ROLLED_UP_FIELD = 'rolled_up';

export function hasRollupSection(note: Note): boolean {
  return note.body.includes(ROLLUP_FENCE.start);
}

function backlinksFor(notes: readonly Note[], entityPath: string): Note[] {
  const stem = path.basename(entityPath, '.md');
  return notes.filter((n) => n.path !== entityPath && extractLinkTargets(n.body).includes(stem));
}

async function lastModified(git: GitRunner, root: string, relativePath: string): Promise<string | null> {
  const result = await git.run(['log', '-1', '--format=%cI', '--', relativePath], { cwd: root, allowFailure: true });
  const date = result.stdout.trim();
  return date.length > 0 ? date : null;
}

export interface StaleRollupEntry {
  entity: string;
  rolledUp: string | null;
  newestBacklink: { path: string; modified: string } | null;
}

/**
 * context-organize spec (D4): staleness is computed, never stored — no
 * cache, no ledger. An entity with no recorded timestamp (but at least one
 * backlink) is always stale; otherwise it is stale once the gap between the
 * newest backlink's last commit and the recorded timestamp exceeds
 * `staleDays`, bounding noise from a backlink edited moments ago. A
 * backlink with no commit history at all (freshly created, uncommitted)
 * counts as newer than any timestamp, since it clearly postdates it.
 */
export async function checkRollupStaleness(
  git: GitRunner,
  root: string,
  entity: Note,
  allNotes: readonly Note[],
  staleDays: number,
): Promise<StaleRollupEntry | null> {
  const recorded = entity.frontmatter?.[ROLLED_UP_FIELD];
  const rolledUp = typeof recorded === 'string' ? recorded : null;
  const backlinks = backlinksFor(allNotes, entity.path);

  let newest: { path: string; modified: string } | null = null;
  for (const backlink of backlinks) {
    const modified = (await lastModified(git, root, backlink.path)) ?? new Date(8640000000000000).toISOString();
    if (!newest || new Date(modified).getTime() > new Date(newest.modified).getTime()) {
      newest = { path: backlink.path, modified };
    }
  }

  if (rolledUp === null) {
    return newest ? { entity: entity.path, rolledUp: null, newestBacklink: newest } : null;
  }
  if (!newest) return null;

  const gapMs = new Date(newest.modified).getTime() - new Date(rolledUp).getTime();
  if (gapMs < staleDays * 24 * 60 * 60 * 1000) return null;

  return { entity: entity.path, rolledUp, newestBacklink: newest };
}

/** Every entity with a rollup section (optionally narrowed to one), reported stale per `checkRollupStaleness`. */
export async function findStaleRollups(
  git: GitRunner,
  root: string,
  notes: readonly Note[],
  options: { entity?: string } = {},
  staleDays = 0,
): Promise<StaleRollupEntry[]> {
  const candidates = notes.filter((n) => hasRollupSection(n) && (!options.entity || n.path === options.entity));
  const results: StaleRollupEntry[] = [];
  for (const candidate of candidates) {
    const entry = await checkRollupStaleness(git, root, candidate, notes, staleDays);
    if (entry) results.push(entry);
  }
  return results.sort((a, b) => a.entity.localeCompare(b.entity));
}
