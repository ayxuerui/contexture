import { readFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import { InvalidNoteFrontmatterError } from '../errors.js';
import type { Note } from './list.js';

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * context-store spec: "A note SHALL be a markdown file whose optional YAML
 * frontmatter may declare... A note with no frontmatter SHALL be treated as
 * valid content." Absence of frontmatter is fine; a `---` block that IS
 * present but fails to parse, or doesn't parse to a mapping, is a real
 * error — fail loud rather than silently treat malformed content as if it
 * had no frontmatter at all.
 */
export function parseNoteText(raw: string, relativePath: string): Note {
  const match = FRONTMATTER_RE.exec(raw);
  if (!match) {
    return { path: relativePath, frontmatter: undefined, body: raw };
  }

  const frontmatterText = match[1] ?? '';
  const body = raw.slice(match[0].length);

  let parsed: unknown;
  try {
    parsed = parseYaml(frontmatterText);
  } catch (err) {
    throw new InvalidNoteFrontmatterError(relativePath, err instanceof Error ? err.message : String(err));
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new InvalidNoteFrontmatterError(relativePath, 'frontmatter must be a YAML mapping');
  }

  return { path: relativePath, frontmatter: parsed as Record<string, unknown>, body };
}

export async function parseNote(absolutePath: string, relativePath: string): Promise<Note> {
  const raw = await readFile(absolutePath, 'utf8');
  return parseNoteText(raw, relativePath);
}
