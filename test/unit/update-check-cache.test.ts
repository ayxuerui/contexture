import { mkdir, writeFile, chmod, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SHIPPED_DEFAULTS } from '../../src/config/defaults.js';
import { StoreConfigSchema } from '../../src/config/schema.js';
import type { Store } from '../../src/core/store.js';
import { UPDATE_CHECK_ENV_VAR, updateAdvisory, updateCheckCachePath } from '../../src/core/version-check.js';
import { CLI_VERSION } from '../../src/version.js';
import { fakeRegistry, makeFakeEnv } from '../helpers/fake-env.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

const NEWER = '99.0.0';

async function makeStore(overrides: Record<string, unknown> = {}): Promise<Store> {
  const tmp = await makeTmpDir('contexture-update-check-');
  const config = StoreConfigSchema.parse({
    schema_version: 1,
    taxonomy: { profile: 'custom', layers: [] },
    git: { default_branch: 'main' },
    organize: { archive_destination: 'archive/' },
    ...overrides,
  });
  return { root: tmp.root, config } as unknown as Store;
}

async function seedCache(store: Store, entry: unknown): Promise<void> {
  const filePath = updateCheckCachePath(store);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, typeof entry === 'string' ? entry : JSON.stringify(entry), 'utf8');
}

/** cli-contract: the release advisory, its cache, and its off switches. */
describe('cli-contract: the release advisory', () => {
  it('defaults to enabled, with the shipped interval', () => {
    expect(SHIPPED_DEFAULTS.update_check.enabled).toBe(true);
    expect(SHIPPED_DEFAULTS.update_check.ttl_hours).toBeGreaterThan(0);
  });

  it('reports a newer release and caches the answer', async () => {
    const store = await makeStore();
    const registry = fakeRegistry({ kind: 'resolved', version: NEWER });
    const env = makeFakeEnv({ registry: registry.registry });

    const advisory = await updateAdvisory(env, store);
    expect(advisory.findings.map((f) => f.code)).toEqual(['cli.update_available']);
    expect(advisory.notice).toContain(NEWER);
    expect(registry.calls).toHaveLength(1);

    const cached = JSON.parse(await readFile(updateCheckCachePath(store), 'utf8')) as { latest: string };
    expect(cached.latest).toBe(NEWER);
  });

  it('honours a fresh cache without asking the registry', async () => {
    const store = await makeStore();
    const env = makeFakeEnv();
    await seedCache(store, { checked_at: env.now().toISOString(), latest: NEWER });
    const registry = fakeRegistry({ kind: 'resolved', version: CLI_VERSION });
    const withRegistry = makeFakeEnv({ registry: registry.registry, now: env.now });

    const advisory = await updateAdvisory(withRegistry, store);
    expect(registry.calls).toHaveLength(0);
    expect(advisory.findings.map((f) => f.code)).toEqual(['cli.update_available']);
  });

  it('refreshes a cache older than the configured interval', async () => {
    const store = await makeStore({ update_check: { ttl_hours: 1 } });
    const now = new Date('2026-01-01T12:00:00Z');
    await seedCache(store, { checked_at: '2026-01-01T09:00:00Z', latest: NEWER });
    const registry = fakeRegistry({ kind: 'resolved', version: CLI_VERSION });

    const advisory = await updateAdvisory(makeFakeEnv({ registry: registry.registry, now: () => now }), store);
    expect(registry.calls).toHaveLength(1);
    expect(advisory.findings).toEqual([]);
  });

  it('treats a cache stamped in the future as stale rather than pinning the answer', async () => {
    const store = await makeStore();
    const now = new Date('2026-01-01T00:00:00Z');
    await seedCache(store, { checked_at: '2030-01-01T00:00:00Z', latest: NEWER });
    const registry = fakeRegistry({ kind: 'resolved', version: CLI_VERSION });

    await updateAdvisory(makeFakeEnv({ registry: registry.registry, now: () => now }), store);
    expect(registry.calls).toHaveLength(1);
  });

  it.each([
    ['a corrupt cache file', 'not json at all'],
    ['a cache entry missing its fields', { latest: 42 }],
  ])('treats %s as a miss, not an error', async (_label, entry) => {
    const store = await makeStore();
    await seedCache(store, entry);
    const registry = fakeRegistry({ kind: 'resolved', version: NEWER });
    const advisory = await updateAdvisory(makeFakeEnv({ registry: registry.registry }), store);
    expect(registry.calls).toHaveLength(1);
    expect(advisory.findings.map((f) => f.code)).toEqual(['cli.update_available']);
  });

  it('still reports the advisory when the cache cannot be written', async () => {
    const store = await makeStore();
    const cacheDir = path.dirname(updateCheckCachePath(store));
    await mkdir(cacheDir, { recursive: true });
    await chmod(cacheDir, 0o500); // readable, not writable
    try {
      const advisory = await updateAdvisory(
        makeFakeEnv({ registry: fakeRegistry({ kind: 'resolved', version: NEWER }).registry }),
        store,
      );
      expect(advisory.findings.map((f) => f.code)).toEqual(['cli.update_available']);
    } finally {
      await chmod(cacheDir, 0o700);
    }
  });

  it('makes no request at all when disabled in configuration', async () => {
    const store = await makeStore({ update_check: { enabled: false } });
    const registry = fakeRegistry({ kind: 'resolved', version: NEWER });
    const advisory = await updateAdvisory(makeFakeEnv({ registry: registry.registry }), store);
    expect(registry.calls).toEqual([]);
    expect(advisory.findings).toEqual([]);
    expect(advisory.notice).toBeUndefined();
  });

  it.each(['0', 'false', 'no', 'off', ''])('makes no request when %s suppresses it in the environment', async (value) => {
    const store = await makeStore();
    const registry = fakeRegistry({ kind: 'resolved', version: NEWER });
    const env = makeFakeEnv({ registry: registry.registry, env: { [UPDATE_CHECK_ENV_VAR]: value } });
    const advisory = await updateAdvisory(env, store);
    expect(registry.calls).toEqual([]);
    expect(advisory.findings).toEqual([]);
  });

  it('is unaffected by an unrelated value in that variable', async () => {
    const store = await makeStore();
    const registry = fakeRegistry({ kind: 'resolved', version: NEWER });
    const env = makeFakeEnv({ registry: registry.registry, env: { [UPDATE_CHECK_ENV_VAR]: '1' } });
    await updateAdvisory(env, store);
    expect(registry.calls).toHaveLength(1);
  });

  it('reports nothing when the installed version is current', async () => {
    const store = await makeStore();
    const env = makeFakeEnv({ registry: fakeRegistry({ kind: 'resolved', version: CLI_VERSION }).registry });
    expect((await updateAdvisory(env, store)).findings).toEqual([]);
  });

  it('reports nothing when the installed version is ahead of the registry', async () => {
    const store = await makeStore();
    const env = makeFakeEnv({ registry: fakeRegistry({ kind: 'resolved', version: '0.0.1' }).registry });
    expect((await updateAdvisory(env, store)).findings).toEqual([]);
  });
});
