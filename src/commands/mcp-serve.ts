import path from 'node:path';
import type { CommandOutcome, CommandRequires } from '../core/command.js';
import type { RunEnv } from '../core/env.js';
import { ContextureError } from '../core/errors.js';
import { ExitCode } from '../core/exit-codes.js';
import { MCP_PATH } from '../core/mcp/http.js';
import { AuthorizationServer, Signer } from '../core/mcp/oauth.js';
import { renderAuthorizePage } from '../core/mcp/pages.js';
import { createMcpServer } from '../core/mcp/server.js';
import { ensureStateDir, loadSigningKey, MemberRegistry, resolveStateDir } from '../core/mcp/state.js';
import { StoreSync } from '../core/mcp/sync.js';
import { buildTools, serverInstructions } from '../core/mcp/tools/index.js';
import type { Store } from '../core/store.js';

export const requires: CommandRequires = { store: 'required' };

/**
 * remote-access spec: serves the store over MCP from a dedicated checkout.
 * Like `ctxr serve`, it resolves once the listener is ready — one envelope,
 * then the listener keeps the process alive (design.md D11).
 */

export const DEFAULT_MCP_HOST = '127.0.0.1';
export const DEFAULT_MCP_PORT = 8765;
export const DEFAULT_PULL_INTERVAL_SECONDS = 60;
export const DEFAULT_GATHER_MAX_BYTES = 60_000;

export interface McpServeFlags {
  host: string;
  port: number;
  publicUrl?: string;
  stateDir?: string;
  pullInterval: number;
  gatherMaxBytes: number;
  trustProxy: boolean;
  auth: boolean;
}

export interface McpServeData {
  url: string;
  host: string;
  port: number;
  root: string;
  head: string;
  auth: boolean;
  state_dir: string | null;
  members: number | null;
}

function usage(code: string, message: string): ContextureError {
  return new ContextureError(ExitCode.Usage, { code, severity: 'error', message });
}

export function isLoopbackHost(host: string): boolean {
  return host === 'localhost' || host === '::1' || host === '[::1]' || /^127\.\d+\.\d+\.\d+$/.test(host);
}

/** The issuer: an origin with no path, query or fragment, https unless it names loopback. */
function parsePublicUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw usage('mcp.public_url_invalid', `--public-url "${raw}" is not an absolute URL.`);
  }
  if (url.pathname !== '/' || url.search !== '' || url.hash !== '' || url.username !== '' || url.password !== '') {
    throw usage('mcp.public_url_invalid', `--public-url names an origin only (scheme, host, port), e.g. https://store.example.ts.net — not "${raw}".`);
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopbackHost(url.hostname))) {
    throw usage('mcp.public_url_invalid', `--public-url must be https (got "${raw}"); chat apps refuse to connect over plain http.`);
  }
  return url;
}

function validateFlags(flags: McpServeFlags): URL | undefined {
  const loopback = isLoopbackHost(flags.host);
  if (!flags.auth && !loopback) {
    throw usage('mcp.no_auth_off_loopback', `--no-auth is only allowed on a loopback bind; "${flags.host}" is reachable by others.`);
  }
  if (!loopback && flags.publicUrl === undefined) {
    throw usage('mcp.public_url_required', `Binding "${flags.host}" needs --public-url naming the https address clients reach (a Tailscale Funnel or reverse proxy).`);
  }
  if (!Number.isInteger(flags.port) || flags.port < 0 || flags.port > 65535) throw usage('mcp.port_invalid', `--port must be 0–65535.`);
  if (!Number.isInteger(flags.pullInterval) || flags.pullInterval < 0) throw usage('mcp.pull_interval_invalid', '--pull-interval is a whole number of seconds, 0 to never pull.');
  if (!Number.isInteger(flags.gatherMaxBytes) || flags.gatherMaxBytes < 1000) throw usage('mcp.gather_max_bytes_invalid', '--gather-max-bytes is a whole number of bytes, at least 1000.');
  return flags.publicUrl === undefined ? undefined : parsePublicUrl(flags.publicUrl);
}

const LOOPBACK_ORIGIN_RE = /^https?:\/\/(localhost|127\.\d+\.\d+\.\d+|\[::1\])(:\d+)?$/;

export async function execute(env: RunEnv, store: Store, flags: McpServeFlags): Promise<CommandOutcome<McpServeData>> {
  const publicUrl = validateFlags(flags);
  const loopback = isLoopbackHost(flags.host);

  let stateDir: string | null = null;
  let members: MemberRegistry | null = null;
  let signer: Signer | null = null;
  if (flags.auth) {
    stateDir = resolveStateDir(store.root, env.env.HOME, flags.stateDir, env.cwd);
    await ensureStateDir(stateDir);
    signer = new Signer(await loadSigningKey(stateDir));
    members = new MemberRegistry(stateDir);
  }

  const sync = new StoreSync(env.git, store, { pullIntervalSeconds: flags.pullInterval, now: () => env.now() });
  await sync.start();

  let oauth: AuthorizationServer | null = null;
  let issuer = '';
  const log = (line: string): void => {
    env.io.stderr.write(`${line}\n`);
  };
  const server = createMcpServer({
    store,
    tools: buildTools(store, sync),
    instructions: serverInstructions(store),
    oauth: () => oauth,
    members,
    originAllowed: (origin) => (publicUrl !== undefined && origin === publicUrl.origin) || (loopback && LOOPBACK_ORIGIN_RE.test(origin)),
    log,
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(flags.port, flags.host, resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : flags.port;
  const bound = `http://${flags.host.includes(':') && !flags.host.startsWith('[') ? `[${flags.host}]` : flags.host}:${port}`;
  issuer = publicUrl?.origin ?? bound;

  if (signer !== null && members !== null) {
    oauth = new AuthorizationServer({
      issuer,
      resource: `${issuer}${MCP_PATH}`,
      members,
      signer,
      now: () => env.now(),
      trustProxy: flags.trustProxy,
      renderAuthorizePage: (view) => renderAuthorizePage(path.basename(store.root), issuer, view),
    });
  }

  const memberCount = members === null ? null : await members.count();
  const url = `${issuer}${MCP_PATH}`;
  const notices: string[] = [];
  if (flags.auth && memberCount === 0) notices.push('No members yet: add one with `ctxr mcp member add <name> --scope read,capture`.');
  if (flags.trustProxy && publicUrl === undefined) notices.push('--trust-proxy is set without --public-url; it only matters behind a proxy.');

  return {
    exitCode: ExitCode.Ok,
    data: { url, host: flags.host, port, root: store.root, head: sync.state.head, auth: flags.auth, state_dir: stateDir, members: memberCount },
    findings: [],
    notices,
    humanSummary: `serving ${store.root} over MCP at ${url}${flags.auth ? ` (${memberCount} member(s))` : ' with authentication OFF (loopback only)'}`,
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}
