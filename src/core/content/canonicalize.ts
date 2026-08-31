import { createHash } from 'node:crypto';
import { parseNoteText } from '../notes/parse.js';

/**
 * context-ingest spec: "Canonicalization is a single shared primitive" that
 * exists in exactly one place — content matching (dedupe, catalog
 * gloss-rot) never inlines or reimplements this. Pipeline: strip a BOM,
 * normalize line endings, rstrip each line, collapse trailing blank lines.
 */
export function canonicalizeText(text: string): string {
  const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const normalizedNewlines = withoutBom.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalizedNewlines.split('\n').map((line) => line.replace(/[ \t]+$/, ''));
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines.join('\n');
}

/** Strips frontmatter from raw file text, then canonicalizes the body. */
export function canonicalizeBody(raw: string, notePath = '(unknown)'): string {
  const { body } = parseNoteText(raw, notePath);
  return canonicalizeText(body);
}

function hashText(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16);
}

/** context-ingest spec: a 16-character SHA-256 prefix of the canonicalized body, from raw source text. */
export function contentHash(raw: string, notePath = '(unknown)'): string {
  return hashText(canonicalizeBody(raw, notePath));
}

/** Same hash, computed from an already-parsed note's body (no frontmatter to strip). */
export function contentHashOfBody(body: string): string {
  return hashText(canonicalizeText(body));
}
