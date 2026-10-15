import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { ContextureError } from '../errors.js';
import type { Store } from '../store.js';
import { handleMcpRequest, MCP_PATH, sendText, type Authentication } from './http.js';
import { ToolRefusal, type ToolDefinition } from './jsonrpc.js';
import { AuthorizationServer, type Principal } from './oauth.js';
import { MCP_SCOPES, type MemberRegistry } from './state.js';

/**
 * Composes the remote surface: OAuth endpoints, the `/mcp` transport, and
 * the per-call re-check of design.md D4. Authentication already re-reads
 * the member on every request (so a removed member is refused at the
 * transport); `authorizeCall` additionally refuses a tool the principal's
 * current scopes do not reach, so `tools/call` cannot reach what
 * `tools/list` hid.
 */

/** The single principal `--no-auth` admits on a loopback bind (design.md D10). */
export const OPERATOR_PRINCIPAL: Principal = { memberId: 'operator', name: 'operator', email: null, scopes: [...MCP_SCOPES] };

export interface McpServerOptions {
  store: Store;
  tools: readonly ToolDefinition<Principal>[];
  instructions: string;
  /** Null under `--no-auth`. */
  oauth: () => AuthorizationServer | null;
  /** Null under `--no-auth`. */
  members: MemberRegistry | null;
  originAllowed(origin: string): boolean;
  log(line: string): void;
}

function describeMessage(body: unknown): string {
  const one = (m: unknown): string => {
    if (typeof m !== 'object' || m === null) return '?';
    const message = m as { method?: unknown; params?: { name?: unknown } };
    if (message.method === 'tools/call') return `tools/call ${typeof message.params?.name === 'string' ? message.params.name : '?'}`;
    return typeof message.method === 'string' ? message.method : 'response';
  };
  return Array.isArray(body) ? `[${body.map(one).join(', ')}]` : one(body);
}

export function createMcpServer(options: McpServerOptions): Server {
  const authenticate = async (req: IncomingMessage): Promise<Authentication<Principal>> => {
    const oauth = options.oauth();
    if (oauth === null) return { kind: 'admitted', principal: OPERATOR_PRINCIPAL };
    return oauth.authenticate(req);
  };

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    const oauth = options.oauth();
    if (oauth !== null && (await oauth.handle(req, res, pathname))) {
      if (pathname !== MCP_PATH && !pathname.startsWith('/.well-known/')) options.log(`${req.method ?? 'GET'} ${pathname} ${res.statusCode}`);
      return;
    }
    const handled = await handleMcpRequest<Principal>(
      {
        originAllowed: options.originAllowed,
        authenticate,
        onMessage: (principal, body) => options.log(`mcp ${principal.name}: ${describeMessage(body)}`),
        contextFor: (principal) => ({
          principal,
          tools: () => options.tools.filter((tool) => (principal.scopes as readonly string[]).includes(tool.scope)),
          lookup: (name) => options.tools.find((tool) => tool.name === name),
          instructions: options.instructions,
          authorizeCall: async (tool) => {
            if (!(principal.scopes as readonly string[]).includes(tool.scope)) {
              throw new ToolRefusal('mcp.insufficient_scope', `Calling "${tool.name}" needs the "${tool.scope}" scope.`);
            }
            if (options.members !== null && principal !== OPERATOR_PRINCIPAL) {
              const member = await options.members.byId(principal.memberId);
              if (member === undefined || !(member.scopes as readonly string[]).includes(tool.scope)) {
                throw new ToolRefusal('mcp.insufficient_scope', `Calling "${tool.name}" needs the "${tool.scope}" scope.`);
              }
            }
          },
          refusalFor: (err) =>
            err instanceof ContextureError ? new ToolRefusal(err.finding.code, err.finding.message, err.finding.details) : undefined,
        }),
      },
      req,
      res,
      pathname,
    );
    if (!handled) sendText(res, 404, 'not found\n');
  };

  return createServer((req, res) => {
    handle(req, res).catch((err: unknown) => {
      options.log(`mcp: ${err instanceof Error ? err.message : String(err)}`);
      if (!res.headersSent) sendText(res, 500, 'internal error\n');
      else res.end();
    });
  });
}
