import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SHIPPED_DEFAULTS } from '../../src/config/defaults.js';
import { SecondOpinionSchema } from '../../src/config/schema.js';
import { lineupCell, routeConflicts } from '../../src/core/second-opinion/lineup.js';
import { askOpenRouter, openRouterBase, OPENROUTER_KEY_VARIABLE } from '../../src/core/second-opinion/openrouter.js';
import { startOpenRouterStub, STUB_KEY, type OpenRouterStub } from '../helpers/openrouter-stub.js';
import { makeTmpDir, type TmpDir } from '../helpers/tmp-store.js';

/**
 * second-opinion-through-openrouter D3–D5, D7: the request itself, against a
 * stub endpoint that records what it received. The command-level scenarios
 * (routing, the manifest, the key's reach) are in second-opinion.test.ts.
 */
let tmp: TmpDir;
let stub: OpenRouterStub;

beforeEach(async () => {
  tmp = await makeTmpDir('second-opinion-openrouter-');
  stub = await startOpenRouterStub(tmp.root);
});
afterEach(async () => {
  stub.stop();
  await tmp.cleanup();
});

const ask = (over: Partial<Parameters<typeof askOpenRouter>[0]> = {}) => askOpenRouter({ base: stub.url, key: STUB_KEY, slug: 'vendor/model-x', prompt: 'the prompt', timeoutSec: 10, ...over });

describe('the request', () => {
  it('carries the slug, one user message, no tools, and the refusal of data collection', async () => {
    stub.behave({ kind: 'ok', text: '  the answer \n', model: 'vendor/model-x-20260101' });
    const r = await ask();
    expect(r).toMatchObject({ ok: true, text: 'the answer', model: 'vendor/model-x-20260101' });
    const [request, ...rest] = stub.requests();
    expect(rest).toEqual([]);
    expect(request!.method).toBe('POST');
    expect(request!.url).toBe('/api/v1/chat/completions');
    expect(request!.body).toEqual({ model: 'vendor/model-x', messages: [{ role: 'user', content: 'the prompt' }], stream: false, provider: { data_collection: 'deny' } });
    expect(request!.headers.authorization).toBe(`Bearer ${STUB_KEY}`);
  });

  it('sends no header that names the caller', async () => {
    stub.behave({ kind: 'ok', text: 'x' });
    await ask();
    const headers = Object.keys(stub.requests()[0]!.headers);
    for (const name of ['http-referer', 'referer', 'x-title', 'x-openrouter-title', 'x-openrouter-categories']) expect(headers).not.toContain(name);
  });

  it('goes to the address the environment names, and to OpenRouter otherwise', () => {
    expect(openRouterBase({})).toBe('https://openrouter.ai/api/v1');
    expect(openRouterBase({ CTXR_SECOND_OPINION_OPENROUTER_URL: '' })).toBe('https://openrouter.ai/api/v1');
    expect(openRouterBase({ CTXR_SECOND_OPINION_OPENROUTER_URL: 'http://127.0.0.1:9/api/v1/' })).toBe('http://127.0.0.1:9/api/v1');
  });
});

