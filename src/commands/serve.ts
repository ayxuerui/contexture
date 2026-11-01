import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import { DIAGRAM_SCRIPT_ROUTE, RENDERER_ROUTE_PREFIX, diagramRenderer } from '../core/browse/diagram-assets.js';
import { buildLinkResolver } from '../core/browse/link-resolver.js';
import { renderIndexBody, renderNav } from '../core/browse/nav.js';
import { parsePullPreviewPath, PREVIEW_ROUTE_PREFIX, PUBLISH_ROUTE_PREFIX, REVIEW_HEAD_PARAM, REVIEW_ROUTE_PREFIX } from '../core/browse/page-url.js';
import { PullPreviews } from '../core/browse/pull-preview.js';
import { hintOf, readBody, readWebhookSecret, signatureValid, WEBHOOK_ROUTE } from '../core/browse/webhook.js';
import { hardenGit } from '../core/git/hardened.js';
import type { ForgeCredentials } from '../core/forge/credentials.js';
import type { ForgeClient } from '../core/forge/github.js';
import { resolveNavState, resolveTheme } from '../core/browse/preferences.js';
import { titleFor } from '../core/catalog/model.js';
import { escapeHtml, renderNoteBody } from '../core/browse/render.js';
import { buildRouteTable } from '../core/browse/routes.js';
import { readDiagramScript, readStylesheet, renderShell } from '../core/browse/templates.js';
import type { CommandOutcome, CommandRequires } from '../core/command.js';
import type { RunEnv } from '../core/env.js';
import type { GitRunner } from '../core/git/exec.js';
import { createServingState, type ServingStateHolder } from '../core/browse/serving-state.js';
import { createStoreUpdateRunner, type StoreUpdateKind, type StoreUpdateSettings } from '../core/store-update-runner.js';
import { serveSyncMinutes } from '../config/defaults.js';
import type { StoreConfig } from '../config/schema.js';
import { readConfig } from '../config/load.js';
import { MIGRATION_STEPS } from '../config/migrations.js';
import { ExitCode } from '../core/exit-codes.js';
import { listSessionWorktreeDirs } from '../core/session.js';
import type { Store } from '../core/store.js';
import { renderReview } from '../core/browse/review.js';
import { handleApprove, isApprovePath, isDecisionRoute, type ApprovalServer, type PageKit } from '../core/browse/approve.js';
import { createIdentityVerifier } from '../core/approval/identity.js';
import { ForgeUnreachableError, RecordingLoginMismatchError } from '../core/errors.js';
import { credentialsFor, type CredentialKind } from '../core/forge/credentials.js';
import { storeForges } from '../core/approval/store-forges.js';
import { createGhForgeClient, ForgeRequestError } from '../core/forge/github.js';
import { isMcpPath, McpSurface } from '../core/mcp/surface.js';
import { isPluginPath, PluginDownloads } from '../core/plugin/routes.js';

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
  /** The forge credential kind the approval routes use; null when the store declares no change approval. */
  credential: CredentialKind | null;
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
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
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

