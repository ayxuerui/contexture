import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { StoreConfig } from '../config/schema.js';
import { parseNoteText } from './notes/parse.js';

/**
 * harness-portability spec (entry-doc-generation): operator-authored
 * convention documents and (via scanSkills in skills.ts) skill
 * files are indexed from what is actually on disk — adding a file is the
 * entire integration. Metadata extraction order: frontmatter title →
 * first `# ` heading → filename stem; description only from frontmatter.
 */
export interface ScannedDoc {
  /** Path relative to the store root, forward-slash separated. */
  path: string;
  title: string;
  description: string | null;
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
  };
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
