import { CLI_VERSION } from '../../version.js';

/**
 * serve-the-store-over-mcp design.md D2: the MCP subset the remote surface
 * speaks, hand-rolled rather than taken from the SDK. Four methods, every
 * notification accepted and ignored, everything else refused in protocol.
 * Transport-free: `http.ts` hands this module a parsed body and writes back
 * whatever it returns, so the dispatch is testable without a socket.
 */

/** Newest first. `initialize` echoes a client's version from this list, else answers with the first. */
export const SUPPORTED_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'] as const;

export const JSONRPC_PARSE_ERROR = -32700;
export const JSONRPC_INVALID_REQUEST = -32600;
export const JSONRPC_METHOD_NOT_FOUND = -32601;
export const JSONRPC_INVALID_PARAMS = -32602;
export const JSONRPC_INTERNAL_ERROR = -32603;

export type JsonRpcId = string | number;

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: JsonRpcId | null;
  result?: unknown;
  error?: JsonRpcError;
}

/** A tool as `tools/list` advertises it and `tools/call` runs it. */
export interface ToolDefinition<TPrincipal> {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** The scope a principal must hold for the tool to be listed or called. */
  scope: string;
  readOnly: boolean;
  run(args: Record<string, unknown>, principal: TPrincipal): Promise<unknown>;
}

/** Raised by a tool for an expected refusal; becomes an `isError` result the client model can read, never a protocol error. */
export class ToolRefusal extends Error {
  readonly code: string;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ToolRefusal';
    this.code = code;
    this.details = details;
  }
}

export interface DispatchContext<TPrincipal> {
  principal: TPrincipal;
  /** The tools this principal may see and call — already filtered by scope. */
  tools(): readonly ToolDefinition<TPrincipal>[];
  /**
   * Every tool the server has, whatever the principal holds — so a call to a
   * tool its scopes do not reach is refused as insufficient scope by
   * `authorizeCall`, rather than reported as a tool that does not exist.
   */
  lookup?(name: string): ToolDefinition<TPrincipal> | undefined;
  instructions: string;
  /** Re-checks membership and scope at call time (design.md D4); throws a ToolRefusal to refuse. */
  authorizeCall(tool: ToolDefinition<TPrincipal>): void | Promise<void>;
  /** Turns an unexpected error from a tool into a refusal the client can read, or rethrows. */
  refusalFor(err: unknown): ToolRefusal | undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidId(value: unknown): value is JsonRpcId {
  return typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value));
}

function errorResponse(id: JsonRpcId | null, code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: data === undefined ? { code, message } : { code, message, data } };
}

export function parseErrorResponse(): JsonRpcResponse {
  return errorResponse(null, JSONRPC_PARSE_ERROR, 'Parse error: the request body is not valid JSON.');
}

export function negotiateProtocolVersion(requested: unknown): string {
  return typeof requested === 'string' && (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
    ? requested
    : SUPPORTED_PROTOCOL_VERSIONS[0];
}

function toolResult(data: unknown, isError: boolean): Record<string, unknown> {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
    isError,
  };
}

async function callTool<TPrincipal>(id: JsonRpcId, params: unknown, ctx: DispatchContext<TPrincipal>): Promise<JsonRpcResponse> {
  if (!isObject(params) || typeof params.name !== 'string') {
    return errorResponse(id, JSONRPC_INVALID_PARAMS, 'tools/call needs params.name naming a tool.');
  }
  const name = params.name;
  const tool = ctx.lookup?.(name) ?? ctx.tools().find((t) => t.name === name);
  if (tool === undefined) return errorResponse(id, JSONRPC_INVALID_PARAMS, `Unknown tool "${params.name}".`);
  const args = params.arguments === undefined ? {} : params.arguments;
  if (!isObject(args)) return errorResponse(id, JSONRPC_INVALID_PARAMS, 'tools/call params.arguments must be an object.');

  try {
    await ctx.authorizeCall(tool);
    return { jsonrpc: '2.0', id, result: toolResult(await tool.run(args, ctx.principal), false) };
  } catch (err) {
    const refusal = err instanceof ToolRefusal ? err : ctx.refusalFor(err);
    if (refusal === undefined) throw err;
    const data = { error: { code: refusal.code, message: refusal.message, ...(refusal.details ? { details: refusal.details } : {}) } };
    return { jsonrpc: '2.0', id, result: toolResult(data, true) };
  }
}

async function dispatchOne<TPrincipal>(message: unknown, ctx: DispatchContext<TPrincipal>): Promise<JsonRpcResponse | null> {
  if (!isObject(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    // A response object sent to us (a client answering a request we never made) is not a request; drop it.
    if (isObject(message) && message.jsonrpc === '2.0' && message.method === undefined && ('result' in message || 'error' in message)) {
      return null;
    }
    const id = isObject(message) && isValidId(message.id) ? message.id : null;
    return errorResponse(id, JSONRPC_INVALID_REQUEST, 'Invalid request: expected a JSON-RPC 2.0 request object.');
  }

  // A notification has no id and gets no answer, whatever its method.
  if (!('id' in message)) return null;
  if (!isValidId(message.id)) return errorResponse(null, JSONRPC_INVALID_REQUEST, 'Invalid request: id must be a string or a number.');
  const id = message.id;

  try {
    switch (message.method) {
      case 'initialize': {
        const params = isObject(message.params) ? message.params : {};
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: negotiateProtocolVersion(params.protocolVersion),
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: 'contexture', title: 'contexture store', version: CLI_VERSION },
            instructions: ctx.instructions,
          },
        };
      }
      case 'ping':
        return { jsonrpc: '2.0', id, result: {} };
      case 'tools/list':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            tools: ctx.tools().map((tool) => ({
              name: tool.name,
              title: tool.title,
              description: tool.description,
              inputSchema: tool.inputSchema,
              annotations: { title: tool.title, readOnlyHint: tool.readOnly, destructiveHint: false, idempotentHint: tool.readOnly, openWorldHint: false },
            })),
          },
        };
      case 'tools/call':
        return await callTool(id, message.params, ctx);
      default:
        return errorResponse(id, JSONRPC_METHOD_NOT_FOUND, `Method not found: "${message.method}".`);
    }
  } catch (err) {
    return errorResponse(id, JSONRPC_INTERNAL_ERROR, err instanceof Error ? err.message : String(err));
  }
}

/**
 * One POST body in, the body to answer with out — `null` when nothing in it
 * expects an answer (only notifications and responses), which the transport
 * turns into HTTP 202. A batch (allowed by 2025-03-26) is answered as a batch.
 */
export async function dispatch<TPrincipal>(body: unknown, ctx: DispatchContext<TPrincipal>): Promise<JsonRpcResponse | JsonRpcResponse[] | null> {
  if (Array.isArray(body)) {
    if (body.length === 0) return errorResponse(null, JSONRPC_INVALID_REQUEST, 'Invalid request: an empty batch.');
    const answers: JsonRpcResponse[] = [];
    for (const message of body) {
      const answer = await dispatchOne(message, ctx);
      if (answer !== null) answers.push(answer);
    }
    return answers.length === 0 ? null : answers;
  }
  return dispatchOne(body, ctx);
}