async function handleRequest(
  holder: ServingStateHolder,
  landing: StoreUpdateControl,
  mcp: McpSurface,
  plugins: PluginDownloads,
  git: GitRunner,
  stderr: NodeJS.WritableStream,
  pulls: PullPreviews,
  webhookSecret: Buffer | null,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  // serve-follows-config-changes: one state per request, so a request never mixes two configurations.
  const { store, approval, approvalError } = await holder.current();
  landing.sync(store.config);
  const method = req.method ?? 'GET';
  const url = new URL(req.url ?? '/', 'http://localhost');
  const pathname = decodeURIComponent(url.pathname);
  stderr.write(`${method} ${pathname}\n`);

  // remote-access spec: the MCP surface answers its own paths, methods included (context-browsing's second exception).
  if (isMcpPath(pathname)) {
    await mcp.handle({ store, approval, approvalError }, req, res, pathname);
    return;
  }

  // context-browsing spec: the one exception to read-only is a POST to the decision route of a store that declares change approval.
  const decisionPost = method === 'POST' && (approval !== null || approvalError !== null) && isDecisionRoute(pathname);
  // serve-keeps-its-clone-current D9: and a POST to the webhook, which exists only with a secret in the environment.
  const webhookPost = method === 'POST' && webhookSecret !== null && pathname === WEBHOOK_ROUTE;
  if (method !== 'GET' && method !== 'HEAD' && !decisionPost && !webhookPost) {
    send(res, method, 405, 'text/plain; charset=utf-8', 'method not allowed\n');
    return;
  }

  if (webhookPost) {
    await handleWebhook(store, landing, pulls, webhookSecret, stderr, req, res);
    return;
  }

  // serve-the-session-lifecycle-to-chat-apps D7: the plugin downloads, behind the approval routes' identity check.
  if (isPluginPath(pathname)) {
    const reply = await plugins.handle(store, approval, approvalError, req, pathname);
    send(res, method, reply.status, reply.contentType, reply.body, reply.headers);
    return;
  }

  // Ahead of buildRouteTable(): the stylesheet costs no store read at all, let alone a full one.
  if (pathname === '/assets/style.css') {
    send(res, method, 200, 'text/css; charset=utf-8', await readStylesheet());
    return;
  }

  /**
   * render-diagrams-in-notes design.md D6: the two diagram assets are answered
   * here too, so neither reads store content. The renderer's URL names the
   * installed version, so it is cached immutably; the page script changes
   * whenever `ctxr` does, so it keeps the stylesheet's uncached behaviour.
   */
  if (pathname.startsWith(RENDERER_ROUTE_PREFIX)) {
    const renderer = diagramRenderer();
    if (pathname !== renderer.route) {
      send(res, method, 404, 'text/plain; charset=utf-8', 'not found\n');
      return;
    }
    send(res, method, 200, 'text/javascript; charset=utf-8', await readFile(renderer.filePath), {
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
    return;
  }

  if (pathname === DIAGRAM_SCRIPT_ROUTE) {
    send(res, method, 200, 'text/javascript; charset=utf-8', await readDiagramScript());
    return;
  }

  /**
   * serve-keeps-its-clone-current D6: a pull request's pages, from its head on
   * the forge — byte-verbatim like `/publish/`, with no shell. Answered ahead
   * of the worktree previews below, and before any read of the store's own
   * checkout.
   */
  const pullPreview = parsePullPreviewPath(pathname);
  if (pullPreview !== null) {
    const answer = await pulls.answer(store, pullPreview.number, pullPreview.filePath);
    if (answer.kind === 'file') {
      send(res, method, 200, contentTypeFor(answer.filePath), answer.body, { 'Cache-Control': 'no-store' });
    } else if (answer.kind === 'redirect') {
      res.writeHead(302, { Location: answer.location, 'Cache-Control': 'no-store', 'Content-Length': 0 });
      res.end();
    } else if (answer.kind === 'unavailable') {
      stderr.write(`serve: pull request preview ${pullPreview.number}: ${answer.message}\n`);
      send(res, method, 503, 'text/plain; charset=utf-8', 'the pull request could not be read from the forge\n');
    } else {
      send(res, method, 404, 'text/plain; charset=utf-8', 'not found\n');
    }
    return;
  }

  const { theme, setCookie: themeSetCookie } = resolveTheme(req.headers.cookie, url.searchParams);
  const { navState, setCookie: navSetCookie } = resolveNavState(req.headers.cookie, url.searchParams);
  const headers = shellHeaders([themeSetCookie, navSetCookie]);
  const shellState = { theme, navState };

  /**
   * change-approval spec: the approval routes verify the requester before
   * anything about the store is read, so the route table and navigation are
   * built only once the handler asks for them.
   */
  if (isApprovePath(pathname)) {
    const makeKit = async (): Promise<PageKit> => {
      const table = await buildRouteTable(store);
      return {
        page: (title, body) => renderShell(title, body, renderNav(table), shellState),
        linkFor: (notePath) => (table.notes.has(notePath) ? `/notes/${encodeURI(notePath)}` : null),
        resolveLink: buildLinkResolver([...table.notes.values()]),
      };
    };
    const reply = await handleApprove(store, approval, req, method, pathname, makeKit, approvalError);
    const replyHeaders = reply.contentType.startsWith('text/html') ? { ...headers, ...reply.headers } : { 'Cache-Control': 'no-store', ...reply.headers };
    send(res, method, reply.status, reply.contentType, reply.body, replyHeaders);
    // After the response: the decider's redirect never waits on a landing run.
    if (reply.landingRequested === true) landing.triggerLanding();
    return;
  }

  const table = await buildRouteTable(store);
  const resolveLink = buildLinkResolver([...table.notes.values()]);

  if (pathname === '/') {
    send(res, method, 200, 'text/html; charset=utf-8', await renderShell('contexture', { html: renderIndexBody(table), hasDiagram: false }, renderNav(table), shellState), headers);
    return;
  }

  if (pathname === '/graph') {
    const doc = await readDerivedDocument(table.graphDocumentPath);
    const body = 'hint' in doc ? { html: buildHint('ctxr graph build'), hasDiagram: false } : renderNoteBody(doc.text, resolveLink);
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
    const body = 'hint' in doc ? { html: buildHint('ctxr catalog build'), hasDiagram: false } : renderNoteBody(doc.text, resolveLink);
    send(res, method, 200, 'text/html; charset=utf-8', await renderShell(sectionId, body, renderNav(table), shellState), headers);
    return;
  }

  if (pathname.startsWith(PUBLISH_ROUTE_PREFIX)) {
    const file = table.publishFiles.get(pathname.slice(PUBLISH_ROUTE_PREFIX.length));
    if (!file) {
      send(res, method, 404, 'text/plain; charset=utf-8', 'not found\n');
      return;
    }
    send(res, method, 200, contentTypeFor(file.absolutePath), await readFile(file.absolutePath));
    return;
  }

  /**
   * preview-pages-before-they-land D6: the same treatment the publish branch
   * above gives a page that has already landed — byte-verbatim, no shell, no
   * navigation, no theme — because a preview that differs from the thing being
   * previewed is not one. Two exact-key lookups and no path normalisation: a
   * path that would escape a worktree's publish path is absent from that
   * worktree's map by construction, so the miss IS the traversal guard, exactly
   * as it is for `/publish/`.
   */
  if (pathname.startsWith(PREVIEW_ROUTE_PREFIX)) {
    const rest = pathname.slice(PREVIEW_ROUTE_PREFIX.length);
    const separator = rest.indexOf('/');
    const preview = separator === -1 ? undefined : table.previews.get(rest.slice(0, separator));
    const file = preview?.files.get(rest.slice(separator + 1));
    if (!file) {
      send(res, method, 404, 'text/plain; charset=utf-8', 'not found\n');
      return;
    }
    send(res, method, 200, contentTypeFor(file.absolutePath), await readFile(file.absolutePath));
    return;
  }

  if (pathname.startsWith(REVIEW_ROUTE_PREFIX)) {
    const name = pathname.slice(REVIEW_ROUTE_PREFIX.length).replace(/\/$/, '');
    const worktrees = await listSessionWorktreeDirs(store.root, store.config);
    if (name.includes('/') || !worktrees.includes(name)) {
      send(res, method, 404, 'text/plain; charset=utf-8', 'not found\n');
      return;
    }
    const linkFor = (notePath: string): string | null => (table.notes.has(notePath) ? `/notes/${encodeURI(notePath)}` : null);
    const body = await renderReview(git, store, name, url.searchParams.get(REVIEW_HEAD_PARAM), linkFor, resolveLink);
    send(res, method, 200, 'text/html; charset=utf-8', await renderShell(`review — ${name}`, body, renderNav(table), shellState), headers);
    return;
  }

  send(res, method, 404, 'text/plain; charset=utf-8', 'not found\n');
}

/**
 * context-browsing spec ("Only a signed forge delivery reaches the webhook";
 * "A verified push brings the server up to date at once"): a delivery whose
 * signature does not verify is answered 401 and does nothing. A verified one
 * is answered 202 first; then a push to the default branch starts a
 * store-update run (coalesced with one in progress), and a push to another
 * branch fetches it for its pull request's preview. Nothing else in the
 * delivery is used.
 */
async function handleWebhook(
  store: Store,
  landing: StoreUpdateControl,
  pulls: PullPreviews,
  secret: Buffer,
  stderr: NodeJS.WritableStream,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = await readBody(req);
  if (body === null) {
    send(res, 'POST', 413, 'text/plain; charset=utf-8', 'delivery too large\n');
    return;
  }
  if (!signatureValid(secret, body, req.headers['x-hub-signature-256'])) {
    stderr.write('serve: webhook: a delivery without a valid signature was refused\n');
    send(res, 'POST', 401, 'text/plain; charset=utf-8', 'signature does not verify\n');
    return;
  }
  const hint = hintOf(req.headers['x-github-event'], body, store.config.git.default_branch);
  send(res, 'POST', 202, 'text/plain; charset=utf-8', hint.kind === 'ignored' ? `ignored: ${hint.reason}\n` : 'accepted\n');
  if (hint.kind === 'default-branch') {
    stderr.write(`serve: webhook: ${store.config.git.default_branch} changed${hint.repository === null ? '' : ` on ${hint.repository}`}; starting a store-update run\n`);
    landing.trigger();
  } else if (hint.kind === 'branch') {
    stderr.write(`serve: webhook: ${hint.branch} changed${hint.repository === null ? '' : ` on ${hint.repository}`}; fetching it for its preview\n`);
    try {
      const fetched = await pulls.prefetchBranch(store, hint.branch);
      if (fetched.length > 0) stderr.write(`serve: webhook: fetched pull request ${fetched.map((n) => `#${n}`).join(', ')}\n`);
    } catch (err) {
      stderr.write(`serve: webhook: ${hint.branch} could not be fetched: ${err instanceof Error ? err.message : String(err)}\n`);
    }
  }
}

/**
 * cli-contract spec (local-browsing-surface D5): resolves the moment the
 * listener is ready, so `runCommand()` emits exactly one envelope before
 * any request is served — the listener itself keeps the process alive
 * afterward, with no change to how `run()`/`bin.ts` end.
 */
/**
 * change-approval spec: with the block declared, the server's forge
 * credential must be the recording login before it binds — otherwise every
 * decision would be recorded as someone the store does not count (design.md D4).
 */
async function approvalServer(env: RunEnv, store: Store): Promise<ApprovalServer | null> {
  const approval = store.config.change_approval;
  if (approval === undefined) return null;
  const credentials = await credentialsFor(env, store.root);
  const forge = createGhForgeClient(store.root, credentials);
  let login: string;
  try {
    login = await forge.login();
  } catch (err) {
    if (err instanceof ForgeRequestError) throw new ForgeUnreachableError(err.message);
    throw err;
  }
  if (login !== approval.recording_login) throw new RecordingLoginMismatchError(approval.recording_login, login);
  // github-app-recording-identity: an App not installed on this repository is named now, not on the first decision.
  await credentials.env();
  return {
    approval,
    // The schema requires serve.base_url alongside change_approval.
    origin: new URL(store.config.serve!.base_url!).origin,
    forge,
    credentials,
    // approve-sessions-across-stores D8: each mounted store's pull requests, read with the same recording identity.
    forgeFor: storeForges(env),
    env: env.env,
    verifier: createIdentityVerifier(approval.identity),
    git: env.git,
    now: () => env.now(),
  };
}

/**
 * context-browsing spec ("The server keeps its clone of the store current"),
 * change-approval spec ("The server lands what was approved"): one
 * store-update runner per server, always running. Each run is a landing run
 * while the loaded configuration declares change_approval and does not say
 * `land: manual`, and a sync run otherwise; the interval is
 * `serve.sync_minutes`. It follows configuration changes like every other part
 * of the server, so turning approval on or off at runtime changes the next
 * run's kind, and a new interval takes effect on reload.
 */
interface StoreUpdateControl {
  sync(config: StoreConfig): void;
  /** A store-update run of whichever kind the configuration calls for (a verified push to the default branch). */
  trigger(): void;
  /** A landing run, only while landing is on (an accepted approval); nothing under `land: manual`. */
  triggerLanding(): void;
  stop(): Promise<void>;
}

export function storeUpdateSettings(config: StoreConfig): StoreUpdateSettings {
  const landing = config.change_approval !== undefined && config.change_approval.land !== 'manual';
  const kind: StoreUpdateKind = landing ? 'land' : 'sync';
  return { kind, intervalMs: serveSyncMinutes(config) * 60 * 1000 };
}

function createStoreUpdateControl(env: RunEnv, initial: StoreConfig, root: string): StoreUpdateControl {
  // Exactly the command a person would run: this Node binary and this CLI's entry script.
  const command = [env.execPath, process.argv[1]!];
  const runner = createStoreUpdateRunner({ command, root, env: env.env, output: env.io.stderr, ...storeUpdateSettings(initial) });
  return {
    sync(config) {
      runner.configure(storeUpdateSettings(config));
    },
    trigger() {
      runner.trigger();
    },
    triggerLanding() {
      if (runner.kind() === 'land') runner.trigger();
    },
    stop() {
      return runner.stop();
    },
  };
}

/**
 * The store's own forge client and credential, for pull request previews and
 * the webhook: formed once, on first use, so a store that never opens a
 * preview never needs a forge credential. A failure is not remembered, so a
 * credential fixed in the environment's files is picked up on the next try.
 */
function storeForge(env: RunEnv): (store: Store) => Promise<{ forge: ForgeClient; credentials: ForgeCredentials }> {
  let formed: Promise<{ forge: ForgeClient; credentials: ForgeCredentials }> | null = null;
  return (store) => {
    formed ??= credentialsFor(env, store.root)
      .then((credentials) => ({ forge: createGhForgeClient(store.root, credentials), credentials }))
      .catch((err: unknown) => {
        formed = null;
        throw err;
      });
    return formed;
  };
}

export async function execute(env: RunEnv, store: Store, flags: ServeFlags): Promise<CommandOutcome<ServeData>> {
  // Startup still fails fast on a recording-login mismatch or an unreachable forge; only later changes degrade.
  // An ambiguous or unreadable webhook secret fails it too: a store that asked for the webhook should not run without it.
  const webhookSecret = await readWebhookSecret(env.env);
  const approval = await approvalServer(env, store);
  const holder = await createServingState({
    initial: store,
    initialApproval: approval,
    load: (root) => readConfig(root, env.migrationSteps ?? MIGRATION_STEPS),
    buildApproval: (next) => approvalServer(env, next),
    log: (line) => env.io.stderr.write(`${line}\n`),
  });
  const landing = createStoreUpdateControl(env, store.config, store.root);
  const mcp = new McpSurface({ git: env.git, canonicalRoot: store.root, env: env.env, now: () => env.now(), log: (line) => env.io.stderr.write(`${line}\n`) });
  const plugins = new PluginDownloads(env.git);
  const pulls = new PullPreviews({ git: hardenGit(env.git), env: env.env, now: () => env.now(), forgeFor: storeForge(env) });
  // Stopping serve stops a store-update run in progress; landing and syncing are resumable, so the next start finishes it.
  const shutdown = (signal: NodeJS.Signals): void => {
    void landing.stop().finally(() => process.exit(signal === 'SIGINT' ? 130 : 143));
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
  const server = createServer((req, res) => {
    handleRequest(holder, landing, mcp, plugins, env.git, env.io.stderr, pulls, webhookSecret, req, res).catch((err: unknown) => {
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
    data: { url, port, host, root: store.root, credential: approval?.forge.credential ?? null },
    findings: [],
    humanSummary: `serving ${store.root} at ${url}`,
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}
