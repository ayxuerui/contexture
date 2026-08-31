import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { writeFileAtomic } from './fs/atomic.js';

/**
 * write-lifecycle spec: append-via-queue for shared append-only files. Two
 * sessions on separate branches genuinely cannot both append to the same
 * file (e.g. a chronological log) without conflicting when merged — so each
 * queues a uniquely named, self-contained intent file instead, and a
 * reconciler applies them in order (oldest first, by the epoch-ms prefix).
 */
const QUEUE_DIR_NAME = '.queue';
const TARGET_HEADER_PREFIX = 'target: ';

function isValidTarget(relativePath: string): boolean {
  return !path.isAbsolute(relativePath) && !relativePath.split('/').includes('..') && relativePath.endsWith('.md');
}

export async function queueAppend(storeRoot: string, targetRelativePath: string, content: string): Promise<string> {
  if (!isValidTarget(targetRelativePath)) {
    throw new Error(`Invalid queue target path: "${targetRelativePath}" (must be a relative .md path with no "..").`);
  }
  const queueDir = path.join(storeRoot, QUEUE_DIR_NAME);
  await mkdir(queueDir, { recursive: true });
  const fileName = `${Date.now()}__${randomBytes(4).toString('hex')}.append`;
  const filePath = path.join(queueDir, fileName);
  await writeFileAtomic(filePath, `${TARGET_HEADER_PREFIX}${targetRelativePath}\n${content}`);
  return filePath;
}

export interface AppliedEntry {
  file: string;
  target: string;
}

export interface ReconcileSummary {
  applied: AppliedEntry[];
}

/**
 * Applies every pending queue file to its target, oldest first, deleting
 * each as it's applied. A malformed entry (missing header, path escaping
 * the store, or a non-.md target) throws rather than being silently
 * skipped or guessed at.
 */
export async function reconcileQueue(storeRoot: string): Promise<ReconcileSummary> {
  const queueDir = path.join(storeRoot, QUEUE_DIR_NAME);
  let entries: string[];
  try {
    entries = await readdir(queueDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { applied: [] };
    throw err;
  }

  const appendFiles = entries.filter((e) => e.endsWith('.append')).sort();
  const applied: AppliedEntry[] = [];

  for (const fileName of appendFiles) {
    const filePath = path.join(queueDir, fileName);
    const raw = await readFile(filePath, 'utf8');
    const newlineIndex = raw.indexOf('\n');
    if (newlineIndex === -1 || !raw.startsWith(TARGET_HEADER_PREFIX)) {
      throw new Error(`Malformed queue file "${fileName}": missing "target: <path>" header.`);
    }
    const targetRelativePath = raw.slice(TARGET_HEADER_PREFIX.length, newlineIndex).trim();
    if (!isValidTarget(targetRelativePath)) {
      throw new Error(`Malformed queue file "${fileName}": invalid target "${targetRelativePath}".`);
    }
    const body = raw.slice(newlineIndex + 1);
    const targetPath = path.join(storeRoot, targetRelativePath);

    let existing = '';
    try {
      existing = await readFile(targetPath, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
    const separator = existing.length > 0 && !existing.endsWith('\n') ? '\n' : '';
    await writeFileAtomic(targetPath, `${existing}${separator}${body}`);
    await rm(filePath);
    applied.push({ file: fileName, target: targetRelativePath });
  }

  return { applied };
}
