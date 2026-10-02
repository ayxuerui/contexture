import path from 'node:path';
import { isSessionWorktreePath } from '../session.js';
import type { Store } from '../store.js';

/**
 * The two addresses the browsing surface answers for a published page, spelled
 * once. `serve.ts` tests and slices these prefixes, `nav.ts` builds hrefs from
 * them, and the publish commands report them — three readers, one spelling,
 * pinned by `single-source-literals`.
 */
export const PUBLISH_ROUTE_PREFIX = '/publish/';
export const PREVIEW_ROUTE_PREFIX = '/preview/';

/**
 * `encodeURI`, never `encodeURIComponent`: a page path carries `/` separators
 * that must survive into the URL. The round trip is exact because `serve.ts`
 * decodes the whole pathname once with `decodeURIComponent` before its lookup,
 * recovering the raw key `walkFiles` produced.
 */
export function publishRoute(filePath: string): string {
  return `${PUBLISH_ROUTE_PREFIX}${encodeURI(filePath)}`;
}

/** `worktree` is the session worktree's directory name — the key `buildPreviews` inserts. */
export function previewRoute(worktree: string, filePath: string): string {
  return `${PREVIEW_ROUTE_PREFIX}${encodeURI(`${worktree}/${filePath}`)}`;
}

export interface ServedAtRoute {
  /** Server-relative, always leading "/", always naming a file the route answers for. */
  route: string;
  /** `route` against the store's declared base URL; null when the store declares none. */
  url: string | null;
}

export interface ServedAt extends ServedAtRoute {
  area: 'preview' | 'publish';
  /** The session worktree directory keying a preview address; null under the publish area. */
  worktree: string | null;
  /**
   * Where the same page is served once the worktree's work lands. Null under the
   * publish area, which is already that address — a page in the store's own
   * checkout has no later one.
   */
  after_landing: ServedAtRoute | null;
}

/**
 * Join a declared base URL to a server-relative route.
 *
 * String concatenation, deliberately, and NOT `new URL(route, base)`:
 * `new URL('/publish/x', 'https://example.com/ctx/')` silently discards the
 * `/ctx` prefix, so a store served under a subpath would be handed a confident
 * wrong URL with no error. Stripping the base's trailing slashes and appending
 * a route that always begins with "/" preserves whatever path the base carries.
 */
function joinBaseUrl(baseUrl: string | undefined, route: string): string | null {
  if (baseUrl === undefined) return null;
  return `${baseUrl.replace(/\/+$/, '')}${route}`;
}

/** The configured publish path as a "/"-separated prefix with no trailing slash. */
function publishPrefixOf(publishPath: string): string {
  return publishPath.split(path.sep).join('/').replace(/\/+$/, '');
}

/**
 * The address the browsing surface answers for one file of a published page.
 *
 * Null when the file is not under the store's configured publish path. That is
 * the same verdict `checkPageLocation` (`src/commands/publish-check.ts`) already
 * reaches for the same input, by the same prefix test: such a file is not a
 * published page, so it has no filing to judge and no address to report. The
 * two must keep agreeing about what "under the publish path" means.
 *
 * The preview branch asks `isSessionWorktreePath` about the resolved store root
 * — root resolution has already resolved it *to* the worktree when the caller
 * is standing in one — and takes the worktree's directory name from
 * `path.basename`. That is precisely the key `buildPreviews`
 * (`src/core/browse/routes.ts`) inserts, because it enumerates the directories
 * under the configured worktrees path and keys by their names verbatim. No
 * second enumeration, and no git subprocess.
 *
 * `storeRelativeFilePath` is "/"-separated, as both callers already produce.
 */
export function pageServedAt(store: Store, storeRelativeFilePath: string): ServedAt | null {
  const prefix = publishPrefixOf(store.config.publish.path);
  if (!storeRelativeFilePath.startsWith(`${prefix}/`)) return null;

  const pagePath = storeRelativeFilePath.slice(prefix.length + 1);
  const baseUrl = store.config.serve?.base_url;
  const published = publishRoute(pagePath);

  if (!isSessionWorktreePath(store.config, store.root)) {
    return { area: 'publish', route: published, url: joinBaseUrl(baseUrl, published), worktree: null, after_landing: null };
  }

  const worktree = path.basename(store.root);
  const preview = previewRoute(worktree, pagePath);
  return {
    area: 'preview',
    route: preview,
    url: joinBaseUrl(baseUrl, preview),
    worktree,
    after_landing: { route: published, url: joinBaseUrl(baseUrl, published) },
  };
}

/**
 * The clause both publish commands append to their one-line summary (D3).
 *
 * Leading space, so a caller writes `${summary}${servedAtSentence(served)}`
 * and an unaddressable page simply adds nothing. The verb carries the
 * distinction the caller was previously left to guess: a page in the store's
 * own checkout is `Served at`, a page still in a session worktree is
 * `Preview at` and names where it goes once it lands. When the store declares
 * a base URL the absolute form replaces the route rather than joining it —
 * two addresses for one page would be the same guessing one level down.
 */
export function servedAtSentence(served: ServedAt | null): string {
  if (served === null) return '';
  const here = served.url ?? served.route;
  if (served.after_landing === null) return ` Served at ${here}.`;
  const landed = served.after_landing.url ?? served.after_landing.route;
  return ` Preview at ${here} (at ${landed} once it lands).`;
}
