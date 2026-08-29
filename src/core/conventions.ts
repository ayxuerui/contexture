import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { StoreConfig } from '../config/schema.js';
import { parseNoteText } from './notes/parse.js';

/**
 * harness-portability spec (entry-doc-generation): operator-authored
 * convention documents and (via scanProcedures in procedures.ts) procedure
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

  const fmTitle = frontmatter?.title;
  const fmDescription = frontmatter?.description;
  const heading = HEADING_RE.exec(body)?.[1]?.trim();

  return {
    path: relativePath,
    title:
      (typeof fmTitle === 'string' && fmTitle.length > 0 ? fmTitle : undefined) ??
      (heading && heading.length > 0 ? heading : undefined) ??
      path.basename(relativePath, '.md'),
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

  const docs: ScannedDoc[] = [];
  for (const entry of entries.filter((e) => e.isFile() && e.name.endsWith('.md')).sort((a, b) => a.name.localeCompare(b.name))) {
    const relativePath = path.join(dirRelativePath, entry.name).split(path.sep).join('/');
    const raw = await readFile(path.join(dir, entry.name), 'utf8');
    docs.push(extractDocMetadata(raw, relativePath));
  }
  return docs;
}

/** Every operator convention doc currently at the configured path. */
export function scanConventions(root: string, config: StoreConfig): Promise<ScannedDoc[]> {
  return scanDocsDir(root, config.harness.conventions_path);
}
