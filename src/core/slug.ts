/**
 * Turning a caller-supplied name into a path segment, in one place: the publish
 * path's page slugs and a session's label are the same question asked twice, and
 * two normalizers would eventually disagree about a character neither author
 * considered.
 *
 * Lives here rather than in `publish/filing.ts`, where it was first written,
 * because `core/session.ts` needs it and `filing.ts` reaches `browse/routes.ts`,
 * which reaches `session.ts` — importing it across that arc would close an import
 * cycle for a four-line pure function.
 */

/**
 * derive-the-page-filing-path design.md D6. Lowercase, then NFC — in that
 * order, so a decomposed filename and a composed one derive the same slug even
 * when lowercasing decomposes a character. Every run of characters that is not
 * a letter, digit, or combining mark becomes ONE separator, so no separate
 * collapse pass is needed; combining marks survive so a decomposing lowercase
 * cannot leave a stray separator behind.
 *
 * `&` is deliberately not expanded to `and`: that embeds English in a
 * derivation shipped to stores written in any language, and `&` is punctuation
 * like every other mark. There is deliberately no length cap either —
 * slugifying never lengthens its input, so a segment is already bounded by the
 * filesystem, and truncation is the one transform that can silently merge two
 * distinct subjects onto one path.
 *
 * Letters and digits of ANY script are kept (`\p{L}`, `\p{N}`). ASCII-folding
 * was rejected as a Latin-centric half-measure that slugifies a CJK or Cyrillic
 * store's whole taxonomy to empty strings.
 *
 * Idempotent, and that is load-bearing: `pagesNamingSubject` runs both sides of
 * every comparison through this function, which is what makes the scan
 * insensitive to filesystem normalization and to whatever case an author typed.
 */
export function slugifySegment(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

/** Slugifies a `/`-separated path a segment at a time, dropping any segment that slugifies to nothing (D6). */
export function slugifyPath(relativePath: string): string {
  return relativePath
    .split('/')
    .map(slugifySegment)
    .filter((segment) => segment.length > 0)
    .join('/');
}
