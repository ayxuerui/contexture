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
