import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLander, type ChildLike, type SpawnLike } from '../../src/core/approval/lander.js';

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

function harness() {
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
  const lander = createLander({ command: ['/usr/bin/node', '/opt/ctxr/bin.js'], root: '/store', env: {}, output, spawn, sweepMs: 300_000, firstSweepMs: 10_000 });
  const running = () => children.filter((c) => c.listenerCount('close') > 0);
  return { lander, children, calls, out, running };
}

describe('the lander', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('runs ctxr land --pending for the store, with output prefixed', async () => {
    const h = harness();
    h.lander.trigger();
    expect(h.calls).toEqual([{ command: '/usr/bin/node', args: ['/opt/ctxr/bin.js', 'land', '--pending', '--root', '/store'] }]);
    h.children[0]!.stdout.write('No approved session pull request to land.\n');
    h.children[0]!.finish(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.out).toContain('land: No approved session pull request to land.\n');
    await h.lander.stop();
  });

  it('never overlaps runs, and coalesces any number of triggers during a run into one more', async () => {
    const h = harness();
    h.lander.trigger();
    h.lander.trigger();
    h.lander.trigger();
    h.lander.trigger();
    expect(h.calls).toHaveLength(1);
    h.children[0]!.finish(0);
    expect(h.calls).toHaveLength(2);
    expect(h.running()).toHaveLength(1);
    h.children[1]!.finish(0);
    expect(h.calls).toHaveLength(2);
    await h.lander.stop();
  });

  it('sweeps 10 s after start and every 5 minutes after that', async () => {
    const h = harness();
    await vi.advanceTimersByTimeAsync(9_999);
    expect(h.calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.calls).toHaveLength(1);
    h.children[0]!.finish(0);
    await vi.advanceTimersByTimeAsync(300_000);
    expect(h.calls).toHaveLength(2);
    await h.lander.stop();
  });

  it('reports a failed run and keeps going', async () => {
    const h = harness();
    h.lander.trigger();
    h.children[0]!.finish(3);
    expect(h.out).toContain('land: the landing run exited 3\n');
    h.lander.trigger();
    expect(h.calls).toHaveLength(2);
    await h.lander.stop();
  });

  it('stop kills a run in progress, drops a pending one, and ends the sweep', async () => {
    const h = harness();
    h.lander.trigger();
    h.lander.trigger();
    await h.lander.stop();
    expect(h.children[0]!.killed).toBe('SIGTERM');
    expect(h.calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(600_000);
    h.lander.trigger();
    expect(h.calls).toHaveLength(1);
  });
});
