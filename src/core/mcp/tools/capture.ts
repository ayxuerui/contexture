import type { Store } from '../../store.js';
import { ToolRefusal } from '../jsonrpc.js';

/**
 * remote-access spec, *`capture` writes one new capture onto a pushed
 * branch*. This is the checkpoint stub of tasks 3.5: the tool is listed as a
 * write tool (not read-only, reached only by the `capture` scope) and checks
 * its input exactly as the real one will, but writes nothing, so a real
 * client's handling of a write tool is exercised before the write path is
 * built (design.md, Revisions after critique, item 12). Task 6.1 replaces
 * `capture()` below.
 */

export const MAX_CAPTURE_BODY_BYTES = 256 * 1024;
const MAX_TITLE_CHARS = 200;
const SOURCE_TYPE_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export interface CaptureArgs {
  title: string;
  body: string;
  source_type: string;
  source_id?: string;
}

export const CAPTURE_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'A short title naming the item, e.g. "Pricing review call, 14 October".', maxLength: MAX_TITLE_CHARS },
    body: { type: 'string', description: 'The material itself, in its own words, as markdown.' },
    source_type: { type: 'string', description: 'Where it came from, lowercased: email, meeting, web, document, …', pattern: SOURCE_TYPE_RE.source },
    source_id: { type: 'string', description: "The source system's own id for the item (a message id, a meeting id, a URL), when there is one." },
  },
  required: ['title', 'body', 'source_type'],
  additionalProperties: false,
} as const;

export function parseCaptureArgs(args: Record<string, unknown>): CaptureArgs {
  const invalid = (message: string) => new ToolRefusal('mcp.invalid_arguments', message);
  if (typeof args.title !== 'string' || args.title.trim().length === 0) throw invalid('"title" is required.');
  if (args.title.length > MAX_TITLE_CHARS) throw invalid(`"title" is at most ${MAX_TITLE_CHARS} characters.`);
  if (typeof args.body !== 'string' || args.body.trim().length === 0) throw invalid('"body" is required: the material itself.');
  if (Buffer.byteLength(args.body, 'utf8') > MAX_CAPTURE_BODY_BYTES) throw invalid(`"body" is at most ${MAX_CAPTURE_BODY_BYTES} bytes; split the material into separate captures.`);
  if (typeof args.source_type !== 'string' || !SOURCE_TYPE_RE.test(args.source_type)) {
    throw invalid('"source_type" is a lowercased word naming where the material came from, e.g. "email" or "meeting".');
  }
  if (args.source_id !== undefined && args.source_id !== null && (typeof args.source_id !== 'string' || args.source_id.trim().length === 0)) {
    throw invalid('"source_id", when given, is a non-empty string.');
  }
  return {
    title: args.title.trim(),
    body: args.body,
    source_type: args.source_type,
    ...(typeof args.source_id === 'string' ? { source_id: args.source_id.trim() } : {}),
  };
}

export interface CaptureStubResult {
  saved: false;
  inbox_path: string;
  message: string;
}

export async function capture(store: Store, args: CaptureArgs): Promise<CaptureStubResult> {
  return {
    saved: false,
    inbox_path: store.config.ingest.inbox_path,
    message: `Checked "${args.title}" (${args.source_type}); this checkpoint build saves nothing yet. It would land under ${store.config.ingest.inbox_path}.`,
  };
}
