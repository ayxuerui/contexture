import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { StoreConfig } from '../config/schema.js';
import { GENERIC_END_RE, GENERIC_START_RE } from './fs/fenced-region.js';
import { parseNoteText } from './notes/parse.js';

/**
 * harness-portability spec (entry-doc-generation, inline-conventions-and-mission):
 * operator-authored convention documents and (via scanSkills in skills.ts)
 * skill files are scanned from what is actually on disk — adding a file is
 * the entire integration. Metadata extraction order: frontmatter title →
 * first `# ` heading → filename stem; description only from frontmatter.
 * `body` is the frontmatter-stripped content, kept alongside the metadata so
 * `inlineDocBody` never has to re-read or re-parse the source file.
 */
export interface ScannedDoc {
  /** Path relative to the store root, forward-slash separated. */
  path: string;
  title: string;
  description: string | null;
  /** Frontmatter stripped, otherwise verbatim. */
  body: string;
}

const HEADING_RE = /^#\s+(.+)$/m;

/** The skill-layout filename: `<slug>/SKILL.md` — what harnesses with skill auto-discovery read. */
export const SKILL_FILE_NAME = 'SKILL.md';

export function extractDocMetadata(raw: string, relativePath: string): ScannedDoc {
  let frontmatter: Record<string, unknown> | undefined;
  let body = raw;
  try {
    const parsed = parseNoteText(raw, relativePath);
    frontmatter = parsed.frontmatter;
    body = parsed.body;
  } catch {
    // Malformed frontmatter in a doc file falls back to heading/filename — these
    // are instructions, not notes; indexing must not fail loud on them.
  }

  const fmTitle = frontmatter?.title ?? frontmatter?.name; // SKILL.md files declare `name`
  const fmDescription = frontmatter?.description;
  const heading = HEADING_RE.exec(body)?.[1]?.trim();
  // A `<slug>/SKILL.md` file's natural fallback name is its directory, not "SKILL".
  const fallback =
    path.basename(relativePath) === SKILL_FILE_NAME ? path.basename(path.dirname(relativePath)) : path.basename(relativePath, '.md');

  return {
    path: relativePath,
    title:
      (typeof fmTitle === 'string' && fmTitle.length > 0 ? fmTitle : undefined) ??
      (heading && heading.length > 0 ? heading : undefined) ??
      fallback,
    description: typeof fmDescription === 'string' && fmDescription.length > 0 ? fmDescription : null,
    body,
  };
}

const ATX_HEADING_RE = /^(#{1,6})(\s+.*)$/;

/**
 * inline-conventions-and-mission: renders a scanned doc's body for inlining
 * into a generated `AGENTS.md` section — a leading `# <title>` heading
 * dropped when it duplicates the section heading the caller already
 * provides, every remaining ATX heading demoted by `headingOffset` levels
 * (capped at H6), and any nested `contexture:<region>` fence marker line
 * stripped (its body kept, only the marker comment removed) so a fence
 * copied out of a source file — e.g. mission.md's own rollup fence — never
 * leaves an orphaned marker inside AGENTS.md's fence.
 */
export function inlineDocBody(doc: ScannedDoc, headingOffset: number): string[] {
  const lines = doc.body.split('\n');

  let start = 0;
  while (start < lines.length && lines[start]!.trim() === '') start += 1;
  const firstHeading = start < lines.length ? ATX_HEADING_RE.exec(lines[start]!) : null;
  if (firstHeading && firstHeading[1]!.length === 1 && firstHeading[2]!.trim().toLowerCase() === doc.title.trim().toLowerCase()) {
    start += 1;
    while (start < lines.length && lines[start]!.trim() === '') start += 1;
  }

  const out: string[] = [];
  for (const line of lines.slice(start)) {
    if (GENERIC_START_RE.test(line) || GENERIC_END_RE.test(line)) continue;
    const heading = ATX_HEADING_RE.exec(line);
    if (heading) {
      const level = Math.min(heading[1]!.length + headingOffset, 6);
      out.push(`${'#'.repeat(level)}${heading[2]}`);
    } else {
      out.push(line);
    }
  }

  while (out.length > 0 && out[out.length - 1]!.trim() === '') out.pop();
  return out;
}

export async function scanDocsDir(root: string, dirRelativePath: string): Promise<ScannedDoc[]> {
  const dir = path.join(root, dirRelativePath);
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }

  // Two layouts, both indexed: flat `<name>.md` files, and the skill layout
  // `<slug>/SKILL.md` (the format harnesses with skill auto-discovery read).
  const docs: ScannedDoc[] = [];
  for (const entry of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
    let fileRelativePath: string | undefined;
    if (entry.isFile() && entry.name.endsWith('.md')) {
      fileRelativePath = path.join(dirRelativePath, entry.name);
    } else if (entry.isDirectory()) {
      const candidate = path.join(dir, entry.name, SKILL_FILE_NAME);
      try {
        await readFile(candidate, 'utf8');
        fileRelativePath = path.join(dirRelativePath, entry.name, SKILL_FILE_NAME);
      } catch {
        continue;
      }
    }
    if (!fileRelativePath) continue;
    const relativePath = fileRelativePath.split(path.sep).join('/');
    const raw = await readFile(path.join(root, relativePath), 'utf8');
    docs.push(extractDocMetadata(raw, relativePath));
  }
  return docs;
}

/** Every operator convention doc currently at the configured path. */
export function scanConventions(root: string, config: StoreConfig): Promise<ScannedDoc[]> {
  return scanDocsDir(root, config.harness.conventions_path);
}
