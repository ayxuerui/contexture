import type { IncomingMessage } from 'node:http';
import type { ApprovalServer } from '../browse/approve.js';
import { configStamp } from '../browse/memo.js';
import type { GitRunner } from '../git/exec.js';
import { scopesFor } from '../mcp/members.js';
import type { Store } from '../store.js';
import { CLI_VERSION } from '../../version.js';
import { buildChatgptPlugin, CLAUDE_PLUGIN_NAME, fillPluginTemplate, PLUGIN_MARKETPLACE, renderedCommit, storeNameFor, type StorePlugin } from './build.js';

/**
 * publish-one-contexture-plugin D4 (remote-access spec, *The server's connect
 * page tells a member how to add the plugin and this store's connector*):
 * `GET /plugin/` is the store's connect page. It names contexture's
 * marketplace and plugin for Claude, this store's connector address and how
 * to add it in each app, and links the store's ChatGPT plugin. There is no
 * Claude archive any more: Claude's plugin is contexture's, installed from its
 * marketplace. `GET /plugin/<name>-chatgpt.zip` is the ChatGPT archive, built
 * in memory by the builder `ctxr plugin build` uses, from the configuration
 * the server last loaded (serve-the-session-lifecycle-to-chat-apps D7).
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
  /** The last ChatGPT plugin built, keyed by the commit and the configuration it was built from. */
  private cached: { key: string; plugin: StorePlugin } | null = null;
  private storeName: Promise<string> | undefined;

  constructor(private readonly git: GitRunner) {}

  private async chatgptFor(store: Store): Promise<StorePlugin> {
    const commit = await renderedCommit(this.git, store.root);
    const key = `${commit ?? 'none'}:${configStamp(store.config)}`;
    if (this.cached?.key === key) return this.cached.plugin;
    this.storeName ??= storeNameFor(this.git, store.root);
    const plugin = buildChatgptPlugin({ config: store.config, storeName: await this.storeName, cliVersion: CLI_VERSION, commit });
    this.cached = { key, plugin };
    return plugin;
  }

  async handle(store: Store, approval: ApprovalServer | null, approvalError: string | null, req: IncomingMessage, pathname: string): Promise<PluginReply> {
    // Without the block these paths are no different from any unknown path.
    if (store.config.mcp === undefined) return text(404, 'not found');
    if (approval === null) return approvalError === null ? text(404, 'not found') : text(503, `the connect page is unavailable: ${approvalError}`);

    const verified = await approval.verifier.verify(req.headers[approval.approval.identity.header.toLowerCase()]);
    if (!verified.ok) return text(401, 'a verified identity assertion is required');
    if (scopesFor(verified.email, store.config.mcp).length === 0) return text(403, `${verified.email} may not connect apps to this store. Ask whoever runs it to add you.`);

    const chatgpt = await this.chatgptFor(store);
    if (pathname === '/plugin' || pathname === PLUGIN_ROUTE) {
      const page = fillPluginTemplate('page.html', {
        STORE_NAME: chatgpt.storeName,
        MCP_URL: chatgpt.mcpUrl,
        MARKETPLACE: PLUGIN_MARKETPLACE,
        PLUGIN_NAME: CLAUDE_PLUGIN_NAME,
        OLD_PLUGIN_NAME: chatgpt.name,
        VERSION: chatgpt.version,
        CHATGPT_ARCHIVE: chatgpt.archiveName,
        CHATGPT_HREF: `${PLUGIN_ROUTE}${encodeURIComponent(chatgpt.archiveName)}`,
      });
      return { status: 200, contentType: 'text/html; charset=utf-8', body: page, headers: { 'Cache-Control': 'no-store' } };
    }

    if (pathname !== `${PLUGIN_ROUTE}${chatgpt.archiveName}`) return text(404, 'not found');
    return {
      status: 200,
      contentType: 'application/zip',
      body: chatgpt.archive,
      headers: { 'Content-Disposition': `attachment; filename="${chatgpt.archiveName}"`, 'Cache-Control': 'no-store' },
    };
  }
}
