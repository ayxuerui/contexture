import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { escapeHtml } from './render.js';

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

/**
 * Wraps rendered body HTML in the shared page shell, substituting all three
 * slots exactly once each. browse-navigation-by-folder design.md D1: the
 * navigation is a slot here rather than markup each route prepends, so no
 * HTML route can render without it.
 *
 * Each substitution passes a replacer function rather than a string, because
 * `String.replace` reads `$&`, `$\'` and friends out of a string replacement
 * — and a note path or title is free to contain them.
 */
export async function renderShell(title: string, bodyHtml: string, navHtml: string): Promise<string> {
  const shell = await readServeTemplate('shell.html');
  return shell
    .replace('{{TITLE}}', () => escapeHtml(title))
    .replace('{{NAV}}', () => navHtml)
    .replace('{{BODY}}', () => bodyHtml);
}

export async function readStylesheet(): Promise<string> {
  return readServeTemplate('style.css');
}
