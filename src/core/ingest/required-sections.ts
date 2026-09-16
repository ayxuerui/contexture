import { SOURCE_TYPE_FIELD } from './identity.js';

/**
 * require-a-capture-s-verbatim-record: the one place the "does this capture
 * carry the record it rests on" question is answered.
 *
 * The rule is deliberately shape-only (D4). A capture's bytes cannot
 * distinguish a whole transcript from its first five minutes, so a check that
 * implied otherwise would be a rubber stamp wearing the costume of a
 * guarantee. What IS derivable is whether the store's declared section exists
 * and has anything under it, and that is exactly what this reports.
 *
 * Neither the section heading nor the source type is contexture's word — both
 * arrive from `contexture.yaml`, so this module names no literal of either
 * kind and reads the same for a transcript, a testimony, or whatever else a
 * store decided is the evidence behind its captures.
 */

const HEADING = /^ {0,3}(#{1,6})\s+(.*)$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/** The fence character opening or closing a code block on this line, if any. */
function fenceMarkerOf(line: string): string | undefined {
  const matched = FENCE.exec(line);
  return matched === null ? undefined : matched[1]![0]!;
}

/**
 * Whether `body` carries a level-2 section titled `heading` with at least one
 * non-blank line under it, before the next heading at the same or a shallower
 * level.
 *
 * Fenced code is tracked rather than ignored: a transcript may legitimately
 * quote a line beginning `##`, and treating that as a heading would end the
 * section early — or, worse, a fenced `## <heading>` would satisfy the check
 * without a real section existing.
 *
 * A repeated heading does not poison the result. An empty first occurrence
 * resets the search rather than returning, so a capture carrying the section
 * twice is judged on whether ANY occurrence has content — the alternative
 * would refuse a capture that plainly holds the record.
 */
export function hasNonEmptySection(body: string, heading: string): boolean {
  const wanted = heading.trim().toLowerCase();
  if (wanted === '') return false;

  /** The level of the matched section we are currently inside, if any. */
  let depth: number | undefined;
  let fence: string | undefined;

  for (const line of body.split('\n')) {
    const marker = fenceMarkerOf(line);
    if (marker !== undefined) {
      fence = fence === undefined ? marker : fence === marker ? undefined : fence;
      if (depth !== undefined) return true;
      continue;
    }
    if (fence !== undefined) {
      if (depth !== undefined && line.trim() !== '') return true;
      continue;
    }

    const matched = HEADING.exec(line);
    if (matched !== null) {
      const level = matched[1]!.length;
      if (depth !== undefined) {
        // Deeper than the section we are in, so it is content within it.
        if (level > depth) return true;
        // Same or shallower: that occurrence ended empty. Keep looking.
        depth = undefined;
      }
      if (level === 2 && matched[2]!.trim().toLowerCase() === wanted) depth = level;
      continue;
    }

    if (depth !== undefined && line.trim() !== '') return true;
  }

  return false;
}

/**
 * The section a capture owes, or undefined if the store declared none for it.
 *
 * D3: the source type the capture will be recorded under lives in two places —
 * the invocation, and the capture's own frontmatter, since a capture pipeline
 * commonly knows its source type at the moment it writes the file. If EITHER
 * names a declared type the declaration applies, so naming a different type on
 * the command line does not route around what the store asked for.
 */
export function requiredSectionFor(
  sections: Readonly<Record<string, string>> | undefined,
  invocationSourceType: string,
  frontmatter: Record<string, unknown> | undefined,
): string | undefined {
  if (sections === undefined) return undefined;
  const byInvocation = sections[invocationSourceType];
  if (byInvocation !== undefined) return byInvocation;
  const recorded = frontmatter?.[SOURCE_TYPE_FIELD];
  return typeof recorded === 'string' ? sections[recorded] : undefined;
}
