import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  REGISTRY_TIMEOUT_MS,
  createFetchRegistryClient,
  registryUrlFor,
} from '../../src/core/registry.js';

/**
 * cli-contract: the advisory never fails the command carrying it. The client is
 * where that starts — it converts every failure into a value, so nothing can
 * escape into runCommand and be mapped to the internal-error code (design.md D5).
 */
describe('cli-contract: the release registry client never throws', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(impl: (input: unknown, init?: unknown) => Promise<unknown>): void {
    vi.stubGlobal('fetch', vi.fn(impl));
  }

  it('resolves the published version from a successful answer', async () => {
    stubFetch(async () => ({ ok: true, status: 200, json: async () => ({ version: '0.9.1' }) }));
    const client = createFetchRegistryClient();
    await expect(client.latestVersion('ctxr-cli')).resolves.toEqual({
      kind: 'resolved',
      version: '0.9.1',
    });
  });

  it.each([
    [
      'a network failure',
      async () => {
        throw new Error('getaddrinfo ENOTFOUND registry.npmjs.org');
      },
      'ENOTFOUND',
    ],
    [
      'a timeout',
      async () => {
        throw Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' });
      },
      `${REGISTRY_TIMEOUT_MS}ms`,
    ],
    [
      'a non-success status',
      async () => ({ ok: false, status: 503, json: async () => ({}) }),
      '503',
    ],
    [
      'an unparseable body',
      async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON');
        },
      }),
      'Unexpected token',
    ],
    [
      'an answer carrying no version',
      async () => ({ ok: true, status: 200, json: async () => ({ name: 'ctxr-cli' }) }),
      'no version',
    ],
    [
      'an answer whose version is not a string',
      async () => ({ ok: true, status: 200, json: async () => ({ version: 42 }) }),
      'no version',
    ],
    ['a null body', async () => ({ ok: true, status: 200, json: async () => null }), 'no version'],
  ])('turns %s into an undetermined result rather than throwing', async (_label, impl, expected) => {
    stubFetch(impl as (input: unknown, init?: unknown) => Promise<unknown>);
    const client = createFetchRegistryClient();
    const result = await client.latestVersion('ctxr-cli');
    expect(result.kind).toBe('undetermined');
    if (result.kind !== 'undetermined') throw new Error('unreachable');
    expect(result.reason).toContain(expected);
  });

  it('requests the per-version endpoint under a bounded timeout', async () => {
    const seen: { url?: unknown; init?: unknown } = {};
    stubFetch(async (url, init) => {
      seen.url = url;
      seen.init = init;
      return { ok: true, status: 200, json: async () => ({ version: '0.9.1' }) };
    });
    await createFetchRegistryClient().latestVersion('ctxr-cli');
    expect(seen.url).toBe(registryUrlFor('ctxr-cli'));
    expect(String(seen.url)).toContain('/ctxr-cli/latest');
    expect((seen.init as { signal?: AbortSignal }).signal).toBeInstanceOf(AbortSignal);
  });
});
