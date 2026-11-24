import type { IncomingMessage } from 'node:http';
import type { ApprovalServer } from '../browse/approve.js';
import { configStamp } from '../browse/memo.js';
import type { GitRunner } from '../git/exec.js';
import { scopesFor } from '../mcp/members.js';
import { SECOND_OPINION_SCOPE } from '../mcp/tool-map.js';
import type { Store } from '../store.js';
import { CLI_VERSION } from '../../version.js';
import { buildChatgptPlugin, buildServerChatgptPlugin, CLAUDE_PLUGIN_NAME, fillPluginTemplate, PLUGIN_MARKETPLACE, renderedCommit, storeNameFor, type StorePlugin } from './build.js';
import { SECOND_OPINION_PLUGIN } from './commands.js';

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

const html = (body: string): PluginReply => ({ status: 200, contentType: 'text/html; charset=utf-8', body, headers: { 'Cache-Control': 'no-store' } });
const archive = (plugin: StorePlugin): PluginReply => ({
  status: 200,
  contentType: 'application/zip',
  body: plugin.archive,
  headers: { 'Content-Disposition': `attachment; filename="${plugin.archiveName}"`, 'Cache-Control': 'no-store' },
});

/**
 * offer-the-second-opinion-on-its-own D4, D6 (remote-access spec, *The
 * second-opinion server's connect page names its plugin and connector*): the
 * connect page and the ChatGPT archive for someone who may only ask for a
 * second opinion. It names the `second-opinion` plugin and links an archive
 * whose only skill is that one. The caller has verified the member already.
 * `ctxr serve` answers a member whose one scope is `second-opinion` with it,
 * and it is every connect page of the server with no store.
 */
export function secondOpinionConnectReply(plugin: StorePlugin, pathname: string): PluginReply {
  if (pathname === '/plugin' || pathname === PLUGIN_ROUTE) {
    return html(
      fillPluginTemplate('second-opinion-page.html', {
        STORE_NAME: plugin.storeName,
        MCP_URL: plugin.mcpUrl,
        MARKETPLACE: PLUGIN_MARKETPLACE,
        PLUGIN_NAME: SECOND_OPINION_PLUGIN.name,
        OTHER_PLUGIN: CLAUDE_PLUGIN_NAME,
        VERSION: plugin.version,
        CHATGPT_ARCHIVE: plugin.archiveName,
        CHATGPT_HREF: `${PLUGIN_ROUTE}${encodeURIComponent(plugin.archiveName)}`,
      }),
    );
  }
  return pathname === `${PLUGIN_ROUTE}${plugin.archiveName}` ? archive(plugin) : text(404, 'not found');
}

/** The ChatGPT plugin that carries the second-opinion skill alone, for the server named `serverName` at `baseUrl`. */
export function secondOpinionChatgptPlugin(serverName: string, baseUrl: string, commit: string | null = null): StorePlugin {
  return buildServerChatgptPlugin({ storeName: serverName, baseUrl, cliVersion: CLI_VERSION, commit }, SECOND_OPINION_PLUGIN);
}

export class PluginDownloads {
  /** The last ChatGPT plugin built, keyed by the commit and the configuration it was built from. */
  private cached: { key: string; plugin: StorePlugin; secondOpinion: StorePlugin } | null = null;
  private storeName: Promise<string> | undefined;

  constructor(private readonly git: GitRunner) {}

  private async chatgptFor(store: Store): Promise<{ plugin: StorePlugin; secondOpinion: StorePlugin }> {
    const commit = await renderedCommit(this.git, store.root);
    const key = `${commit ?? 'none'}:${configStamp(store.config)}`;
    if (this.cached?.key === key) return this.cached;
    this.storeName ??= storeNameFor(this.git, store.root);
    const input = { config: store.config, storeName: await this.storeName, cliVersion: CLI_VERSION, commit };
    this.cached = { key, plugin: buildChatgptPlugin(input), secondOpinion: buildChatgptPlugin(input, SECOND_OPINION_PLUGIN) };
    return this.cached;
  }

  async handle(store: Store, approval: ApprovalServer | null, approvalError: string | null, req: IncomingMessage, pathname: string): Promise<PluginReply> {
    // Without the block these paths are no different from any unknown path.
    if (store.config.mcp === undefined) return text(404, 'not found');
    if (approval === null) return approvalError === null ? text(404, 'not found') : text(503, `the connect page is unavailable: ${approvalError}`);

    const verified = await approval.verifier.verify(req.headers[approval.approval.identity.header.toLowerCase()]);
    if (!verified.ok) return text(401, 'a verified identity assertion is required');
    const scopes = scopesFor(verified.email, store.config.mcp);
    if (scopes.length === 0) return text(403, `${verified.email} may not connect apps to this store. Ask whoever runs it to add you.`);

    const built = await this.chatgptFor(store);
    // offer-the-second-opinion-on-its-own D4: a member whose one scope is the second opinion is shown the small
    // plugin, and the store's own archive, which carries every skill for a store, is not theirs to fetch.
    if (scopes.every((scope) => scope === SECOND_OPINION_SCOPE)) return secondOpinionConnectReply(built.secondOpinion, pathname);
    const chatgpt = built.plugin;
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
      return html(page);
    }

    return pathname === `${PLUGIN_ROUTE}${chatgpt.archiveName}` ? archive(chatgpt) : text(404, 'not found');
  }
}
