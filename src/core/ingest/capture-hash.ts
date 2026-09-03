import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { contentHash, contentHashOfBytes } from '../content/canonicalize.js';
import { CaptureFileMissingError } from '../errors.js';
import { parseNoteText } from '../notes/parse.js';
import { CAPTURE_FILE_FIELD } from './identity.js';

export interface CaptureHash {
  hash: string;
  /** The file the hash was actually taken over — the sidecar's subject when there is one, otherwise the capture itself. */
  hashedPath: string;
}

/**
 * context-ingest spec: one place that answers "what is this capture's content
 * hash", so `source check` and `ingest` can never disagree about it.
 *
 * A markdown capture hashes its own canonicalized body. A capture that is not
 * markdown cannot carry frontmatter, so it is represented by a sidecar naming
 * it, and the hash is taken over the named file's bytes — the sidecar's own
 * prose is a description of the capture, not the capture.
 */
export async function hashOfCapture(storeRoot: string, relativePath: string): Promise<CaptureHash> {
  const raw = await readFile(path.join(storeRoot, relativePath), 'utf8');
  const captureFile = parseNoteText(raw, relativePath).frontmatter?.[CAPTURE_FILE_FIELD];
  if (typeof captureFile !== 'string' || captureFile === '') {
    return { hash: contentHash(raw, relativePath), hashedPath: relativePath };
  }

  const subjectPath = path.posix.join(path.posix.dirname(relativePath), captureFile);
  let bytes: Uint8Array;
  try {
    bytes = await readFile(path.join(storeRoot, subjectPath));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw new CaptureFileMissingError(relativePath, subjectPath);
    throw err;
  }
  return { hash: contentHashOfBytes(bytes), hashedPath: subjectPath };
}