describe('failure is a cause, never a throw and never the key', () => {
  it('a missing key makes no request and names the variable', async () => {
    for (const key of [undefined, '']) {
      const r = await ask({ key });
      expect(r).toMatchObject({ ok: false, cause: `${OPENROUTER_KEY_VARIABLE} is not set` });
    }
    expect(stub.requests()).toEqual([]);
  });

  it('an error status carries OpenRouter\'s own message', async () => {
    stub.behave({ kind: 'status', code: 404, message: 'No endpoints found for vendor/model-gone.' });
    const r = await ask({ slug: 'vendor/model-gone' });
    expect(r.ok).toBe(false);
    expect(r.cause).toBe('OpenRouter answered 404: No endpoints found for vendor/model-gone.');
    expect(stub.requests()).toHaveLength(1);
  });

  it('an error inside a 200 is still an error, at the top level or on the choice', async () => {
    for (const onChoice of [false, true]) {
      stub.behave({ kind: 'error200', message: 'provider returned an error', onChoice });
      const r = await ask();
      expect(r, `onChoice=${onChoice}`).toMatchObject({ ok: false, cause: 'OpenRouter reported an error: provider returned an error' });
    }
  });

  it('a hung response fails at the timeout', async () => {
    stub.behave({ kind: 'hang' });
    const started = Date.now();
    const r = await ask({ timeoutSec: 1 });
    expect(r).toMatchObject({ ok: false, cause: 'timed out after 1s' });
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it('a refused connection says OpenRouter could not be reached', async () => {
    const r = await ask({ base: 'http://127.0.0.1:1/api/v1' });
    expect(r.ok).toBe(false);
    expect(r.cause).toMatch(/^could not reach OpenRouter: /);
  });

  it('an empty answer, a body that is not JSON, and a body with no choices each fail distinctly', async () => {
    stub.behave({ kind: 'ok', text: '   ' });
    expect((await ask()).cause).toBe('empty answer');
    stub.behave({ kind: 'garbage' });
    expect((await ask()).cause).toBe('unreadable response');
    stub.behave({ kind: 'nochoices' });
    expect((await ask()).cause).toBe('unreadable response');
  });

  it('scrubs the key from a cause and from the raw body, should the endpoint ever echo it', async () => {
    stub.behave({ kind: 'status', code: 401, message: `Invalid credentials: ${STUB_KEY}` });
    const r = await ask();
    expect(r.cause).not.toContain(STUB_KEY);
    expect(r.raw).not.toContain(STUB_KEY);
    expect(r.cause).toContain('Invalid credentials');
  });
});

/** second-opinion-through-openrouter D2: one entry resolves to exactly one route, in a fixed order. */
describe('route resolution for one entry', () => {
  const lineup = (agy: Record<string, string> = {}) => SecondOpinionSchema.parse({ strong: { agy, codex: { effort: 'medium' } } });
  const AGY_DEFAULT = SHIPPED_DEFAULTS.second_opinion.strong.agy.model;

  it('follows the order: environment slug, environment CLI model, store slug, store or shipped CLI model', () => {
    const withSlug = lineup({ openrouter: 'vendor/store' });
    expect(lineupCell({ CTXR_SECOND_OPINION_AGY_OPENROUTER: 'vendor/env' }, withSlug, 'strong', 'agy')).toEqual({ route: 'openrouter', model: 'vendor/env', effort: null, source: 'environment' });
    expect(lineupCell({ CTXR_SECOND_OPINION_AGY_MODEL: 'm-env' }, withSlug, 'strong', 'agy')).toEqual({ route: 'cli', model: 'm-env', effort: null, source: 'environment' });
    expect(lineupCell({}, withSlug, 'strong', 'agy')).toEqual({ route: 'openrouter', model: 'vendor/store', effort: null, source: 'store' });
    expect(lineupCell({}, lineup({ model: 'm-alt' }), 'strong', 'agy')).toEqual({ route: 'cli', model: 'm-alt', effort: null, source: 'store' });
    expect(lineupCell({}, lineup(), 'strong', 'agy')).toEqual({ route: 'cli', model: AGY_DEFAULT, effort: null, source: 'default' });
  });

  it('counts an empty variable as unset, and leaves the other tier alone', () => {
    const withSlug = lineup({ openrouter: 'vendor/store' });
    expect(lineupCell({ CTXR_SECOND_OPINION_AGY_OPENROUTER: '', CTXR_SECOND_OPINION_AGY_MODEL: '' }, withSlug, 'strong', 'agy')).toMatchObject({ route: 'openrouter', model: 'vendor/store' });
    expect(lineupCell({}, withSlug, 'fast', 'agy')).toMatchObject({ route: 'cli', source: 'default' });
    expect(lineupCell({ CTXR_SECOND_OPINION_AGY_OPENROUTER: 'vendor/env' }, withSlug, 'fast', 'agy')).toMatchObject({ route: 'openrouter', model: 'vendor/env' });
  });

  it('carries no effort on the OpenRouter route, from the store or the environment', () => {
    const cell = lineupCell({ CTXR_SECOND_OPINION_CODEX_OPENROUTER: 'vendor/env', CTXR_SECOND_OPINION_CODEX_EFFORT: 'high' }, lineup(), 'strong', 'codex');
    expect(cell).toEqual({ route: 'openrouter', model: 'vendor/env', effort: null, source: 'environment' });
    expect(lineupCell({}, lineup(), 'strong', 'codex')).toMatchObject({ route: 'cli', effort: 'medium' });
  });

  it('names the entries whose route the environment sets twice', () => {
    const both = { CTXR_SECOND_OPINION_AGY_OPENROUTER: 'vendor/env', CTXR_SECOND_OPINION_AGY_MODEL: 'm-env', CTXR_SECOND_OPINION_CODEX_MODEL: 'm-env' };
    expect(routeConflicts(both, ['claude', 'codex', 'agy'])).toEqual([{ openrouter: 'CTXR_SECOND_OPINION_AGY_OPENROUTER', model: 'CTXR_SECOND_OPINION_AGY_MODEL' }]);
    expect(routeConflicts(both, ['claude', 'codex'])).toEqual([]);
  });
});
