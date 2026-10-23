import type { IncomingMessage } from 'node:http';
import type { ApprovalServer } from '../browse/approve.js';
import { configStamp } from '../browse/memo.js';
import type { GitRunner } from '../git/exec.js';
import { scopesFor } from '../mcp/members.js';
import type { Store } from '../store.js';
import { CLI_VERSION } from '../../version.js';
import { buildPlugins, fillPluginTemplate, renderedCommit, storeNameFor, type PluginBundle } from './build.js';

/**
 * serve-the-session-lifecycle-to-chat-apps D7 (remote-access spec, *Members
 * download the store's plugins from the server*): `GET /plugin/` names the two
 * downloads and how to install each, and `GET /plugin/<name>-<app>.zip` is that
 * archive, built in memory by the builder `ctxr plugin build` uses, from the
 * configuration the server last loaded.
 *
 * The routes exist only while the MCP surface is configured, and every one
 * needs the verified identity assertion the approval routes need, so they are
 * not among the paths an access proxy lets through without a login. A
 * verified person the `mcp` block does not admit is refused as sign-in
 * refuses them: the plugin would connect them to nothing.
 */
export const PLUGIN_ROUTE = '/plugin/';

export function isPluginPath(pathname: string): boolean {
  return pathname === '/plugin' || pathname.startsWith(PLUGIN_ROUTE);
}

export interface PluginReply {
  status: number;
  contentType: string;
  body: string | Buffer;
  headers?: Record<string, string>;
}

const text = (status: number, message: string): PluginReply => ({ status, contentType: 'text/plain; charset=utf-8', body: `${message}\n`, headers: { 'Cache-Control': 'no-store' } });

export class PluginDownloads {
  /** The last bundle built, keyed by the commit and the configuration it was built from. */
  private cached: { key: string; bundle: PluginBundle } | null = null;
  private storeName: Promise<string> | undefined;

  constructor(private readonly git: GitRunner) {}

  private async bundleFor(store: Store): Promise<PluginBundle> {
    const commit = await renderedCommit(this.git, store.root);
    const key = `${commit ?? 'none'}:${configStamp(store.config)}`;
    if (this.cached?.key === key) return this.cached.bundle;
    this.storeName ??= storeNameFor(this.git, store.root);
    const bundle = buildPlugins({ config: store.config, storeName: await this.storeName, cliVersion: CLI_VERSION, commit });
    this.cached = { key, bundle };
    return bundle;
  }

  async handle(store: Store, approval: ApprovalServer | null, approvalError: string | null, req: IncomingMessage, pathname: string): Promise<PluginReply> {
    // Without the block these paths are no different from any unknown path.
    if (store.config.mcp === undefined) return text(404, 'not found');
    if (approval === null) return approvalError === null ? text(404, 'not found') : text(503, `the plugin downloads are unavailable: ${approvalError}`);

    const verified = await approval.verifier.verify(req.headers[approval.approval.identity.header.toLowerCase()]);
    if (!verified.ok) return text(401, 'a verified identity assertion is required');
    if (scopesFor(verified.email, store.config.mcp).length === 0) return text(403, `${verified.email} may not connect apps to this store. Ask whoever runs it to add you.`);

    const bundle = await this.bundleFor(store);
    if (pathname === '/plugin' || pathname === PLUGIN_ROUTE) {
      const [claude, chatgpt] = bundle.plugins;
      const page = fillPluginTemplate('page.html', {
        STORE_NAME: bundle.storeName,
        MCP_URL: bundle.mcpUrl,
        VERSION: bundle.version,
        CLAUDE_ARCHIVE: claude!.archiveName,
        CLAUDE_HREF: `${PLUGIN_ROUTE}${encodeURIComponent(claude!.archiveName)}`,
        CHATGPT_ARCHIVE: chatgpt!.archiveName,
        CHATGPT_HREF: `${PLUGIN_ROUTE}${encodeURIComponent(chatgpt!.archiveName)}`,
      });
      return { status: 200, contentType: 'text/html; charset=utf-8', body: page, headers: { 'Cache-Control': 'no-store' } };
    }

    const plugin = bundle.plugins.find((p) => pathname === `${PLUGIN_ROUTE}${p.archiveName}`);
    if (plugin === undefined) return text(404, 'not found');
    return {
      status: 200,
      contentType: 'application/zip',
      body: plugin.archive,
      headers: { 'Content-Disposition': `attachment; filename="${plugin.archiveName}"`, 'Cache-Control': 'no-store' },
    };
  }
}
