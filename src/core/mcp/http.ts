import type { IncomingMessage, ServerResponse } from 'node:http';
import { dispatch, parseErrorResponse, type DispatchContext } from './jsonrpc.js';

/**
 * serve-the-store-over-mcp design.md D2/D10: the Streamable HTTP transport,
 * reduced to what a stateless, stream-free server needs. `POST /mcp` carries
 * JSON-RPC in and plain JSON out (202 when nothing needs an answer); `GET`
 * and `DELETE` answer 405, which the transport permits for a server that
 * opens no stream and issues no session.
 */
export const MCP_PATH = '/mcp';

/** Generous for a JSON-RPC message, small enough that a hostile body cannot exhaust memory. */
export const MAX_MCP_BODY_BYTES = 1024 * 1024;

export class BodyTooLargeError extends Error {
  constructor(readonly limit: number) {
    super(`request body exceeds ${limit} bytes`);
    this.name = 'BodyTooLargeError';
  }
}

export async function readBody(req: IncomingMessage, limit: number): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    total += buffer.length;
    if (total > limit) throw new BodyTooLargeError(limit);
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  const buffer = Buffer.from(JSON.stringify(body), 'utf8');
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': buffer.length, 'Cache-Control': 'no-store', ...headers });
  res.end(buffer);
}

export function sendText(res: ServerResponse, status: number, text: string, headers: Record<string, string> = {}): void {
  const buffer = Buffer.from(text, 'utf8');
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': buffer.length, ...headers });
  res.end(buffer);
}

/** What authenticating one `/mcp` request comes to: a principal, or the response that refuses it. */
export type Authentication<TPrincipal> =
  | { kind: 'admitted'; principal: TPrincipal }
  | { kind: 'refused'; status: number; headers: Record<string, string>; body: unknown };

export interface McpTransportOptions<TPrincipal> {
  /** Origin check (design.md D10): an `Origin` header that is present and refused gets 403. */
  originAllowed(origin: string): boolean;
  authenticate(req: IncomingMessage): Promise<Authentication<TPrincipal>>;
  contextFor(principal: TPrincipal): DispatchContext<TPrincipal>;
  /** Observes each parsed body before dispatch — the server's request log. */
  onMessage?(principal: TPrincipal, body: unknown): void;
}

/** Handles `/mcp`; returns false for any other path so the caller can route it. */
export async function handleMcpRequest<TPrincipal>(
  options: McpTransportOptions<TPrincipal>,
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
): Promise<boolean> {
  if (pathname !== MCP_PATH) return false;

  const origin = req.headers.origin;
  if (origin !== undefined && !options.originAllowed(origin)) {
    sendText(res, 403, 'origin not allowed\n');
    return true;
  }

  const method = req.method ?? 'GET';
  if (method !== 'POST') {
    sendText(res, 405, 'method not allowed: this server opens no stream; send JSON-RPC by POST\n', { Allow: 'POST' });
    return true;
  }

  const auth = await options.authenticate(req);
  if (auth.kind === 'refused') {
    sendJson(res, auth.status, auth.body, auth.headers);
    return true;
  }

  let text: string;
  try {
    text = await readBody(req, MAX_MCP_BODY_BYTES);
  } catch (err) {
    if (err instanceof BodyTooLargeError) {
      sendText(res, 413, `${err.message}\n`);
      return true;
    }
    throw err;
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    sendJson(res, 400, parseErrorResponse());
    return true;
  }

  options.onMessage?.(auth.principal, body);
  const answer = await dispatch(body, options.contextFor(auth.principal));
  if (answer === null) {
    res.writeHead(202, { 'Content-Length': 0 });
    res.end();
    return true;
  }
  sendJson(res, 200, answer);
  return true;
}
