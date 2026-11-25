import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OPENROUTER_FAMILIES, OPENROUTER_FAMILY_MODELS, SECOND_OPINION_TOOL_MODELS } from '../../src/config/defaults.js';
import { SecondOpinionSchema } from '../../src/config/schema.js';
import { criticRoute, lineupCell, lineupCritics, retiredVariables, routeConflicts, TIERS } from '../../src/core/second-opinion/lineup.js';
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

/** ship-default-openrouter-models D9–D11: the route is the configuration's `via`, or the default for the machine. */
describe('route and model resolution for one critic', () => {
  const lineup = (block: Record<string, unknown> = {}) => SecondOpinionSchema.parse(block);
  const KEY = { OPENROUTER_API_KEY: 'sk-or-x' };
  const TOOL = SECOND_OPINION_TOOL_MODELS;

  it('with nothing written, runs each tool where no key is set and leaves grok out', () => {
    expect(lineupCritics({}, lineup())).toEqual(['claude', 'gpt', 'gemini']);
    expect(criticRoute({}, lineup(), 'grok')).toBeNull();
    expect(lineupCell({}, lineup(), 'strong', 'gemini')).toEqual({ route: 'cli', route_source: 'default', model: TOOL.gemini.strong, effort: null, source: 'default' });
    expect(lineupCell({}, lineup(), 'fast', 'gpt')).toEqual({ route: 'cli', route_source: 'default', model: TOOL.gpt.fast, effort: 'low', source: 'default' });
    expect(lineupCell({}, lineup(), 'strong', 'claude')).toMatchObject({ model: TOOL.claude.strong, effort: null });
  });

  it('with nothing written, sends every critic through OpenRouter where a key is set, grok among them', () => {
    expect(lineupCritics(KEY, lineup())).toEqual(['claude', 'gpt', 'gemini', 'grok']);
    for (const critic of ['claude', 'gpt', 'gemini', 'grok'] as const) {
      for (const tier of TIERS) {
        expect(lineupCell(KEY, lineup(), tier, critic)).toEqual({ route: 'openrouter', route_source: 'default', model: OPENROUTER_FAMILY_MODELS[critic][tier], effort: null, source: 'default' });
      }
    }
    // An empty key is unset, which is how a deployment passes one it did not set.
    expect(lineupCritics({ OPENROUTER_API_KEY: '' }, lineup())).toEqual(['claude', 'gpt', 'gemini']);
  });

  it('follows the configuration over the default, in both directions, and leaves out a critic that is off', () => {
    const written = lineup({ claude: { via: 'cli' }, gemini: { via: 'openrouter' }, grok: { via: 'off' } });
    expect(lineupCritics(KEY, written)).toEqual(['claude', 'gpt', 'gemini']);
    expect(lineupCell(KEY, written, 'strong', 'claude')).toMatchObject({ route: 'cli', route_source: 'store', model: TOOL.claude.strong });
    expect(lineupCell(KEY, written, 'strong', 'gpt')).toMatchObject({ route: 'openrouter', route_source: 'default' });
    // Written `openrouter` holds without a key too: the critic is asked and fails naming the key.
    expect(lineupCell({}, written, 'strong', 'gemini')).toMatchObject({ route: 'openrouter', route_source: 'store', model: OPENROUTER_FAMILY_MODELS.gemini.strong });
    expect(lineupCritics({}, lineup({ grok: { via: 'openrouter' } }))).toEqual(['claude', 'gpt', 'gemini', 'grok']);
  });

  it('takes a written model for its tier only, on the route written beside it', () => {
    const routed = lineup({ gemini: { via: 'openrouter', strong: 'vendor/store' } });
    expect(lineupCell({}, routed, 'strong', 'gemini')).toMatchObject({ model: 'vendor/store', source: 'store' });
    expect(lineupCell({}, routed, 'fast', 'gemini')).toMatchObject({ model: OPENROUTER_FAMILY_MODELS.gemini.fast, source: 'default' });
    const tool = lineup({ gemini: { via: 'cli', strong: 'm-alt' } });
    expect(lineupCell(KEY, tool, 'strong', 'gemini')).toEqual({ route: 'cli', route_source: 'store', model: 'm-alt', effort: null, source: 'store' });
  });

  it('takes a tool\'s model and effort from the environment over the configuration, and carries no effort through OpenRouter', () => {
    const tool = lineup({ gpt: { via: 'cli', strong: 'm-alt', effort: 'medium' } });
    expect(lineupCell({}, tool, 'strong', 'gpt')).toMatchObject({ model: 'm-alt', effort: 'medium', source: 'store' });
    expect(lineupCell({ CTXR_SECOND_OPINION_GPT_MODEL: 'm-env', CTXR_SECOND_OPINION_GPT_EFFORT: 'high' }, tool, 'fast', 'gpt')).toMatchObject({ model: 'm-env', effort: 'high', source: 'environment' });
    expect(lineupCell({ CTXR_SECOND_OPINION_GPT_MODEL: '' }, tool, 'strong', 'gpt')).toMatchObject({ model: 'm-alt' });
    expect(lineupCell({ ...KEY, CTXR_SECOND_OPINION_GPT_EFFORT: 'high' }, lineup({ gpt: { effort: 'medium' } }), 'strong', 'gpt')).toMatchObject({ route: 'openrouter', effort: null });
  });

  it('gives every family a <vendor>/<model> slug at every tier, and every tool a model', () => {
    expect(OPENROUTER_FAMILIES).toEqual(['claude', 'gpt', 'gemini', 'grok']);
    for (const family of OPENROUTER_FAMILIES) {
      expect(Object.keys(OPENROUTER_FAMILY_MODELS[family]).sort()).toEqual([...TIERS].sort());
      for (const tier of TIERS) expect(OPENROUTER_FAMILY_MODELS[family][tier], `${family}.${tier}`).toMatch(/^[a-z0-9-]+\/[a-z0-9.-]+$/);
    }
    expect(Object.keys(TOOL)).toEqual(['claude', 'gpt', 'gemini']);
  });

  it('names a tool model set for a critic that goes through OpenRouter, whether written or by default', () => {
    const env = { CTXR_SECOND_OPINION_GEMINI_MODEL: 'm-env', CTXR_SECOND_OPINION_GPT_MODEL: 'm-env' };
    const written = lineup({ gemini: { via: 'openrouter' } });
    expect(routeConflicts(env, written, ['claude', 'gpt', 'gemini'])).toEqual([{ critic: 'gemini', variable: 'CTXR_SECOND_OPINION_GEMINI_MODEL' }]);
    expect(routeConflicts(env, written, ['claude', 'gpt'])).toEqual([]);
    expect(routeConflicts({ ...env, ...KEY }, lineup(), ['claude', 'gpt', 'gemini']).map((v) => v.critic)).toEqual(['gpt', 'gemini']);
    expect(routeConflicts({ CTXR_SECOND_OPINION_GEMINI_MODEL: '' }, written, ['gemini'])).toEqual([]);
  });

  it('names each retired variable that is set, with what replaces it', () => {
    const env = { CTXR_SECOND_OPINION_AGY_MODEL: 'm', CTXR_SECOND_OPINION_CODEX_EFFORT: 'high', CTXR_SECOND_OPINION_GPT_OPENROUTER: 'gpt', CTXR_SECOND_OPINION_AGY_OPENROUTER: 'x/y', CTXR_SECOND_OPINION_CODEX_OPENROUTER: '', CTXR_SECOND_OPINION_GPT_MODEL: 'kept' };
    expect(retiredVariables(env)).toEqual([
      { old: 'CTXR_SECOND_OPINION_AGY_MODEL', now: 'CTXR_SECOND_OPINION_GEMINI_MODEL' },
      { old: 'CTXR_SECOND_OPINION_CODEX_EFFORT', now: 'CTXR_SECOND_OPINION_GPT_EFFORT' },
      { old: 'CTXR_SECOND_OPINION_AGY_OPENROUTER', now: 'second_opinion.gemini.via in the configuration' },
      { old: 'CTXR_SECOND_OPINION_GPT_OPENROUTER', now: 'second_opinion.gpt.via in the configuration' },
    ]);
  });
});
