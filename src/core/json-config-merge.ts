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
/**
 * Entries a previous release emitted that the current one no longer does.
 * Carries both vocabularies: a string list (permission rules, removed by
 * exact match) and a hook-entry list (removed by the same
 * `(matcher, script basename)` identity `mergeHookEntries` upserts by, so a
 * hook retired outright is removed whatever absolute path any past release
 * baked into it — retire-the-write-gate).
 */
export type RemovePatch = Readonly<Record<string, Readonly<Record<string, MergeListValue>>>>;

function isHookEntryList(value: MergeListValue): value is readonly HookMatcherEntry[] {
  return value.length > 0 && typeof value[0] === 'object' && value[0] !== null;
}

/** The filename a hook entry's command invokes, independent of the absolute path it's rooted at. */
function hookCommandBasename(entry: HookMatcherEntry): string {
  const command = entry.hooks[0]?.command;
  return command ? path.basename(command) : '';
}

/**
 * Upserts each incoming hook-matcher entry into the existing list, matched
 * by `(matcher, hookCommandBasename)` rather than the full command string —
 * deliberately blind to the absolute path prefix, since that prefix is
 * whichever checkout most recently generated it (typically a session
 * worktree) and so is not stable across runs even for the SAME logical
 * rule (stabilize-write-gate-hook-path). The first matching existing entry
 * is replaced in place (preserving its position, so an unrelated
 * hand-added entry elsewhere in the array is never reordered); any further
 * entries that also match are dropped, so a list that has already
 * accumulated more than one stale copy of contexture's own entry (e.g. one
 * per session worktree that ever regenerated it) converges to exactly one
 * on this run, not just on a version bump. An entry with a different
 * matcher or a different script basename — an operator's own hook — is
 * always left untouched.
 */
/**
 * The identity two hook entries are "the same rule" by: same matcher, same
 * script filename, deliberately ignoring the path prefix. Shared by the
 * upsert below and by retirement removal, so the two can never disagree
 * about which entry is contexture's and which is the operator's.
 */
function isSameHook(a: HookMatcherEntry, b: HookMatcherEntry): boolean {
  return a.matcher === b.matcher && hookCommandBasename(a) === hookCommandBasename(b);
}

/** Drops every entry matching one this release has retired; leaves all others. */
function removeHookEntries(existing: readonly HookMatcherEntry[], retired: readonly HookMatcherEntry[]): HookMatcherEntry[] {
  if (retired.length === 0) return [...existing];
  return existing.filter((candidate) => !retired.some((r) => isSameHook(candidate, r)));
}

function mergeHookEntries(existing: readonly HookMatcherEntry[], incoming: readonly HookMatcherEntry[]): HookMatcherEntry[] {
  let result = [...existing];
  for (const entry of incoming) {
    let inserted = false;
    result = result.flatMap((candidate) => {
      if (!isSameHook(candidate, entry)) return [candidate];
      if (inserted) return []; // a further stale duplicate of the same rule — drop it
      inserted = true;
      return [entry]; // replace the first match in place
    });
    if (!inserted) result = [...result, entry];
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
      const toRemove: MergeListValue = removeSections[listKey] ?? [];
      const existingRaw = existingTop[listKey];
      const existingListPresent = Array.isArray(existingRaw);
      const existingList = existingListPresent ? (existingRaw as unknown[]) : [];

      if (isHookEntryList(newValues) || isHookEntryList(toRemove) || (existingList.length > 0 && typeof existingList[0] === 'object')) {
        const retired = isHookEntryList(toRemove) ? toRemove : [];
        const kept = removeHookEntries(existingList as HookMatcherEntry[], retired);
        const result = mergeHookEntries(kept, isHookEntryList(newValues) ? newValues : []);
        // A list emptied by retirement is dropped rather than left as [],
        // matching the string branch below, so a store that converges to no
        // generated hook at all ends with no vestigial key.
        if (result.length === 0) delete mergedTop[listKey];
        else mergedTop[listKey] = result;
        continue;
      }

      const existingStrings = existingList as string[];
      const removeStrings = toRemove as readonly string[];
      const removedCount = existingStrings.filter((v) => removeStrings.includes(v)).length;
      const afterRemoval = existingStrings.filter((v) => !removeStrings.includes(v));
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

    // Same rule one level up: a section left empty by retirement is dropped,
    // unless it was already an empty object on disk (the operator's, not ours).
    const topWasEmptyOnDisk = topKey in existing && Object.keys(existingTop).length === 0;
    if (Object.keys(mergedTop).length === 0 && !topWasEmptyOnDisk) delete merged[topKey];
    else merged[topKey] = mergedTop;
  }

  const after = JSON.stringify(merged);
  if (after === before) {
    return { changed: false };
  }

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFileAtomic(filePath, `${JSON.stringify(merged, null, 2)}\n`);
  return { changed: true };
}
