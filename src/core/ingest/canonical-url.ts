/**
 * context-ingest spec (store-primitives-from-migration-audit D2): a pure,
 * fixed-rule canonicalization for a URL source identity — scheme and host
 * are lowercased by the URL parser itself, the fragment is dropped, the
 * configured tracking parameters are stripped, and a trailing slash on the
 * path is collapsed. A non-URL identity (e.g. `granola/abc123`) passes
 * through unchanged — canonicalization only ever narrows what already
 * looks like a URL.
 */
export function canonicalizeSourceId(id: string, trackingParams: readonly string[]): string {
  let url: URL;
  try {
    url = new URL(id);
  } catch {
    return id;
  }

  url.hash = '';
  for (const param of trackingParams) {
    url.searchParams.delete(param);
  }
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.slice(0, -1);
  }

  return `${url.protocol}//${url.host}${url.pathname}${url.search}`;
}
