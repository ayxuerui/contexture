import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * extract-skill-templates, extended by extract-agents-doc-templates: every
 * piece of prose contexture ships into a store — owned-skill bodies, the
 * generated AGENTS.md sections — is authored as a plain markdown file under
 * `templates/`, reviewable and diffable as markdown rather than as quoted,
 * escaped TypeScript string fragments. This module is the single loader for
 * them, resolving the same way `hooks.ts`'s `templatesDir()` does.
 *
 * Loaded synchronously, once, and cached: the render functions in
 * `procedures.ts` and `agents-doc.ts` are synchronous with many synchronous
 * call sites (the test suite especially), and these are fixed,
 * package-bundled files whose content cannot change after process start.
 * Threading `async` through every caller to read a file once would be a
 * large mechanical change for no behavioral gain. `hooks.ts` deliberately
 * does not share this loader: it is async because every caller awaits it,
 * and a shell script must keep the trailing newline this strips.
 */
function templatesDir(dir: string): string {
  return fileURLToPath(new URL(`../../templates/${dir}`, import.meta.url));
}

const cache = new Map<string, string>();

/**
 * `templates/<dir>/<name>.md`, with exactly one trailing newline stripped —
 * so a template file that looks like a normal file (ends with a newline)
 * yields the same line array an inline `[...]` literal would have.
 */
export function packagedTemplate(dir: string, name: string): string {
  const key = `${dir}/${name}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const text = readFileSync(path.join(templatesDir(dir), `${name}.md`), 'utf8').replace(/\n$/, '');
  cache.set(key, text);
  return text;
}

/**
 * Splices a computed list of lines in where `token` sits alone on its own
 * line. An EMPTY list removes that line entirely, rather than leaving a
 * blank one behind — which is what a plain `.replace(token, '')` would do,
 * and is the difference between byte-identical output and a stray blank
 * line. The empty case is not hypothetical: an index block renders empty
 * whenever its scanned directory is missing.
 *
 * Throws when the token is absent, so a mistyped placeholder name fails at
 * render time instead of silently shipping the literal `__TOKEN__` string
 * into a store's AGENTS.md.
 */
export function substituteBlock(text: string, token: string, lines: readonly string[]): string {
  const out: string[] = [];
  let found = false;
  for (const line of text.split('\n')) {
    if (line === token) {
      found = true;
      out.push(...lines);
    } else {
      out.push(line);
    }
  }
  if (!found) {
    throw new Error(`template block placeholder ${token} not found on a line of its own`);
  }
  return out.join('\n');
}
