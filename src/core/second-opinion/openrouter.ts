import { firstLines } from './launch.js';
import type { SourceEnv } from './environment.js';

/**
 * second-opinion-through-openrouter D3–D5, D7: the one place a critic is asked
 * over HTTP instead of through its model CLI. One `POST` from this process:
 * the slug, the critic's prompt as the only message, no tool definition, and
 * a provider rule that declines data collection. Nothing about the store, its
 * operator or the machine goes in a header or a field, so the optional
 * `HTTP-Referer` and `X-OpenRouter-Title` headers are never sent.
 *
 * Checked against OpenRouter's documentation on 2026-11-20 (api-reference
 * overview, chat-completion, errors, and features/provider-routing):
 *  - `POST <base>/chat/completions`, `Authorization: Bearer <key>`.
 *  - The answer is `choices[0].message.content`; top-level `model` names the
 *    model that answered.
 *  - An error body is `{ error: { code, message } }`. One can arrive with
 *    status 200, at the top level or on the first choice, when a provider
 *    fails after the headers went out, so both are read on every response.
 *  - `provider.data_collection` is `"allow"` (the default) or `"deny"`, which
 *    routes only to providers that do not collect the prompt. The status for
 *    "no provider meets the rule" is not documented exactly (503 and 404 both
 *    appear), so it is reported in OpenRouter's own words and not matched.
 *
 * The runtime's `fetch` ignores `HTTPS_PROXY` unless Node is started with
 * `NODE_USE_ENV_PROXY=1` (checked on Node 26.12 with a local stub proxy,
 * 2026-11-21). A model CLI behind the same proxy is unaffected by that.
 *
 * The key is read by the caller at request time, placed in the header here
 * and nowhere else, and scrubbed from any cause before it is returned (D4).
 */
export const OPENROUTER_KEY_VARIABLE = 'OPENROUTER_API_KEY';
export const OPENROUTER_URL_VARIABLE = 'CTXR_SECOND_OPINION_OPENROUTER_URL';
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

/** OpenRouter's own address, or the one the environment names (D7). Never read from the store's configuration. */
export function openRouterBase(source: SourceEnv): string {
  return (source[OPENROUTER_URL_VARIABLE] || OPENROUTER_BASE).replace(/\/+$/, '');
}

export interface OpenRouterResult {
  ok: boolean;
  /** The answer's text; empty on failure. */
  text: string;
  /** The model OpenRouter says answered, where it says. */
  model: string | null;
  /** The response body as received, for the raw file. Never the request. */
  raw: string;
  cause?: string;
}

export interface OpenRouterRequest {
  base: string;
  /** Undefined or empty when the environment sets none: the critic then fails naming the variable, and no request is made. */
  key: string | undefined;
  slug: string;
  prompt: string;
  timeoutSec: number;
}

type ErrorBody = { message?: unknown; code?: unknown };
interface ResponseBody {
  model?: unknown;
  error?: ErrorBody;
  choices?: Array<{ message?: { content?: unknown }; error?: ErrorBody }>;
}

const errorText = (error: ErrorBody | undefined): string | null => {
  if (error === undefined || error === null) return null;
  return typeof error.message === 'string' && error.message.trim() ? error.message : `code ${String(error.code ?? 'unknown')}`;
};

/** Asks OpenRouter once. Resolves with the answer or, on failure, why; never rejects and never retries. */
export async function askOpenRouter(request: OpenRouterRequest): Promise<OpenRouterResult> {
  const { key } = request;
  if (!key) return { ok: false, text: '', model: null, raw: '', cause: `${OPENROUTER_KEY_VARIABLE} is not set` };
  const scrub = (text: string): string => text.split(key).join('[key withheld]');
  const failed = (cause: string, raw = '', model: string | null = null): OpenRouterResult => ({ ok: false, text: '', model, raw: scrub(raw), cause: scrub(cause) });

  let status: number;
  let raw: string;
  try {
    const response = await fetch(`${request.base}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.slug,
        messages: [{ role: 'user', content: request.prompt }],
        stream: false,
        provider: { data_collection: 'deny' },
      }),
      redirect: 'error',
      signal: AbortSignal.timeout(request.timeoutSec * 1000),
    });
    status = response.status;
    raw = await response.text();
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    if (name === 'TimeoutError' || name === 'AbortError') return failed(`timed out after ${request.timeoutSec}s`);
    const inner = err instanceof Error && err.cause instanceof Error ? err.cause.message : err instanceof Error ? err.message : String(err);
    return failed(`could not reach OpenRouter: ${firstLines(inner, 2)}`);
  }

  let body: ResponseBody | null = null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) body = parsed as ResponseBody;
  } catch {
    // not JSON: reported below by status, or as unreadable
  }
  const model = typeof body?.model === 'string' && body.model ? body.model : null;
  if (status < 200 || status >= 300) return failed(`OpenRouter answered ${status}: ${firstLines(errorText(body?.error) ?? raw, 3) || 'no message'}`, raw, model);
  if (body === null) return failed('unreadable response', raw);
  const reported = errorText(body.error) ?? errorText(body.choices?.[0]?.error);
  if (reported !== null) return failed(`OpenRouter reported an error: ${firstLines(reported, 3)}`, raw, model);
  const content = body.choices?.[0]?.message?.content;
  if (!Array.isArray(body.choices) || body.choices.length === 0 || (content !== null && content !== undefined && typeof content !== 'string')) return failed('unreadable response', raw, model);
  const text = typeof content === 'string' ? content.trim() : '';
  if (!text) return failed('empty answer', raw, model);
  return { ok: true, text, model, raw: scrub(raw) };
}
