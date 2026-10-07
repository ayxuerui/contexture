import type { StoreConfig } from '../../config/schema.js';

/**
 * An ATX heading: up to three spaces of indent, one to six `#`, then text.
 * Level-agnostic for MATCHING deliberately (capture-is-an-owned-skill design
 * D6): a capture carries its source's markdown as the source wrote it, so a
 * `## Summary` section may hold `#`-level headings of its own. Pinning the
 * declared section to one level would make a store's configuration depend on
 * structure the capture procedure explicitly refuses to normalize. The level
 * is used for one thing only: knowing where a section ends.
 */
const HEADING_RE = /^ {0,3}(#{1,6})\s+(.+?)\s*$/;

/** A code fence's opening or closing line: three or more backticks or tildes. */
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})(.*)$/;

interface Line {
  text: string;
  /** Inside a fenced code block, or one of the fence's own lines. */
  fenced: boolean;
  /** This line is a fence's opening or closing line, not text within it. */
  fenceMarker: boolean;
}

/**
 * Splits a body into lines tagged with whether markdown would treat them as
 * code. A fence opens on three or more backticks or tildes and closes on the
 * same character at least as long with nothing after it; a backtick fence's
 * info string may not itself contain a backtick (that is inline code, not a
 * fence); an unclosed fence runs to the end of the file, as markdown does.
 */
function tagLines(body: string): Line[] {
  const lines: Line[] = [];
  let open: { char: string; length: number } | undefined;
  for (const text of body.split(/\r?\n/)) {
    const fence = FENCE_RE.exec(text);
    if (open !== undefined) {
      const closes = fence !== null && fence[1]![0] === open.char && fence[1]!.length >= open.length && fence[2]!.trim() === '';
      lines.push({ text, fenced: true, fenceMarker: closes });
      if (closes) open = undefined;
      continue;
    }
    const opens = fence !== null && !(fence[1]![0] === '`' && fence[2]!.includes('`'));
    if (opens) open = { char: fence![1]![0]!, length: fence![1]!.length };
    lines.push({ text, fenced: opens, fenceMarker: opens });
  }
  return lines;
}

/**
 * Whether the capture carries `section` with something under it.
 *
 * Matching is case-sensitive, unlike `headingsOf` in the integrity checks,
 * which lowercases because it is looking for accidental duplication between
 * two documents. Here the declared name is a store's own statement of what a
 * capture of that type must carry, and a capture that answers it in different
 * case has not answered it — being told so is more useful than a silent pass.
 *
 * harden-the-required-capture-section D1: a heading only counts outside a
 * fenced code block (a `## Transcript` in a document about markup is a string,
 * not a section), and a section is the heading plus the lines up to the next
 * heading of the same or a shallower level, or the end of the file. It holds
 * something if at least one of those lines is non-blank and is neither a
 * heading nor a fence's own opening or closing line. Text INSIDE a fenced block
 * counts: a transcript pasted into a code block is still a transcript. This is
 * still shape and says nothing about whether the record is complete.
 */
function carriesSectionWithContent(body: string, section: string): boolean {
  const lines = tagLines(body);
  const headingAt = (i: number): { level: number; text: string } | undefined => {
    const line = lines[i]!;
    if (line.fenced) return undefined;
    const match = HEADING_RE.exec(line.text);
    return match === null ? undefined : { level: match[1]!.length, text: match[2]! };
  };

  for (let i = 0; i < lines.length; i++) {
    const heading = headingAt(i);
    if (heading === undefined || heading.text !== section) continue;
    for (let j = i + 1; j < lines.length; j++) {
      const next = headingAt(j);
      if (next !== undefined) {
        if (next.level <= heading.level) break;
        continue; // a deeper heading is part of this section, but is not content in itself
      }
      const line = lines[j]!;
      if (line.fenceMarker) continue;
      if (line.text.trim() !== '') return true;
    }
  }
  return false;
}

/**
 * context-ingest spec: the section a capture of this source type must carry
 * for ingest to accept it as provenance, when the store has declared one and
 * the capture does not have it, or has it with nothing under it. `undefined`
 * means nothing is owed — either the store declared no section for this source
 * type, or the capture carries the one it declared.
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
  return carriesSectionWithContent(body, declared) ? undefined : declared;
}
