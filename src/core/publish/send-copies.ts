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
