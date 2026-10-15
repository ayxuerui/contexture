import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { escapeHtml } from '../browse/render.js';
import type { AuthorizePageView } from './oauth.js';

/**
 * The authorisation page is markup, not a markdown fragment, so it is read
 * the way `browse/templates.ts` reads the serve shell rather than through
 * `packagedTemplate()`. Every substituted value is escaped here; the
 * template itself carries no script.
 */
function templatesDir(): string {
  return fileURLToPath(new URL('../../../templates/mcp', import.meta.url));
}

let cached: string | undefined;

async function authorizeTemplate(): Promise<string> {
  cached ??= await readFile(path.join(templatesDir(), 'authorize.html'), 'utf8');
  return cached;
}

export async function renderAuthorizePage(storeName: string, issuer: string, view: AuthorizePageView): Promise<string> {
  const hidden = Object.entries(view.hiddenFields)
    .map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`)
    .join('\n');
  const error = view.error === null ? '' : `<p class="error" role="alert">${escapeHtml(view.error)}</p>`;
  const replacements: Record<string, string> = {
    __STORE_NAME__: escapeHtml(storeName),
    __CLIENT_NAME__: escapeHtml(view.clientName),
    __ISSUER__: escapeHtml(issuer),
    __ERROR__: error,
    __HIDDEN_FIELDS__: hidden,
  };
  // One pass over the template, so a substituted value containing a token is never substituted again.
  return (await authorizeTemplate()).replace(/__[A-Z_]+__/g, (token) => {
    const value = replacements[token];
    if (value === undefined) throw new Error(`templates/mcp/authorize.html carries an unknown placeholder ${token}`);
    return value;
  });
}
