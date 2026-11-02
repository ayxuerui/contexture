import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';
import { WebhookSecretError } from '../errors.js';

/**
 * context-browsing spec ("Only a signed forge delivery reaches the webhook";
 * "A verified push brings the server up to date at once"),
 * serve-keeps-its-clone-current D7, D9: GitHub push and pull-request
 * deliveries at `POST /hooks/github`, verified against a secret that only the
 * environment provides — never `contexture.yaml`, which is committed. With no
 * secret the route does not exist.
 *
 * A delivery is a hint of which branch changed, nothing more: only the event
 * name and the branch are read from it, and every change is then read from the
 * forge by the store-update run or the preview fetch it starts. The timer and
 * on-demand fetching stay, because GitHub does not retry a failed delivery.
 */
export const WEBHOOK_ROUTE = '/hooks/github';
export const WEBHOOK_SECRET_VAR = 'CONTEXTURE_WEBHOOK_SECRET';
export const WEBHOOK_SECRET_FILE_VAR = 'CONTEXTURE_WEBHOOK_SECRET_FILE';

/** GitHub's payload limit is 25 MB; a push hint is far smaller, and a body past this is refused unread. */
const MAX_BODY_BYTES = 5 * 1024 * 1024;

const set = (value: string | undefined): value is string => value !== undefined && value !== '';

/** The webhook secret from the environment, or null when none is given; refuses both variables, or an unreadable or empty file. */
export async function readWebhookSecret(env: Readonly<Record<string, string | undefined>>): Promise<Buffer | null> {
  const text = env[WEBHOOK_SECRET_VAR];
  const file = env[WEBHOOK_SECRET_FILE_VAR];
  if (set(text) && set(file)) throw new WebhookSecretError(`Both ${WEBHOOK_SECRET_VAR} and ${WEBHOOK_SECRET_FILE_VAR} are set; set one of them.`, [WEBHOOK_SECRET_VAR, WEBHOOK_SECRET_FILE_VAR]);
  if (set(text)) return Buffer.from(text, 'utf8');
  if (!set(file)) return null;
  let contents: string;
  try {
    contents = await readFile(file, 'utf8');
  } catch (err) {
    throw new WebhookSecretError(`${WEBHOOK_SECRET_FILE_VAR} names "${file}", which cannot be read (${(err as NodeJS.ErrnoException).code ?? 'error'}).`, [WEBHOOK_SECRET_FILE_VAR]);
  }
  // A secret file written by `echo` ends in a newline that is not part of the secret.
  const secret = contents.replace(/\r?\n$/, '');
  if (secret === '') throw new WebhookSecretError(`${WEBHOOK_SECRET_FILE_VAR} names "${file}", which is empty.`, [WEBHOOK_SECRET_FILE_VAR]);
  return Buffer.from(secret, 'utf8');
}

/** `X-Hub-Signature-256` against the raw body, compared in constant time. */
export function signatureValid(secret: Buffer, body: Buffer, header: string | string[] | undefined): boolean {
  if (typeof header !== 'string' || !header.startsWith('sha256=')) return false;
  const given = Buffer.from(header.slice('sha256='.length), 'hex');
  const expected = createHmac('sha256', secret).update(body).digest();
  // A length mismatch (including hex that did not decode fully) is a mismatch; timingSafeEqual needs equal lengths.
  if (given.length !== expected.length) return false;
  return timingSafeEqual(given, expected);
}

/** What a verified delivery asks for: a store-update run, a branch fetched for its preview, or nothing. */
export type WebhookHint =
  | { kind: 'default-branch'; repository: string | null }
  | { kind: 'branch'; branch: string; repository: string | null }
  | { kind: 'ignored'; reason: string };

function branchOf(ref: unknown): string | null {
  return typeof ref === 'string' && ref.startsWith('refs/heads/') && ref.length > 'refs/heads/'.length ? ref.slice('refs/heads/'.length) : null;
}

/** Reads only the event, the repository's name (for the log) and the branch from a verified delivery. */
export function hintOf(event: string | string[] | undefined, body: Buffer, defaultBranch: string): WebhookHint {
  if (event === 'ping') return { kind: 'ignored', reason: 'ping' };
  let payload: unknown;
  try {
    payload = JSON.parse(body.toString('utf8'));
  } catch {
    return { kind: 'ignored', reason: 'the body is not JSON' };
  }
  const record = (typeof payload === 'object' && payload !== null ? payload : {}) as Record<string, unknown>;
  const repo = record.repository as { full_name?: unknown } | undefined;
  const repository = typeof repo?.full_name === 'string' ? repo.full_name : null;
  let branch: string | null = null;
  if (event === 'push') branch = branchOf(record.ref);
  else if (event === 'pull_request') {
    const head = (record.pull_request as { head?: { ref?: unknown } } | undefined)?.head?.ref;
    branch = typeof head === 'string' && head !== '' ? head : null;
  } else return { kind: 'ignored', reason: `a ${typeof event === 'string' ? event : 'unnamed'} event` };
  if (branch === null) return { kind: 'ignored', reason: 'no branch named' };
  if (branch === defaultBranch) return { kind: 'default-branch', repository };
  return { kind: 'branch', branch, repository };
}

/** The raw body, or null when it passes the limit. */
export async function readBody(req: IncomingMessage): Promise<Buffer | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) return null;
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}
