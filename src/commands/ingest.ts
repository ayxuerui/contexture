import { existsSync } from 'node:fs';
import { mkdir, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { CommandOutcome, CommandRequires } from '../core/command.js';
import { buildCatalog } from '../core/catalog/build.js';
import type { RunEnv } from '../core/env.js';
import { AlreadyIngestedError, CaptureDestinationExistsError, NoteNotFoundError } from '../core/errors.js';
import { ExitCode } from '../core/exit-codes.js';
import { isUnderPrefix } from '../core/fs/prefix.js';
import { writeFileAtomic } from '../core/fs/atomic.js';
import { hashOfCapture } from '../core/ingest/capture-hash.js';
import {
  CAPTURE_FILE_FIELD,
  hasAssignedIdentity,
  INGESTED_FIELD,
  SOURCE_HASH_FIELD,
  SOURCE_ID_FIELD,
  SOURCE_TYPE_FIELD,
  SOURCES_FIELD,
} from '../core/ingest/identity.js';
import { parseNote } from '../core/notes/parse.js';
import { renderNoteText } from '../core/notes/render.js';
import type { Store } from '../core/store.js';

export const requires: CommandRequires = { store: 'required' };

export interface IngestFlags {
  path: string;
  into: string;
  sourceType: string;
  sourceId: string;
}

export interface IngestData {
  /** Where the capture was retained — its path after the move out of the inbox. */
  capture: string;
  /** The note that now cites it. */
  note: string;
  sourceType: string;
  sourceId: string;
  sourceHash: string;
  ingested: string;
}

function toStoreRelativePath(env: RunEnv, store: Store, givenPath: string): string {
  const absolute = path.isAbsolute(givenPath) ? givenPath : path.resolve(env.cwd, givenPath);
  return path.relative(store.root, absolute).split(path.sep).join('/');
}

/** The capture tier's directory for a given moment: one per month of ingest, created lazily. */
function ledgerDirectoryFor(captureRoot: string, when: Date): string {
  const month = `${when.getUTCFullYear()}${String(when.getUTCMonth() + 1).padStart(2, '0')}`;
  return `${captureRoot.replace(/\/+$/, '')}/${month}`;
}

/**
 * The capture's path after ingest. A capture waiting in the inbox moves into
 * the month's directory; one already retained (a re-stamp, or a capture an
 * operator filed by hand) stays exactly where it is.
 */
function retainedPathFor(config: Store['config'], capturePath: string, when: Date): string {
  if (!isUnderPrefix(capturePath, config.ingest.inbox_path)) return capturePath;
  return `${ledgerDirectoryFor(config.ingest.capture_root, when)}/${path.posix.basename(capturePath)}`;
}

async function readOrThrow(store: Store, relativePath: string) {
  try {
    return await parseNote(path.join(store.root, relativePath), relativePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw new NoteNotFoundError(relativePath);
    throw err;
  }
}

/** Appends a capture path to a note's source list without disturbing one already cited. */
function citedSources(frontmatter: Record<string, unknown> | undefined, capturePath: string): string[] {
  const existing = frontmatter?.[SOURCES_FIELD];
  const cited = Array.isArray(existing) ? existing.filter((entry): entry is string => typeof entry === 'string') : [];
  return cited.includes(capturePath) ? cited : [...cited, capturePath];
}

/**
 * context-ingest spec: identity is assigned once, here, onto the CAPTURE —
 * the file that arrived — and never recomputed from it afterwards. The
 * destination note is the synthesis, free to be rewritten without touching
 * the hash, and it may already exist: expanding, merging and restructuring
 * record provenance on the same footing as creating, which is the whole point
 * of retaining the capture rather than consuming it.
 *
 * Order matters for resumability. The capture is written to its retained
 * location before the old one is removed, and the note is cited last, so an
 * interruption leaves either an un-ingested capture or a retained one that a
 * re-run can cite — never a note citing a path that does not exist.
 *
 * Rebuilding the catalog before returning (rather than documenting it as a
 * required next step) is this codebase's choice: a successful write leaves
 * its own derived-artifact consequence consistent immediately, matching every
 * other writer in the system. The retained capture takes no catalog entry —
 * the capture root is a retrieval exclusion, so it is not a note.
 */
export async function execute(env: RunEnv, store: Store, flags: IngestFlags): Promise<CommandOutcome<IngestData>> {
  const capturePath = toStoreRelativePath(env, store, flags.path);
  const notePath = toStoreRelativePath(env, store, flags.into);

  const capture = await readOrThrow(store, capturePath);
  if (hasAssignedIdentity(capture)) {
    throw new AlreadyIngestedError(capturePath);
  }
  const note = await readOrThrow(store, notePath);

  const { hash: sourceHash } = await hashOfCapture(store.root, capturePath);
  const ingested = env.now().toISOString();
  const retainedPath = retainedPathFor(store.config, capturePath, env.now());
  if (retainedPath !== capturePath && existsSync(path.join(store.root, retainedPath))) {
    throw new CaptureDestinationExistsError(retainedPath);
  }

  const stampedFrontmatter = {
    ...capture.frontmatter,
    [SOURCE_TYPE_FIELD]: flags.sourceType,
    [SOURCE_ID_FIELD]: flags.sourceId,
    [SOURCE_HASH_FIELD]: sourceHash,
    [INGESTED_FIELD]: ingested,
  };
  await mkdir(path.dirname(path.join(store.root, retainedPath)), { recursive: true });
  await writeFileAtomic(path.join(store.root, retainedPath), renderNoteText(stampedFrontmatter, capture.body));
  if (retainedPath !== capturePath) {
    await unlink(path.join(store.root, capturePath));
    await moveSidecarSubject(store, capture.frontmatter, capturePath, retainedPath);
  }

  const noteFrontmatter = { ...note.frontmatter, [SOURCES_FIELD]: citedSources(note.frontmatter, retainedPath) };
  await writeFileAtomic(path.join(store.root, notePath), renderNoteText(noteFrontmatter, note.body));
  await buildCatalog(store);

  return {
    exitCode: ExitCode.Ok,
    data: { capture: retainedPath, note: notePath, sourceType: flags.sourceType, sourceId: flags.sourceId, sourceHash, ingested },
    findings: [],
    humanSummary: `Retained "${retainedPath}" (source: ${flags.sourceType}/${flags.sourceId}) and cited it from "${notePath}".`,
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}

/**
 * A sidecar names a file beside it, so moving the sidecar without its subject
 * would leave the name dangling and the hash unverifiable. The subject moves
 * with it, into the same directory, keeping the sidecar's relative name valid.
 */
async function moveSidecarSubject(
  store: Store,
  frontmatter: Record<string, unknown> | undefined,
  fromPath: string,
  toPath: string,
): Promise<void> {
  const captureFile = frontmatter?.[CAPTURE_FILE_FIELD];
  if (typeof captureFile !== 'string' || captureFile === '') return;
  const from = path.join(store.root, path.posix.dirname(fromPath), captureFile);
  const to = path.join(store.root, path.posix.dirname(toPath), captureFile);
  if (!existsSync(from) || existsSync(to)) return;
  await rename(from, to);
}
