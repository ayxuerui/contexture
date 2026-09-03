import path from 'node:path';
import type { CommandOutcome, CommandRequires } from '../core/command.js';
import { hashOfCapture } from '../core/ingest/capture-hash.js';
import type { RunEnv } from '../core/env.js';
import { NoteNotFoundError } from '../core/errors.js';
import { ExitCode } from '../core/exit-codes.js';
import { writeFileAtomic } from '../core/fs/atomic.js';
import { SOURCE_HASH_FIELD, SOURCE_ID_FIELD } from '../core/ingest/identity.js';
import { parseNote } from '../core/notes/parse.js';
import { renderNoteText } from '../core/notes/render.js';
import type { Store } from '../core/store.js';

export const requires: CommandRequires = { store: 'required' };

export interface SourceStampFlags {
  path: string;
  id: string;
  hash?: string;
}

export interface SourceStampData {
  path: string;
  sourceId: string;
  sourceHash: string;
}

function toStoreRelativePath(env: RunEnv, store: Store, givenPath: string): string {
  const absolute = path.isAbsolute(givenPath) ? givenPath : path.resolve(env.cwd, givenPath);
  return path.relative(store.root, absolute).split(path.sep).join('/');
}

/**
 * context-ingest spec (store-primitives-from-migration-audit D2): records
 * source identity on a record directly — the opportunistic-backfill path for
 * a legacy note that predates identity fields, a capture an operator filed by
 * hand, or anything else dedupe should recognize without re-running full
 * ingest. `--hash` defaults to the record's CURRENT content hash, computed by
 * the same sidecar-aware primitive `ingest` uses, so stamping a sidecar
 * records its subject's bytes rather than its own prose.
 */
export async function execute(env: RunEnv, store: Store, flags: SourceStampFlags): Promise<CommandOutcome<SourceStampData>> {
  const relativePath = toStoreRelativePath(env, store, flags.path);
  const absolutePath = path.join(store.root, relativePath);

  let note;
  try {
    note = await parseNote(absolutePath, relativePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw new NoteNotFoundError(relativePath);
    throw err;
  }

  const sourceHash = flags.hash ?? (await hashOfCapture(store.root, relativePath)).hash;
  const frontmatter = { ...note.frontmatter, [SOURCE_ID_FIELD]: flags.id, [SOURCE_HASH_FIELD]: sourceHash };
  await writeFileAtomic(absolutePath, renderNoteText(frontmatter, note.body));

  return {
    exitCode: ExitCode.Ok,
    data: { path: relativePath, sourceId: flags.id, sourceHash },
    findings: [],
    humanSummary: `Stamped "${relativePath}" with source "${flags.id}".`,
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}
