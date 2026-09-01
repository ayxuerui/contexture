import { readFile } from 'node:fs/promises';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { writeFileAtomic } from './fs/atomic.js';

/** A Claude Code hook-config entry, e.g. one `hooks.PreToolUse[]` element. */
export interface HookMatcherEntry {
  matcher: string;
  hooks: readonly { type: string; command: string; [key: string]: unknown }[];
  [key: string]: unknown;
}

export type MergeListValue = readonly string[] | readonly HookMatcherEntry[];
export type MergePatch = Readonly<Record<string, Readonly<Record<string, MergeListValue>>>>;
export type RemovePatch = Readonly<Record<string, Readonly<Record<string, readonly string[]>>>>;

function isHookEntryList(value: MergeListValue): value is readonly HookMatcherEntry[] {
  return value.length > 0 && typeof value[0] === 'object' && value[0] !== null;
}

/**
 * Upserts each incoming hook-matcher entry into the existing list, matched
 * by its own `hooks[0].command` (the path to contexture's generated
 * script): replaced in place when found, so regeneration is idempotent,
 * appended otherwise. Any entry with a different command — an operator's
 * own hook — is left untouched.
 */
function mergeHookEntries(existing: readonly HookMatcherEntry[], incoming: readonly HookMatcherEntry[]): HookMatcherEntry[] {
  let result = [...existing];
  for (const entry of incoming) {
    const command = entry.hooks[0]?.command;
    const index = result.findIndex((candidate) => candidate.hooks?.[0]?.command === command);
    result = index === -1 ? [...result, entry] : result.map((candidate, i) => (i === index ? entry : candidate));
  }
  return result;
}

/**
 * A structured-JSON counterpart to the marker-fenced text writer (context-
 * store spec's generated-region convention): JSON has no comment syntax to
 * carry a fence marker in, so a harness permission config (task 8.4) is
 * merged by list union instead — contexture's own rules are appended only
 * if not already present, so a hand-added rule survives untouched and a
 * second run with the same rule set is a true no-op (byte-identical file,
 * no write at all).
 *
 * Two list shapes are supported: a string list (permission rules), unioned
 * and, when `options.remove` names entries a previous release emitted, first
 * pruned of exact matches (never a predicate sweep — that would also catch a
 * hand-added rule of the same shape); and a hook-matcher-entry list, upserted
 * by `mergeHookEntries` above. A list key that empties out because removal
 * took its last entry is dropped entirely, so a migrated store converges to
 * the same shape as a freshly generated one; a list key that was already an
 * empty array on disk, untouched by removal, is left as `[]`.
 */
export async function mergeJsonArrayLists(
  filePath: string,
  patch: MergePatch,
  options?: { remove?: RemovePatch },
): Promise<{ changed: boolean }> {
  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(await readFile(filePath, 'utf8')) as Record<string, unknown>;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }

  const before = JSON.stringify(existing);
  const merged: Record<string, unknown> = { ...existing };
  const removePatch = options?.remove ?? {};
  const topKeys = new Set([...Object.keys(patch), ...Object.keys(removePatch)]);

  for (const topKey of topKeys) {
    const sections = patch[topKey] ?? {};
    const removeSections = removePatch[topKey] ?? {};
    const existingTop = (merged[topKey] as Record<string, unknown> | undefined) ?? {};
    const mergedTop: Record<string, unknown> = { ...existingTop };
    const listKeys = new Set([...Object.keys(sections), ...Object.keys(removeSections)]);

    for (const listKey of listKeys) {
      const newValues = sections[listKey] ?? [];
      const toRemove = removeSections[listKey] ?? [];
      const existingRaw = existingTop[listKey];
      const existingListPresent = Array.isArray(existingRaw);
      const existingList = existingListPresent ? (existingRaw as unknown[]) : [];

      if (isHookEntryList(newValues) || (existingList.length > 0 && typeof existingList[0] === 'object')) {
        mergedTop[listKey] = mergeHookEntries(existingList as HookMatcherEntry[], newValues as readonly HookMatcherEntry[]);
        continue;
      }

      const existingStrings = existingList as string[];
      const removedCount = existingStrings.filter((v) => toRemove.includes(v)).length;
      const afterRemoval = existingStrings.filter((v) => !toRemove.includes(v));
      const additions = (newValues as readonly string[]).filter((v) => !afterRemoval.includes(v));
      const result = [...afterRemoval, ...additions];

      if (result.length === 0) {
        if (removedCount > 0) {
          delete mergedTop[listKey];
        } else if (existingListPresent && existingStrings.length === 0) {
          mergedTop[listKey] = [];
        }
        continue;
      }
      mergedTop[listKey] = result;
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
