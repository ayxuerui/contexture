import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import type { ApprovalServer } from '../browse/approve.js';
import { ContextureError } from '../errors.js';
import type { GitRunner } from '../git/exec.js';
import type { Store } from '../store.js';
import { handleMcpRequest, MCP_PATH, sendText } from './http.js';
import { ToolRefusal } from './jsonrpc.js';
import { AuthorizationServer, OAUTH_PATHS, Signer, type Principal } from './oauth.js';
import { renderConsentPage } from './pages.js';
import { McpView } from './sync.js';
import { buildTools, serverInstructions } from './tools/index.js';

/**
 * serve-the-store-over-mcp design.md D3, D10 (remote-access spec): the MCP
 * surface `ctxr serve` routes its MCP paths to. One per server, holding only
 * what must outlive a configuration reload — the read view, the spent-code
 * nonces, and the signer. Everything else is built per request from the
 * state `serve` last loaded, so adding, changing or removing the `mcp` block
 * takes effect on the next request with no restart.
 */

/** Every path the MCP surface answers; `serve` routes these here ahead of its own routes. */
export function isMcpPath(pathname: string): boolean {
  return pathname === MCP_PATH || OAUTH_PATHS.includes(pathname);
}

export interface McpSurfaceState {
  store: Store;
  approval: ApprovalServer | null;
  approvalError: string | null;
}

export interface McpSurfaceOptions {
  git: GitRunner;
  canonicalRoot: string;
  env: Readonly<Record<string, string | undefined>>;
  now(): Date;
  log(line: string): void;
}

/** HKDF info for the token-signing key derived from the App's private key (design.md D5). Changing it signs everyone out. */
const SIGNING_KEY_INFO = 'contexture mcp token signing v1';

function describeMessage(body: unknown): string {
  const one = (m: unknown): string => {
    if (typeof m !== 'object' || m === null) return '?';
    const message = m as { method?: unknown; params?: { name?: unknown } };
    if (message.method === 'tools/call') return `tools/call ${typeof message.params?.name === 'string' ? message.params.name : '?'}`;
    return typeof message.method === 'string' ? message.method : 'response';
  };
  return Array.isArray(body) ? `[${body.map(one).join(', ')}]` : one(body);
}

export class McpSurface {
  private readonly view: McpView;
  private readonly spentCodes = new Map<string, number>();
  private readonly signers = new Map<string, Signer>();
  private randomKey: Buffer | undefined;

  constructor(private readonly options: McpSurfaceOptions) {
    this.view = new McpView({ git: options.git, canonicalRoot: options.canonicalRoot, now: options.now });
  }

  /** The App-derived key when there is an App; otherwise one random key for this process, said once. */
  private signerFor(approval: ApprovalServer): Signer {
    let key = approval.credentials.derivedSecret(SIGNING_KEY_INFO);
    if (key === null) {
      if (this.randomKey === undefined) {
        this.randomKey = randomBytes(32);
        this.options.log("serve: MCP sign-in tokens are signed with a per-process key (the forge credential is gh's own, not a GitHub App); members sign in again after each restart.");
      }
      key = this.randomKey;
    }
    const id = key.toString('hex');
    let signer = this.signers.get(id);
    if (signer === undefined) {
      signer = new Signer(key);
      this.signers.set(id, signer);
    }
    return signer;
  }

  async handle(state: McpSurfaceState, req: IncomingMessage, res: ServerResponse, pathname: string): Promise<void> {
    const method = req.method ?? 'GET';
    const config = state.store.config;

    // context-browsing spec: without the block these paths are no different from any unknown path.
    if (config.mcp === undefined) {
      if (method === 'GET' || method === 'HEAD') sendText(res, 404, 'not found\n');
      else sendText(res, 405, 'method not allowed\n');
      return;
    }
    if (state.approval === null) {
      sendText(res, 503, `The MCP surface is unavailable: ${state.approvalError ?? 'change approval could not be set up'}.\n`);
      return;
    }

    const approval = state.approval;
    const issuer = approval.origin;
    const storeName = path.basename(state.store.root);
    const oauth = new AuthorizationServer({
      issuer,
      resource: `${issuer}${MCP_PATH}`,
      identityHeader: approval.approval.identity.header,
      verifier: approval.verifier,
      mcp: () => config.mcp,
      signer: this.signerFor(approval),
      spentCodes: this.spentCodes,
      now: this.options.now,
      renderConsentPage: (view) => renderConsentPage(storeName, view),
      log: this.options.log,
    });

    if (await oauth.handle(req, res, pathname)) {
      this.options.log(`mcp ${method} ${pathname} -> ${res.statusCode}`);
      return;
    }

    const tools = buildTools({
      view: this.view,
      deps: { config, credentials: approval.credentials, forge: approval.forge, env: this.options.env },
      baseUrl: config.serve?.base_url,
    });
    const instructions = serverInstructions(storeName);
    await handleMcpRequest<Principal>(
      {
        originAllowed: (origin) => origin === issuer,
        authenticate: (r) => oauth.authenticate(r),
        onMessage: (principal, body) => this.options.log(`mcp ${principal.email}: ${describeMessage(body)}`),
        contextFor: (principal) => ({
          principal,
          tools: () => tools.filter((tool) => (principal.scopes as readonly string[]).includes(tool.scope)),
          lookup: (name) => tools.find((tool) => tool.name === name),
          instructions,
          authorizeCall: (tool) => {
            if (!(principal.scopes as readonly string[]).includes(tool.scope)) {
              throw new ToolRefusal('mcp.insufficient_scope', `Calling "${tool.name}" needs the "${tool.scope}" scope.`);
            }
          },
          refusalFor: (err) => (err instanceof ContextureError ? new ToolRefusal(err.finding.code, err.finding.message, err.finding.details) : undefined),
        }),
      },
      req,
      res,
      pathname,
    );
  }
}
