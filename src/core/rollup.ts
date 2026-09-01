import path from 'node:path';
import type { GitRunner } from './git/exec.js';
import { extractLinkTargets } from './graph/model.js';
import { htmlCommentFence } from './markers.js';
import type { Note } from './notes/list.js';
import { parseNote } from './notes/parse.js';

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

/**
 * context-organize spec (D3, generalize-identity-migration-residue): a
 * store-wide mission document has no natural backlink set — nothing
 * wikilinks "the mission" — so its staleness is purely time-based: no
 * recorded timestamp, or one older than `staleDays`, is stale. No git call,
 * no backlink computation. `newestBacklink` is always `null`, which never
 * occurs for a *stale* entry under `checkRollupStaleness`'s backlink rule
 * (an entity with no backlinks is never reported stale there), so `null`
 * unambiguously marks a mission-rule entry to any caller that cares.
 */
export function checkMissionStaleness(note: Note, staleDays: number, now: Date): StaleRollupEntry | null {
  const recorded = note.frontmatter?.[ROLLED_UP_FIELD];
  const rolledUp = typeof recorded === 'string' ? recorded : null;

  if (rolledUp === null) {
    return { entity: note.path, rolledUp: null, newestBacklink: null };
  }

  const elapsedMs = now.getTime() - new Date(rolledUp).getTime();
  if (elapsedMs < staleDays * 24 * 60 * 60 * 1000) return null;

  return { entity: note.path, rolledUp, newestBacklink: null };
}

/**
 * compose-store-guidance-documents: the mission document typically lives
 * under the guidance directory, which is excluded from the store's note
 * listing (tool-owned instruction docs are never notes — see
 * `excludedPrefixesFor`), so it is read directly by path here rather than
 * looked up in the `notes` array `findStaleRollups` already has. A missing
 * file (never seeded, or a hand-configured path that doesn't exist yet)
 * yields no candidate, the same as the old array-lookup did when nothing
 * matched.
 */
async function readMissionNote(root: string, missionPath: string): Promise<Note | null> {
  try {
    return await parseNote(path.join(root, missionPath), missionPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * Every entity with a rollup section (optionally narrowed to one), reported
 * stale per `checkRollupStaleness`, plus — when `missionPath` names a
 * document that exists on disk — that one path via `checkMissionStaleness`
 * instead of the backlink-based entity scan, even when it carries no
 * `ROLLUP_FENCE` yet (an unwritten mission document must surface as
 * needing its first write, not be silently excluded by `hasRollupSection`).
 * The two candidate sources are de-duplicated by entity path before
 * returning; a path matching both the entity scan and the configured
 * `missionPath` is reported once, under the mission (time-based) rule,
 * since that is the operator's explicit configuration choice for that path.
 */
export async function findStaleRollups(
  git: GitRunner,
  root: string,
  notes: readonly Note[],
  options: { entity?: string; missionPath?: string } = {},
  staleDays = 0,
  now: Date = new Date(),
): Promise<StaleRollupEntry[]> {
  const candidates = notes.filter((n) => hasRollupSection(n) && (!options.entity || n.path === options.entity));
  const byPath = new Map<string, StaleRollupEntry>();
  for (const candidate of candidates) {
    const entry = await checkRollupStaleness(git, root, candidate, notes, staleDays);
    if (entry) byPath.set(entry.entity, entry);
  }

  if (options.missionPath && (!options.entity || options.entity === options.missionPath)) {
    const missionNote = await readMissionNote(root, options.missionPath);
    if (missionNote) {
      const entry = checkMissionStaleness(missionNote, staleDays, now);
      // The mission rule OWNS this path once configured: it overrides the
      // entity scan's verdict for the same note either way — sets a stale
      // entry, or clears one the backlink-based scan produced — never a
      // blend of both rules for one path.
      if (entry) byPath.set(options.missionPath, entry);
      else byPath.delete(options.missionPath);
    }
  }

  return [...byPath.values()].sort((a, b) => a.entity.localeCompare(b.entity));
}
