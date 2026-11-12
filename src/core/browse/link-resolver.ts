import { createLinkResolver, type StemResolution } from '../graph/model.js';
import type { Note } from '../notes/list.js';

/** A wikilink target -> a resolved note path, or a reason it didn't resolve to exactly one note. */
export type LinkResolver = (target: string) => StemResolution;

/**
 * local-browsing-surface design.md D3: backed by the exact same resolver
 * `ctxr graph build` resolves wikilinks with, so a note that renders cleanly
 * in the browser view is, by construction, a note the graph build also
 * resolves cleanly — never a second, potentially divergent resolver.
 *
 * `serve` serves the store's own notes only (mount-shared-stores non-goal), so
 * every link resolves in the store's own scope: filename links by stem, path
 * links against the store root. A path link into a mount names a note `serve`
 * does not have, and renders as unresolved.
 */
export function buildLinkResolver(notes: readonly Note[]): LinkResolver {
  const resolve = createLinkResolver(notes);
  return (target: string) => resolve('', target);
}
