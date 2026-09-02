import { buildStemIndex, resolveStem, type StemResolution } from '../graph/model.js';
import type { Note } from '../notes/list.js';

/** A wikilink target -> a resolved note path, or a reason it didn't resolve to exactly one note. */
export type LinkResolver = (target: string) => StemResolution;

/**
 * local-browsing-surface design.md D3: backed by the exact same stem index
 * `ctxr graph build` resolves wikilinks against, so a note that renders
 * cleanly in the browser view is, by construction, a note the graph build
 * also resolves cleanly — never a second, potentially divergent resolver.
 */
export function buildLinkResolver(notes: readonly Note[]): LinkResolver {
  const stemIndex = buildStemIndex(notes);
  return (target: string) => resolveStem(stemIndex, target);
}
