import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * local-browsing-surface design.md D7: shell.html/style.css are markup and
 * CSS, not markdown fragments meant for splicing, so they don't fit
 * `packagedTemplate()`'s contract (strips exactly one trailing newline from
 * a `.md` file, for `substituteBlock`'s line-array callers). This mirrors
 * `hooks.ts`'s own small async reader for the same reason: a different file
 * type needs a different loading contract, not a stretched shared one.
 */
function templatesDir(): string {
  return fileURLToPath(new URL('../../../templates/serve', import.meta.url));
}

async function readServeTemplate(fileName: string): Promise<string> {
  return readFile(path.join(templatesDir(), fileName), 'utf8');
}

/** Wraps rendered body HTML in the shared page shell, substituting both slots exactly once each. */
export async function renderShell(title: string, bodyHtml: string): Promise<string> {
  const shell = await readServeTemplate('shell.html');
  return shell.replace('{{TITLE}}', title).replace('{{BODY}}', bodyHtml);
}

export async function readStylesheet(): Promise<string> {
  return readServeTemplate('style.css');
}
