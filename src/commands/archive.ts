import { existsSync, statSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { CommandOutcome, CommandRequires } from '../core/command.js';
import type { RunEnv } from '../core/env.js';
import { AlreadyArchivedError, ArchiveDestinationExistsError, NoteNotFoundError, NoteNotTrackedError } from '../core/errors.js';
import { ExitCode } from '../core/exit-codes.js';
import { isTracked, movePath } from '../core/git/repo.js';
import { extractLinkTargets } from '../core/graph/model.js';
import { listNotes } from '../core/notes/list.js';
import type { Store } from '../core/store.js';

export const requires: CommandRequires = { store: 'required' };

export interface ArchiveFlags {
  path: string;
}

export interface ArchiveData {
  path: string;
  newPath: string;
  linkingNotes: string[];
}

function toStoreRelativePath(env: RunEnv, store: Store, givenPath: string): string {
  const absolute = path.isAbsolute(givenPath) ? givenPath : path.resolve(env.cwd, givenPath);
  return path.relative(store.root, absolute).split(path.sep).join('/');
}

/**
 * context-organize spec: archiving is a single tracked rename (via
 * core/git/repo.ts's movePath, the Phase 1.5 primitive) — never a
 * read+delete+rewrite — so the note's frontmatter is untouched by
 * construction, and `git log --follow`
 * on the new path returns its full prior history. The destination is the
 * source's store-relative path beneath `organize.archive_destination`
 * (research-and-capture-identity D4): the path is copied as it is, never
 * interpreted, so this works identically under any configured taxonomy. A
 * shipped profile may seed that value at init
 * (archive-destination-from-taxonomy), but nothing here reads the taxonomy.
 *
 * Wikilinks resolve by filename stem (context-retrieval spec), and archive
 * never changes a note's filename — only its directory — so no other
 * note's link actually breaks. `linkingNotes` is reported purely so the
 * operator is aware those notes now point at the archived location.
 */
export async function execute(env: RunEnv, store: Store, flags: ArchiveFlags): Promise<CommandOutcome<ArchiveData>> {
  const relativePath = toStoreRelativePath(env, store, flags.path).replace(/\/+$/, '');
  const absolutePath = path.join(store.root, relativePath);
  if (!existsSync(absolutePath)) throw new NoteNotFoundError(relativePath);

  // research-and-capture-identity: a folder (a project with its supporting
  // notes) archives whole — one tracked rename — rather than note by note.
  // Either way the item keeps its path beneath the destination, so the archive
  // shows where it lived and the reverse rename restores it.
  const destination = store.config.organize.archive_destination.replace(/\/+$/, '');
  if (relativePath === destination || relativePath.startsWith(`${destination}/`)) {
    throw new AlreadyArchivedError(relativePath, store.config.organize.archive_destination);
  }
  const isFolder = statSync(absolutePath).isDirectory();
  const newRelativePath = `${destination}/${relativePath}`;
  const newAbsolutePath = path.join(store.root, newRelativePath);

  if (existsSync(newAbsolutePath)) {
    throw new ArchiveDestinationExistsError(newRelativePath);
  }

  const notes = await listNotes(store.root, store.config);
  const moving = isFolder ? notes.filter((note) => note.path.startsWith(`${relativePath}/`)) : notes.filter((note) => note.path === relativePath);
  const movingPaths = new Set(moving.map((note) => note.path));
  const stems = new Set(isFolder ? moving.map((note) => path.basename(note.path, '.md')) : [path.basename(relativePath, '.md')]);
  const linkingNotes = notes
    .filter((note) => !movingPaths.has(note.path))
    .filter((note) => extractLinkTargets(note.body).some((target) => stems.has(target)))
    .map((note) => note.path)
    .sort();

  if (!(await isTracked(env.git, store.root, relativePath))) {
    throw new NoteNotTrackedError(relativePath);
  }
  await mkdir(path.dirname(newAbsolutePath), { recursive: true });
  await movePath(env.git, store.root, relativePath, newRelativePath);

  return {
    exitCode: ExitCode.Ok,
    data: { path: relativePath, newPath: newRelativePath, linkingNotes },
    findings: [],
    humanSummary: `Archived ${isFolder ? `folder "${relativePath}" (${moving.length} note(s))` : `"${relativePath}"`} to "${newRelativePath}"${linkingNotes.length > 0 ? ` (${linkingNotes.length} note(s) link to it)` : ''}.`,
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}
