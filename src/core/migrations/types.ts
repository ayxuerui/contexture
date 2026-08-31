import type { Store } from '../store.js';

/** One concrete, reportable change a migration made (or would make). */
export interface MigrationDelta {
  /** The file touched, relative to the store root — 'contexture.yaml' for the config itself. */
  path: string;
  description: string;
}

/**
 * store-lifecycle spec: "named, dry-runnable, resumable." A migration's
 * `plan()` and `apply()` both re-derive what still needs doing from the
 * store's CURRENT on-disk state, never from separately-tracked progress —
 * so re-running `apply()` after an interruption naturally skips whatever
 * was already done (it no longer matches the "needs migrating" condition)
 * and finishes the rest, with no separate progress file to go stale or
 * corrupt.
 */
export interface Migration {
  id: string;
  fromVersion: number;
  toVersion: number;
  description: string;
  /** Computes exactly what apply() would change, without writing anything. */
  plan(store: Store): Promise<MigrationDelta[]>;
  /** Applies only what plan() would still report as pending; returns what it actually changed. */
  apply(store: Store): Promise<MigrationDelta[]>;
}
