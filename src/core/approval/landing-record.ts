import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { writeFileAtomic } from '../fs/atomic.js';

/**
 * write-lifecycle spec: where `ctxr land` records a landing for the approval
 * page to read once the worktree is gone. A derived cache path, beside the
 * graph document's, written atomically and never staged.
 */
export const LANDINGS_RELATIVE_PATH = '.contexture/cache/landings';

export interface LandingRecord {
  worktree: string;
  branch: string;
  pull_request: number;
  merged_commit: string | null;
  landed_at: string;
}

function recordPath(storeRoot: string, worktree: string): string {
  return path.join(storeRoot, LANDINGS_RELATIVE_PATH, `${worktree}.json`);
}

export async function writeLandingRecord(storeRoot: string, record: LandingRecord): Promise<void> {
  await mkdir(path.join(storeRoot, LANDINGS_RELATIVE_PATH), { recursive: true });
  await writeFileAtomic(recordPath(storeRoot, record.worktree), `${JSON.stringify(record, null, 2)}\n`);
}

/** The record for `worktree`, or null — including for a name that is not a plain directory name. */
export async function readLandingRecord(storeRoot: string, worktree: string): Promise<LandingRecord | null> {
  if (worktree === '' || worktree.includes('/') || worktree.includes('\\') || worktree.startsWith('.')) return null;
  try {
    return JSON.parse(await readFile(recordPath(storeRoot, worktree), 'utf8')) as LandingRecord;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}
