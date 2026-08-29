import { stringify as stringifyYaml } from 'yaml';

/**
 * The inverse of parseNoteText (core/notes/parse.ts): re-serializes a note
 * back to raw file text. `undefined` frontmatter renders as no frontmatter
 * block at all, matching parseNoteText's own treatment of absence.
 */
export function renderNoteText(frontmatter: Record<string, unknown> | undefined, body: string): string {
  if (!frontmatter || Object.keys(frontmatter).length === 0) {
    return body;
  }
  return `---\n${stringifyYaml(frontmatter, { indent: 2 })}---\n${body}`;
}
