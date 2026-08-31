import path from 'node:path';
import type { CommandOutcome, CommandRequires } from '../core/command.js';
import type { RunEnv } from '../core/env.js';
import { NoteNotFoundError, SourceIdentityMissingError } from '../core/errors.js';
import { ExitCode } from '../core/exit-codes.js';
import { writeFileAtomic } from '../core/fs/atomic.js';
import { hasSourceIdentity, SOURCE_ALT_IDS_FIELD } from '../core/ingest/identity.js';
import { parseNote } from '../core/notes/parse.js';
import { renderNoteText } from '../core/notes/render.js';
import type { Store } from '../core/store.js';

export const requires: CommandRequires = { store: 'required' };

export interface SourceAddAltFlags {
  path: string;
  id: string;
}

export interface SourceAddAltData {
  path: string;
  altIds: string[];
}

function toStoreRelativePath(env: RunEnv, store: Store, givenPath: string): string {
  const absolute = path.isAbsolute(givenPath) ? givenPath : path.resolve(env.cwd, givenPath);
  return path.relative(store.root, absolute).split(path.sep).join('/');
}

/**
 * context-ingest spec (store-primitives-from-migration-audit D2): appends
 * an alternative source identity to an already-ingested note, so a later
 * `source check` against that identity reports `duplicate` (already_
 * ingested) instead of `new`.
 */
export async function execute(env: RunEnv, store: Store, flags: SourceAddAltFlags): Promise<CommandOutcome<SourceAddAltData>> {
  const relativePath = toStoreRelativePath(env, store, flags.path);
  const absolutePath = path.join(store.root, relativePath);

  let note;
  try {
    note = await parseNote(absolutePath, relativePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw new NoteNotFoundError(relativePath);
    throw err;
  }

  if (!hasSourceIdentity(note)) {
    throw new SourceIdentityMissingError(relativePath);
  }

  const existing = note.frontmatter?.[SOURCE_ALT_IDS_FIELD];
  const currentAlts = Array.isArray(existing) ? existing.filter((id): id is string => typeof id === 'string') : [];
  const altIds = currentAlts.includes(flags.id) ? currentAlts : [...currentAlts, flags.id];

  const frontmatter = { ...note.frontmatter, [SOURCE_ALT_IDS_FIELD]: altIds };
  await writeFileAtomic(absolutePath, renderNoteText(frontmatter, note.body));

  return {
    exitCode: ExitCode.Ok,
    data: { path: relativePath, altIds },
    findings: [],
    humanSummary: `Added alternate source "${flags.id}" to "${relativePath}" (${altIds.length} total).`,
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}
