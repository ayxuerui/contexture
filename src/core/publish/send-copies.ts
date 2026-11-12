import { readdir } from 'node:fs/promises';
import { parseLeadingDate } from './lifespan.js';

/**
 * send-copies-beside-their-page: a send copy is a file built from a note and
 * sent to someone — a record of what went out on a day. Directly in a page
 * folder, beside `index.html`, a file in one of these formats is one; anywhere
 * below it, the same file is an input the page uses (file-pdfs-beside-their-page
 * D3). A closed list, so a missed format goes unchecked rather than failing a
 * page over a file nobody sent (D1). Adding a format is one entry here.
 */
export const SEND_COPY_EXTENSIONS: readonly string[] = ['.pdf', '.docx', '.xlsx', '.pptx'];

/** The send-copy extension `fileName` carries, lower-cased, or `null` when it is not a send copy. */
export function sendCopyExtension(fileName: string): string | null {
  const lower = fileName.toLowerCase();
  return SEND_COPY_EXTENSIONS.find((extension) => lower.endsWith(extension)) ?? null;
}

/**
 * file-pdfs-beside-their-page D2: a send copy's name leads with the date it
 * was made, so a new send adds a file beside the one a recipient holds instead
 * of replacing it. The date reader is the disposable folder's (D4), applied to
 * the name without its extension. One reading for `publish check`, lint and the
 * pre-commit gate (send-copies-gated-at-commit D4): `null` when the name is
 * dated, otherwise what is wrong with it.
 */
export function sendCopyNameProblem(fileName: string): string | null {
  const extension = sendCopyExtension(fileName);
  if (extension === null) return null;
  if (parseLeadingDate(fileName.slice(0, -extension.length)) !== null) return null;
  return `"${fileName}" is not named "<YYYY-MM-DD>-<name>.<extension>" with a real date`;
}

/** The send copies directly in a page folder, by file name. Subfolders hold inputs (file-pdfs-beside-their-page D3). */
export async function sendCopiesAtPageRoot(pageDir: string): Promise<string[]> {
  const entries = await readdir(pageDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && sendCopyExtension(entry.name) !== null)
    .map((entry) => entry.name)
    .sort();
}
