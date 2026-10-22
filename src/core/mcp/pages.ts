import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { escapeHtml } from '../browse/render.js';
import type { McpScope } from './members.js';
import type { ConsentPageView } from './oauth.js';

/**
 * The consent page is markup, not a markdown fragment, so it is read the way
 * `browse/templates.ts` reads the serve shell rather than through
 * `packagedTemplate()`. Every substituted value is escaped here; the template
 * carries no script.
 */
function templatesDir(): string {
  return fileURLToPath(new URL('../../../templates/mcp', import.meta.url));
}

let cached: string | undefined;

/** What each scope lets an app do, in the member's terms. */
const SCOPE_TEXT: Readonly<Record<McpScope, string>> = {
  read: 'search and read the store’s notes',
  capture: 'save material into the store’s inbox, where it waits for approval before it lands',
};

export async function renderConsentPage(storeName: string, view: ConsentPageView): Promise<string> {
  cached ??= await readFile(path.join(templatesDir(), 'consent.html'), 'utf8');
  const replacements: Record<string, string> = {
    __STORE_NAME__: escapeHtml(storeName),
    __CLIENT_NAME__: escapeHtml(view.clientName),
    __EMAIL__: escapeHtml(view.email),
    __REDIRECT_HOST__: escapeHtml(view.redirectHost),
    __SCOPE_ITEMS__: view.scopes.map((s) => `<li>${escapeHtml(SCOPE_TEXT[s])}</li>`).join('\n'),
    __HIDDEN_FIELDS__: Object.entries(view.hiddenFields)
      .map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`)
      .join('\n'),
  };
  // One pass, so a substituted value that happens to contain a token is never substituted again.
  return cached.replace(/__[A-Z_]+__/g, (token) => {
    const value = replacements[token];
    if (value === undefined) throw new Error(`templates/mcp/consent.html carries an unknown placeholder ${token}`);
    return value;
  });
}
