import { readFile } from 'node:fs/promises';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { writeFileAtomic } from './fs/atomic.js';

/**
 * A structured-JSON counterpart to the marker-fenced text writer (context-
 * store spec's generated-region convention): JSON has no comment syntax to
 * carry a fence marker in, so a harness permission config (task 8.4) is
 * merged by array union instead — contexture's own rules are appended only
 * if not already present, so a hand-added rule survives untouched and a
 * second run with the same rule set is a true no-op (byte-identical file,
 * no write at all).
 */
export async function mergeJsonArrayLists(
  filePath: string,
  patch: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>>,
): Promise<{ changed: boolean }> {
  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(await readFile(filePath, 'utf8')) as Record<string, unknown>;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }

  const before = JSON.stringify(existing);
  const merged: Record<string, unknown> = { ...existing };

  for (const [topKey, sections] of Object.entries(patch)) {
    const existingTop = (merged[topKey] as Record<string, unknown> | undefined) ?? {};
    const mergedTop: Record<string, unknown> = { ...existingTop };
    for (const [listKey, newValues] of Object.entries(sections)) {
      const existingList = Array.isArray(existingTop[listKey]) ? (existingTop[listKey] as string[]) : [];
      const additions = newValues.filter((v) => !existingList.includes(v));
      mergedTop[listKey] = [...existingList, ...additions];
    }
    merged[topKey] = mergedTop;
  }

  const after = JSON.stringify(merged);
  if (after === before) {
    return { changed: false };
  }

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFileAtomic(filePath, `${JSON.stringify(merged, null, 2)}\n`);
  return { changed: true };
}
