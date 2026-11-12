import { describe, expect, it } from 'vitest';
import type { StoreConfig } from '../../src/config/schema.js';
import type { ApprovalServer } from '../../src/core/browse/approve.js';
import { createServingState, type FileIdentity } from '../../src/core/browse/serving-state.js';

/** A config is opaque here; the holder compares only change_approval and serve.base_url. */
function config(extra: Record<string, unknown> = {}): StoreConfig {
  return { schema_version: 10, ...extra } as unknown as StoreConfig;
}

function harness(initial: StoreConfig) {
  let id: FileIdentity = { mtimeMs: 1, size: 10, dev: 1, ino: 1 };
  let next: StoreConfig | Error = initial;
  let clock = 0;
  let loads = 0;
  let builds = 0;
  let buildResult: () => ApprovalServer | null = () => null;
  const logs: string[] = [];
  return {
    setFile(change: Partial<FileIdentity>, content: StoreConfig | Error) {
      id = { ...id, ...change };
      next = content;
    },
    advance(ms: number) {
      clock += ms;
    },
    buildWith(f: () => ApprovalServer | null) {
      buildResult = f;
    },
    counts: () => ({ loads, builds }),
    logs,
    make: () =>
      createServingState({
        initial: { root: '/store', config: initial },
        initialApproval: null,
        identify: async () => id,
        load: async () => {
          loads += 1;
          if (next instanceof Error) throw next;
          return next;
        },
        // Like the real builder: no block, no surface.
        buildApproval: async (store) => {
          builds += 1;
          return store.config.change_approval === undefined ? null : buildResult();
        },
        log: (line) => logs.push(line),
        now: () => clock,
        retryMs: 30_000,
      }),
  };
}

const APPROVAL = { serve: { base_url: 'https://ctx-a.example.test' }, change_approval: { recording_login: 'ctx-approvals' } };

describe('the serving-state holder', () => {
  it('does not read an unchanged file again', async () => {
    const h = harness(config());
    const holder = await h.make();
    for (let i = 0; i < 10; i++) await holder.current();
    expect(h.counts().loads).toBe(0);
  });

  it('reloads a changed file, and detects a rename that kept the size and time', async () => {
    const h = harness(config());
    const holder = await h.make();
    const changed = config({ marker: 'b' });
    h.setFile({ ino: 2 }, changed);
    expect((await holder.current()).store.config).toBe(changed);
    expect(h.counts().loads).toBe(1);
  });

  it('keeps the last good configuration when a change does not load, logs once, and takes a later fix', async () => {
    const first = config({ marker: 'a' });
    const h = harness(first);
    const holder = await h.make();
    h.setFile({ mtimeMs: 2 }, new Error('taxonomy: required'));
    expect((await holder.current()).store.config).toBe(first);
    expect((await holder.current()).store.config).toBe(first);
    expect(h.logs).toHaveLength(1);
    expect(h.logs[0]).toContain('does not load (taxonomy: required)');
    const fixed = config({ marker: 'c' });
    h.setFile({ mtimeMs: 3 }, fixed);
    expect((await holder.current()).store.config).toBe(fixed);
    expect(h.logs).toHaveLength(1);
  });

  it('rebuilds the approval surface only when its own inputs change', async () => {
    const h = harness(config());
    const holder = await h.make();
    const surface = {} as ApprovalServer;
    h.buildWith(() => surface);
    h.setFile({ mtimeMs: 2 }, config(APPROVAL));
    expect((await holder.current()).approval).toBe(surface);
    h.setFile({ mtimeMs: 3 }, config({ ...APPROVAL, taxonomy: 'other' }));
    expect((await holder.current()).approval).toBe(surface);
    expect(h.counts().builds).toBe(1);
    h.setFile({ mtimeMs: 4 }, config());
    expect((await holder.current()).approval).toBeNull();
    expect(h.counts().builds).toBe(2);
  });

  it('turns a failed build into approvalError, and retries no more often than the interval', async () => {
    const h = harness(config());
    const holder = await h.make();
    h.buildWith(() => {
      throw new Error('recording_login is "ctx-approvals", but the credential authenticates as "ctx-agent"');
    });
    h.setFile({ mtimeMs: 2 }, config(APPROVAL));
    const failed = await holder.current();
    expect(failed.approval).toBeNull();
    expect(failed.approvalError).toContain('ctx-agent');
    h.advance(10_000);
    await holder.current();
    expect(h.counts().builds).toBe(1);
    const surface = {} as ApprovalServer;
    h.buildWith(() => surface);
    h.advance(21_000);
    const recovered = await holder.current();
    expect(h.counts().builds).toBe(2);
    expect(recovered).toMatchObject({ approval: surface, approvalError: null });
  });

  it('shares one reload between concurrent requests', async () => {
    const h = harness(config());
    const holder = await h.make();
    h.setFile({ mtimeMs: 2 }, config({ marker: 'b' }));
    const states = await Promise.all([holder.current(), holder.current(), holder.current()]);
    expect(h.counts().loads).toBe(1);
    expect(new Set(states.map((s) => s.store.config)).size).toBe(1);
  });
});
