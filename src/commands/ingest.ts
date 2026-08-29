import path from 'node:path';
import type { CommandOutcome, CommandRequires } from '../core/command.js';
import { buildCatalog } from '../core/catalog/build.js';
import { contentHashOfBody } from '../core/content/canonicalize.js';
import type { RunEnv } from '../core/env.js';
import { AlreadyIngestedError, NoteNotFoundError } from '../core/errors.js';
import { ExitCode } from '../core/exit-codes.js';
import { writeFileAtomic } from '../core/fs/atomic.js';
import { hasSourceIdentity, INGESTED_FIELD, SOURCE_HASH_FIELD, SOURCE_ID_FIELD, SOURCE_TYPE_FIELD } from '../core/ingest/identity.js';
import { parseNote } from '../core/notes/parse.js';
import { renderNoteText } from '../core/notes/render.js';
import type { Store } from '../core/store.js';

export const requires: CommandRequires = { store: 'required' };

export interface IngestFlags {
  path: string;
  sourceType: string;
  sourceId: string;
}

export interface IngestData {
  path: string;
  sourceType: string;
  sourceId: string;
  sourceHash: string;
  ingested: string;
}

function toStoreRelativePath(env: RunEnv, store: Store, givenPath: string): string {
  const absolute = path.isAbsolute(givenPath) ? givenPath : path.resolve(env.cwd, givenPath);
  return path.relative(store.root, absolute).split(path.sep).join('/');
}

/**
 * context-ingest spec: identity fields are assigned once, here, and never
 * recomputed from the live body afterward — the hash computed in this
 * function IS the frozen source-hash for this note's lifetime. Rebuilding
 * the catalog before returning (rather than documenting it as a required
 * next step) is this codebase's choice for task 6.6: a successful write
 * leaves its own derived-artifact consequence consistent immediately,
 * matching every other writer in the system (init's .gitignore/AGENTS.md
 * reconciliation, catalog build itself).
 */
export async function execute(env: RunEnv, store: Store, flags: IngestFlags): Promise<CommandOutcome<IngestData>> {
  const relativePath = toStoreRelativePath(env, store, flags.path);
  const absolutePath = path.join(store.root, relativePath);

  let note;
  try {
    note = await parseNote(absolutePath, relativePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw new NoteNotFoundError(relativePath);
    throw err;
  }

  if (hasSourceIdentity(note)) {
    throw new AlreadyIngestedError(relativePath);
  }

  const sourceHash = contentHashOfBody(note.body);
  const ingested = env.now().toISOString();
  const frontmatter = {
    ...note.frontmatter,
    [SOURCE_TYPE_FIELD]: flags.sourceType,
    [SOURCE_ID_FIELD]: flags.sourceId,
    [SOURCE_HASH_FIELD]: sourceHash,
    [INGESTED_FIELD]: ingested,
  };

  await writeFileAtomic(absolutePath, renderNoteText(frontmatter, note.body));
  await buildCatalog(store);

  return {
    exitCode: ExitCode.Ok,
    data: { path: relativePath, sourceType: flags.sourceType, sourceId: flags.sourceId, sourceHash, ingested },
    findings: [],
    humanSummary: `Ingested "${relativePath}" (source: ${flags.sourceType}/${flags.sourceId}).`,
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}
