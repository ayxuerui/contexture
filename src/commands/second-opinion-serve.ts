import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import type { ChangeApprovalConfig } from '../config/schema.js';
import { createIdentityVerifier, type IdentityVerifier } from '../core/approval/identity.js';
import { isDecider } from '../core/approval/decision.js';
import type { CommandOutcome, CommandRequires } from '../core/command.js';
import type { RunEnv } from '../core/env.js';
import { ExitCode } from '../core/exit-codes.js';
import { packagedCliEntry } from '../core/mcp/cli-runner.js';
import { sendText } from '../core/mcp/http.js';
import { Signer } from '../core/mcp/oauth.js';
import { handleSurfaceRequest, isMcpPath } from '../core/mcp/surface.js';
import { buildSecondOpinionTools, secondOpinionInstructions } from '../core/mcp/tools/index.js';
import { isPluginPath, secondOpinionChatgptPlugin, secondOpinionConnectReply } from '../core/plugin/routes.js';
import type { StorePlugin } from '../core/plugin/build.js';
import { followServeConfig, loadServeConfig, type SecondOpinionServeConfig } from '../core/second-opinion/serve-config.js';
import { signingKey, stateDirectory } from '../core/second-opinion/serve-state.js';

/**
 * offer-the-second-opinion-on-its-own D7 (remote-access spec, *A server can
 * offer a second opinion and nothing else*; cli-contract spec, *`ctxr
 * second-opinion serve` starts a server without a store*): sign-in, `/mcp`
 * with the four second-opinion tools, and the connect page. Every other path
 * is `404`.
 *
 * It needs no store, and a store nearby changes nothing: the people and the
 * lineup come from the file `--config` names. Nothing on this path forms a
 * forge credential, reads the GitHub App's key or the webhook secret, or runs
 * git: the handler has no route that would.
 */
export const requires: CommandRequires = { store: 'absent' };

export const DEFAULT_HOST = '127.0.0.1';

export interface SecondOpinionServeFlags {
  config: string;
  port: number;
  host: string;
  stateDir?: string;
}

export interface SecondOpinionServeData {
  url: string;
  port: number;
  host: string;
  /** The file the server reads its people and lineup from. */
  config: string;
  /** Where the server keeps its token-signing key. */
  state_dir: string;
  base_url: string;
}

const originOf = (config: SecondOpinionServeConfig): string => new URL(config.base_url).origin;

function send(res: ServerResponse, method: string, status: number, contentType: string, body: string | Buffer, headers: Record<string, string> = {}): void {
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
  res.writeHead(status, { 'Content-Type': contentType, 'Content-Length': buffer.length, ...headers });
  res.end(method === 'HEAD' ? undefined : buffer);
}

export async function execute(env: RunEnv, flags: SecondOpinionServeFlags): Promise<CommandOutcome<SecondOpinionServeData>> {
  const file = path.resolve(env.cwd, flags.config);
  const log = (line: string): void => {
    env.io.stderr.write(`${line}\n`);
  };
  // Startup fails fast, with the usage code and before anything listens, on a file that does not load or a key that is not the server's alone.
  const initial = await loadServeConfig(file);
  const stateDir = stateDirectory(flags.stateDir, env.env, env.cwd);
  const signer = new Signer(signingKey(stateDir));
  const follower = await followServeConfig(file, initial, log);
  const spentCodes = new Map<string, number>();
  const entry = packagedCliEntry();

  // The verifier keeps the proxy's key set between requests; rebuilt only when the identity settings change.
  let verifierFor: { key: string; verifier: IdentityVerifier } | null = null;
  const verifier = (identity: ChangeApprovalConfig['identity']): IdentityVerifier => {
    const key = JSON.stringify(identity);
    if (verifierFor?.key !== key) verifierFor = { key, verifier: createIdentityVerifier(identity, { now: () => env.now() }) };
    return verifierFor.verifier;
  };
  // The ChatGPT plugin names the connector's address; rebuilt only when that changes.
  let pluginFor: { origin: string; plugin: StorePlugin } | null = null;
  const plugin = (origin: string): StorePlugin => {
    if (pluginFor?.origin !== origin) pluginFor = { origin, plugin: secondOpinionChatgptPlugin(new URL(origin).host, origin) };
    return pluginFor.plugin;
  };

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // One file state per request, so a request never mixes two.
    const config = await follower.current();
    const method = req.method ?? 'GET';
    const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    const origin = originOf(config);
    const name = new URL(origin).host;
    log(`${method} ${pathname}`);

    if (isMcpPath(pathname)) {
      await handleSurfaceRequest(
        {
          issuer: origin,
          identityHeader: config.identity.header,
          verifier: verifier(config.identity),
          // Every member the file admits holds the second-opinion scope and no other: the file names no reader.
          members: () => ({ second_opinion: config.members }),
          signer,
          spentCodes,
          name,
          now: () => env.now(),
          log,
          tools: async () => buildSecondOpinionTools({ entry, env: env.env, lineupSource: async () => ({ lineup: config.second_opinion }) }),
          instructionsFor: () => secondOpinionInstructions(name),
        },
        req,
        res,
        pathname,
      );
      return;
    }

    if (method !== 'GET' && method !== 'HEAD') {
      sendText(res, 405, 'method not allowed\n');
      return;
    }

    if (isPluginPath(pathname)) {
      const verified = await verifier(config.identity).verify(req.headers[config.identity.header.toLowerCase()]);
      if (!verified.ok) return send(res, method, 401, 'text/plain; charset=utf-8', 'a verified identity assertion is required\n', { 'Cache-Control': 'no-store' });
      if (!isDecider(verified.email, config.members)) {
        return send(res, method, 403, 'text/plain; charset=utf-8', `${verified.email} may not connect apps to this server. Ask whoever runs it to add you.\n`, { 'Cache-Control': 'no-store' });
      }
      const reply = secondOpinionConnectReply(plugin(origin), pathname);
      return send(res, method, reply.status, reply.contentType, reply.body, reply.headers);
    }

    send(res, method, 404, 'text/plain; charset=utf-8', 'not found\n');
  }

  const server = createServer((req, res) => {
    handle(req, res).catch((err: unknown) => {
      log(`second-opinion serve: ${err instanceof Error ? err.message : String(err)}`);
      if (!res.headersSent) send(res, req.method ?? 'GET', 500, 'text/plain; charset=utf-8', 'internal error\n');
      else res.end();
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(flags.port, flags.host, resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : flags.port;
  const url = `http://${flags.host}:${port}/`;

  return {
    exitCode: ExitCode.Ok,
    data: { url, port, host: flags.host, config: file, state_dir: stateDir, base_url: originOf(initial) },
    findings: [],
    humanSummary: `serving a second opinion at ${url} (${originOf(initial)}), from ${file}`,
    storeRoot: null,
    schemaVersion: null,
  };
}
