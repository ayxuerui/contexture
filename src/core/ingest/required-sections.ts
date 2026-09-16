import type { StoreConfig } from '../../config/schema.js';

/**
 * Any ATX heading, at any level. Level-agnostic deliberately
 * (capture-is-an-owned-skill design D6): a capture carries its source's
 * markdown as the source wrote it, so a `## Summary` section may hold
 * `#`-level headings of its own. Pinning the declared section to one level
 * would make a store's configuration depend on structure the capture
 * procedure explicitly refuses to normalize.
 */
const HEADING_RE = /^#{1,6}\s+(.+)$/gm;

/**
 * Matching is case-sensitive, unlike `headingsOf` in the integrity checks,
 * which lowercases because it is looking for accidental duplication between
 * two documents. Here the declared name is a store's own statement of what a
 * capture of that type must carry, and a capture that answers it in different
 * case has not answered it — being told so is more useful than a silent pass.
 */
function headingTexts(body: string): Set<string> {
  const headings = new Set<string>();
  for (const match of body.matchAll(HEADING_RE)) headings.add(match[1]!.trim());
  return headings;
}

/**
 * context-ingest spec: the section a capture of this source type must carry
 * for ingest to accept it as provenance, when the store has declared one and
 * the capture does not have it. `undefined` means nothing is owed — either
 * the store declared no section for this source type, or the capture carries
 * the one it declared.
 *
 * The body passed here is the markdown the capture presents. For material
 * that is not markdown that is the sidecar's body, which needs no special
 * case: ingest and lint both operate on the sidecar, the binary it names
 * having no frontmatter and no sections to look in.
 */
export function missingRequiredSection(
  config: Pick<StoreConfig, 'ingest'>,
  sourceType: string | undefined,
  body: string,
): string | undefined {
  const declared = sourceType === undefined ? undefined : config.ingest.required_capture_sections?.[sourceType];
  if (declared === undefined) return undefined;
  return headingTexts(body).has(declared) ? undefined : declared;
}
