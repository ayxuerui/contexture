import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import { buildLinkResolver } from '../core/browse/link-resolver.js';
import { renderIndexBody, renderNav } from '../core/browse/nav.js';
import { resolveNavState, resolveTheme } from '../core/browse/preferences.js';
import { titleFor } from '../core/catalog/model.js';
import { escapeHtml, renderNoteBody } from '../core/browse/render.js';
import { buildRouteTable } from '../core/browse/routes.js';
import { readStylesheet, renderShell } from '../core/browse/templates.js';
import type { CommandOutcome, CommandRequires } from '../core/command.js';
import type { RunEnv } from '../core/env.js';
import { ExitCode } from '../core/exit-codes.js';
import type { Store } from '../core/store.js';

export const requires: CommandRequires = { store: 'required' };

export interface ServeFlags {
  port: number;
  host: string;
}

export interface ServeData {
  url: string;
  port: number;
  host: string;
  root: string;
}

/**
 * Defaults to loopback so an invocation with no `--host` keeps today's
 * behavior exactly. `--host` exists for an operator who has deliberately
 * decided to put something else (a reverse proxy, a tunnel sharing this
 * process's network namespace) in front and knows what binding wider than
 * loopback exposes — this command still applies no requester filtering of
 * its own regardless of bind address; that judgment is entirely the
 * caller's.
 */
export const DEFAULT_HOST = '127.0.0.1';

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function contentTypeFor(filePath: string): string {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

/** Requirement: an unbuilt derived artifact reports how to build it, rather than an opaque 404. */
function buildHint(command: string): string {
  return `<div class="ctxr-build-hint">Not built yet. Run <code>${escapeHtml(command)}</code> and reload.</div>`;
}

function send(
  res: ServerResponse,
  method: string,
  status: number,
  contentType: string,
  body: string | Buffer,
  extraHeaders?: Readonly<Record<string, string | string[]>>,
): void {
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
  res.writeHead(status, { 'Content-Type': contentType, 'Content-Length': buffer.length, ...extraHeaders });
  res.end(method === 'HEAD' ? undefined : buffer);
}

/**
 * design.md D7 (serve-page-names-theme-and-nav-toggle): every shell-rendered response is
 * per-requester-preference, so an intermediary must not cache one response and serve it to a
 * requester with a different cookie; `Set-Cookie` is present only on the response that just
 * persisted a choice a query parameter made.
 */
function shellHeaders(setCookies: readonly (string | undefined)[]): Record<string, string | string[]> {
  const headers: Record<string, string | string[]> = { Vary: 'Cookie', 'Cache-Control': 'no-store' };
  const cookies = setCookies.filter((cookie): cookie is string => cookie !== undefined);
  if (cookies.length > 0) headers['Set-Cookie'] = cookies;
  return headers;
}

/** Reads a derived document, rendering `hint` instead of 404ing when it hasn't been built yet. */
async function readDerivedDocument(absolutePath: string): Promise<{ text: string } | { hint: true }> {
  try {
    return { text: await readFile(absolutePath, 'utf8') };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { hint: true };
    throw err;
  }
}

async function handleRequest(store: Store, stderr: NodeJS.WritableStream, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const method = req.method ?? 'GET';
  const url = new URL(req.url ?? '/', 'http://localhost');
  const pathname = decodeURIComponent(url.pathname);
  stderr.write(`${method} ${pathname}\n`);

  if (method !== 'GET' && method !== 'HEAD') {
    send(res, method, 405, 'text/plain; charset=utf-8', 'method not allowed\n');
    return;
  }

  // Ahead of buildRouteTable(): the stylesheet costs no store read at all, let alone a full one.
  if (pathname === '/assets/style.css') {
    send(res, method, 200, 'text/css; charset=utf-8', await readStylesheet());
    return;
  }

  const { theme, setCookie: themeSetCookie } = resolveTheme(req.headers.cookie, url.searchParams);
  const { navState, setCookie: navSetCookie } = resolveNavState(req.headers.cookie, url.searchParams);
  const headers = shellHeaders([themeSetCookie, navSetCookie]);
  const shellState = { theme, navState };

  const table = await buildRouteTable(store);
  const resolveLink = buildLinkResolver([...table.notes.values()]);

  if (pathname === '/') {
    send(res, method, 200, 'text/html; charset=utf-8', await renderShell('contexture', renderIndexBody(table), renderNav(table), shellState), headers);
    return;
  }

  if (pathname === '/graph') {
    const doc = await readDerivedDocument(table.graphDocumentPath);
    const body = 'hint' in doc ? buildHint('ctxr graph build') : renderNoteBody(doc.text, resolveLink);
    send(res, method, 200, 'text/html; charset=utf-8', await renderShell('graph', body, renderNav(table), shellState), headers);
    return;
  }

  if (pathname.startsWith('/notes/')) {
    const note = table.notes.get(pathname.slice('/notes/'.length));
    if (!note) {
      send(res, method, 404, 'text/plain; charset=utf-8', 'not found\n');
      return;
    }
    const noteTitle = `${titleFor(note)} — ${note.path}`;
    send(res, method, 200, 'text/html; charset=utf-8', await renderShell(noteTitle, renderNoteBody(note.body, resolveLink), renderNav(table), shellState), headers);
    return;
  }

  if (pathname.startsWith('/catalog/')) {
    const sectionId = pathname.slice('/catalog/'.length);
    const section = table.catalog.get(sectionId);
    if (!section) {
      send(res, method, 404, 'text/plain; charset=utf-8', 'not found\n');
      return;
    }
    const doc = await readDerivedDocument(section.absolutePath);
    const body = 'hint' in doc ? buildHint('ctxr catalog build') : renderNoteBody(doc.text, resolveLink);
    send(res, method, 200, 'text/html; charset=utf-8', await renderShell(sectionId, body, renderNav(table), shellState), headers);
    return;
  }

  if (pathname.startsWith('/publish/')) {
    const file = table.publishFiles.get(pathname.slice('/publish/'.length));
    if (!file) {
      send(res, method, 404, 'text/plain; charset=utf-8', 'not found\n');
      return;
    }
    send(res, method, 200, contentTypeFor(file.absolutePath), await readFile(file.absolutePath));
    return;
  }

  send(res, method, 404, 'text/plain; charset=utf-8', 'not found\n');
}

/**
 * cli-contract spec (local-browsing-surface D5): resolves the moment the
 * listener is ready, so `runCommand()` emits exactly one envelope before
 * any request is served — the listener itself keeps the process alive
 * afterward, with no change to how `run()`/`bin.ts` end.
 */
export async function execute(env: RunEnv, store: Store, flags: ServeFlags): Promise<CommandOutcome<ServeData>> {
  const server = createServer((req, res) => {
    handleRequest(store, env.io.stderr, req, res).catch((err: unknown) => {
      env.io.stderr.write(`serve: ${err instanceof Error ? err.message : String(err)}\n`);
      if (!res.headersSent) send(res, req.method ?? 'GET', 500, 'text/plain; charset=utf-8', 'internal error\n');
      else res.end();
    });
  });

  const host = flags.host;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(flags.port, host, resolve);
  });

  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : flags.port;
  const url = `http://${host}:${port}/`;

  return {
    exitCode: ExitCode.Ok,
    data: { url, port, host, root: store.root },
    findings: [],
    humanSummary: `serving ${store.root} at ${url}`,
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}
