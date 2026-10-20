/**
 * approve-from-the-review-page (performance): a small least-recently-used
 * memo for work whose result is fixed by its key — a knowledge delta, a line
 * diff or a page list for one pair of commits never changes, so the second
 * view of a change costs nothing. Holds the promise, so concurrent requests
 * for the same key share one computation; a rejected computation is dropped,
 * so a transient failure is not remembered.
 *
 * Process memory only, and bounded. `ctxr serve` is the one long-running
 * process; every other command computes once and exits.
 */
/**
 * serve-follows-config-changes: a short stamp for one loaded configuration
 * object. What a memo caches is fixed by its commits *and* the configuration
 * it was computed with (taxonomy, publish path, derived paths), and the server
 * now swaps configuration while it runs, so every key carries this stamp. Each
 * reload yields a new object, hence a new stamp, so nothing computed under the
 * old configuration is served under the new one.
 */
const stamps = new WeakMap<object, number>();
let nextStamp = 1;
export function configStamp(config: object): number {
  let stamp = stamps.get(config);
  if (stamp === undefined) {
    stamp = nextStamp++;
    stamps.set(config, stamp);
  }
  return stamp;
}

export interface Memo<V> {
  get(key: string, compute: () => Promise<V>): Promise<V>;
  readonly size: number;
}

export function createMemo<V>(max: number): Memo<V> {
  const entries = new Map<string, Promise<V>>();
  return {
    get(key, compute) {
      const hit = entries.get(key);
      if (hit !== undefined) {
        // Map iteration order is insertion order: re-inserting marks the entry most recently used.
        entries.delete(key);
        entries.set(key, hit);
        return hit;
      }
      const pending = compute();
      entries.set(key, pending);
      pending.catch(() => {
        if (entries.get(key) === pending) entries.delete(key);
      });
      while (entries.size > max) entries.delete(entries.keys().next().value!);
      return pending;
    },
    get size() {
      return entries.size;
    },
  };
}
