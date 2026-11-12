import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStoreUpdateRunner, type ChildLike, type SpawnLike, type StoreUpdateKind } from '../../src/core/store-update-runner.js';
import { storeUpdateSettings } from '../../src/commands/serve.js';
import type { StoreConfig } from '../../src/config/schema.js';

class FakeChild extends EventEmitter implements ChildLike {
  stdout = new PassThrough();
  stderr = new PassThrough();
  killed: NodeJS.Signals | null = null;
  kill(signal: NodeJS.Signals = 'SIGTERM'): boolean {
    this.killed = signal;
    this.finish(null);
    return true;
  }
  finish(code: number | null): void {
    this.stdout.end();
    this.stderr.end();
    this.emit('close', code);
  }
}

function harness(kind: StoreUpdateKind = 'land', intervalMs = 300_000) {
  const children: FakeChild[] = [];
  const calls: { command: string; args: string[] }[] = [];
  const spawn: SpawnLike = (command, args) => {
    calls.push({ command, args });
    const child = new FakeChild();
    children.push(child);
    return child;
  };
  const out: string[] = [];
  const output = { write: (s: string) => (out.push(s), true) } as unknown as NodeJS.WritableStream;
  const runner = createStoreUpdateRunner({ command: ['/usr/bin/node', '/opt/ctxr/bin.js'], root: '/store', env: {}, output, spawn, kind, intervalMs, firstRunMs: 10_000 });
  const running = () => children.filter((c) => c.listenerCount('close') > 0);
  return { runner, children, calls, out, running };
}

describe('the store-update runner', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('runs ctxr land --pending for the store when landing is on, with output prefixed land:', async () => {
    const h = harness('land');
    h.runner.trigger();
    expect(h.calls).toEqual([{ command: '/usr/bin/node', args: ['/opt/ctxr/bin.js', 'land', '--pending', '--root', '/store'] }]);
    h.children[0]!.stdout.write('No approved session pull request to land.\n');
    h.children[0]!.finish(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.out).toContain('land: No approved session pull request to land.\n');
    await h.runner.stop();
  });

  it('runs ctxr sync otherwise, with output prefixed sync:', async () => {
    const h = harness('sync');
    h.runner.trigger();
    expect(h.calls).toEqual([{ command: '/usr/bin/node', args: ['/opt/ctxr/bin.js', 'sync', '--root', '/store'] }]);
    h.children[0]!.stderr.write('canonical clone synced 1111111..2222222\n');
    h.children[0]!.finish(2);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.out).toContain('sync: canonical clone synced 1111111..2222222\n');
    expect(h.out).toContain('sync: the sync run exited 2\n');
    expect(h.out.some((line) => line.startsWith('land:'))).toBe(false);
    await h.runner.stop();
  });

  it('never overlaps runs, and coalesces any number of triggers during a run into one more', async () => {
    const h = harness();
    h.runner.trigger();
    h.runner.trigger();
    h.runner.trigger();
    h.runner.trigger();
    expect(h.calls).toHaveLength(1);
    h.children[0]!.finish(0);
    expect(h.calls).toHaveLength(2);
    expect(h.running()).toHaveLength(1);
    h.children[1]!.finish(0);
    expect(h.calls).toHaveLength(2);
    await h.runner.stop();
  });

  it('a timed run due during a run starts after it ends, never beside it', async () => {
    const h = harness('sync', 60_000);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.calls).toHaveLength(1);
    expect(h.running()).toHaveLength(1);
    h.children[0]!.finish(0);
    expect(h.calls).toHaveLength(2);
    await h.runner.stop();
  });

  it('runs 10 s after start and every interval after that', async () => {
    const h = harness('land', 300_000);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(h.calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.calls).toHaveLength(1);
    h.children[0]!.finish(0);
    await vi.advanceTimersByTimeAsync(300_000);
    expect(h.calls).toHaveLength(2);
    await h.runner.stop();
  });

  it('follows a reload: the next run takes the new kind, and a new interval counts from the reload', async () => {
    const h = harness('land', 300_000);
    await vi.advanceTimersByTimeAsync(10_000);
    h.children[0]!.finish(0);
    h.runner.configure({ kind: 'sync', intervalMs: 120_000 });
    await vi.advanceTimersByTimeAsync(119_999);
    expect(h.calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.calls.map((c) => c.args[1])).toEqual(['land', 'sync']);
    h.children[1]!.finish(0);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(h.calls).toHaveLength(3);
    await h.runner.stop();
  });

  it('reports a failed run and keeps going', async () => {
    const h = harness();
    h.runner.trigger();
    h.children[0]!.finish(3);
    expect(h.out).toContain('land: the landing run exited 3\n');
    h.runner.trigger();
    expect(h.calls).toHaveLength(2);
    await h.runner.stop();
  });

  it('stop kills a run in progress, drops a pending one, and ends the timer', async () => {
    const h = harness();
    h.runner.trigger();
    h.runner.trigger();
    await h.runner.stop();
    expect(h.children[0]!.killed).toBe('SIGTERM');
    expect(h.calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(600_000);
    h.runner.trigger();
    expect(h.calls).toHaveLength(1);
  });
});

describe("serve's store-update settings", () => {
  const config = (extra: Partial<StoreConfig>): StoreConfig => extra as StoreConfig;
  const approval = { recording_login: 'ctx-approvals' } as NonNullable<StoreConfig['change_approval']>;

  it('lands while change approval is declared without land: manual, and syncs otherwise', () => {
    expect(storeUpdateSettings(config({ change_approval: approval })).kind).toBe('land');
    expect(storeUpdateSettings(config({ change_approval: { ...approval, land: 'auto' } })).kind).toBe('land');
    expect(storeUpdateSettings(config({ change_approval: { ...approval, land: 'manual' } })).kind).toBe('sync');
    expect(storeUpdateSettings(config({})).kind).toBe('sync');
  });

  it('runs every serve.sync_minutes minutes, five when absent', () => {
    expect(storeUpdateSettings(config({})).intervalMs).toBe(5 * 60_000);
    expect(storeUpdateSettings(config({ serve: { sync_minutes: 2 } })).intervalMs).toBe(2 * 60_000);
  });
});
