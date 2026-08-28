import { readFile } from 'node:fs/promises';
import type { Fence } from '../markers.js';
import { MarkerMismatchError } from '../errors.js';
import { writeFileAtomic } from './atomic.js';

/**
 * The marker-fence primitive (context-store spec), pulled forward from
 * Phase 1.3 into its final home: `.gitignore`'s derived-path block is the
 * first consumer, and every later generated-region writer (catalog, rollup,
 * adapters) uses the same mechanism. The primitive only does exact-line
 * matching — it knows nothing about comment syntax, which is why `Fence` is
 * a parameter rather than hardcoded `#` markers.
 */
export interface UpsertFencedRegionResult {
  text: string;
  changed: boolean;
}

class FenceMismatch extends Error {}

/**
 * Idempotently inserts or replaces the body strictly between `fence.start`
 * and `fence.end` in `text`, preserving everything outside byte-for-byte.
 *
 * - No markers found → appends the block (a blank line first, if the
 *   existing text is non-empty and doesn't already end in one).
 * - Exactly one start and one end, start before end → replaces the body
 *   between them.
 * - Anything else (unpaired, duplicated, out of order) → throws before
 *   returning, so a caller writing atomically writes zero bytes.
 *
 * Returns `changed: false` (with byte-identical text) when nothing actually
 * changes, so a caller can skip reopening the file entirely — no rewrite, no
 * mtime churn.
 */
export function upsertFencedRegion(
  text: string,
  fence: Fence,
  body: readonly string[],
): UpsertFencedRegionResult {
  const trailingNewline = text.endsWith('\n');
  const lines = text.length === 0 ? [] : text.split('\n');
  if (trailingNewline) lines.pop(); // split on a trailing \n leaves a spurious trailing ''

  const startIndices = indicesOf(lines, fence.start);
  const endIndices = indicesOf(lines, fence.end);

  if (startIndices.length === 0 && endIndices.length === 0) {
    const out = [...lines];
    if (out.length > 0 && out[out.length - 1] !== '') out.push('');
    out.push(fence.start, ...body, fence.end);
    return finish(out, text);
  }

  if (
    startIndices.length === 1 &&
    endIndices.length === 1 &&
    startIndices[0]! < endIndices[0]!
  ) {
    const startIdx = startIndices[0]!;
    const endIdx = endIndices[0]!;
    const out = [...lines.slice(0, startIdx + 1), ...body, ...lines.slice(endIdx)];
    return finish(out, text);
  }

  throw new FenceMismatch(
    `found ${startIndices.length} start marker(s) and ${endIndices.length} end marker(s)`,
  );
}

function indicesOf(lines: readonly string[], needle: string): number[] {
  const result: number[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i] === needle) result.push(i);
  }
  return result;
}

function finish(lines: string[], original: string): UpsertFencedRegionResult {
  const text = lines.length === 0 ? '' : `${lines.join('\n')}\n`;
  return { text, changed: text !== original };
}

/**
 * Reads `filePath` (a missing file is treated as empty text), upserts the
 * fenced region, and writes atomically — but only if the content actually
 * changed, so a no-op re-run never touches the file's mtime. This is what
 * makes re-init convergent: identical inputs produce zero writes.
 */
export async function upsertFencedRegionInFile(
  filePath: string,
  fence: Fence,
  body: readonly string[],
): Promise<{ changed: boolean }> {
  let existing = '';
  try {
    existing = await readFile(filePath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }

  let result: UpsertFencedRegionResult;
  try {
    result = upsertFencedRegion(existing, fence, body);
  } catch (err) {
    if (err instanceof FenceMismatch) {
      throw new MarkerMismatchError(filePath, err.message);
    }
    throw err;
  }

  if (result.changed) {
    await writeFileAtomic(filePath, result.text);
  }
  return { changed: result.changed };
}
