/**
 * The one place a store-relative path is tested against a directory prefix.
 * Retrieval exclusion (notes/list.ts), the write-path gate
 * (write-lifecycle/path-gate.ts) and the capture tier's nesting rule
 * (config/schema.ts) all have to agree on what "under this directory" means,
 * including how a configured trailing slash is treated — so they call this
 * rather than each carrying their own copy.
 */
export function isUnderPrefix(relativePath: string, prefix: string): boolean {
  const trimmed = prefix.replace(/\/+$/, '');
  return relativePath === trimmed || relativePath.startsWith(`${trimmed}/`);
}

export function isUnderAnyPrefix(relativePath: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => isUnderPrefix(relativePath, prefix));
}

/** True only when `relativePath` sits strictly inside `prefix`, never when the two name the same directory. */
export function isStrictlyUnderPrefix(relativePath: string, prefix: string): boolean {
  const trimmedPath = relativePath.replace(/\/+$/, '');
  const trimmedPrefix = prefix.replace(/\/+$/, '');
  return trimmedPath !== trimmedPrefix && trimmedPath.startsWith(`${trimmedPrefix}/`);
}
