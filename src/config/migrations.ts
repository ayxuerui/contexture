import type { Document } from 'yaml';
import { SUPPORTED_SCHEMA_VERSION } from './schema.js';

/**
 * migrate-stores-on-update: one step carries a store's configuration from
 * schema version `from` to `from + 1`.
 *
 * A step works on the PARSED DOCUMENT, never on the typed configuration and
 * never on the plain value `parse` returns (design D1). That is what lets the
 * typed schema keep exactly one spelling per key — the objection that retired
 * the previous migration mechanism was the leniency it forced onto
 * `StoreConfigSchema`, so a stale config could be read by the migration about
 * to rewrite it. Here the stale spelling is renamed in the document before
 * the typed schema ever sees it.
 *
 * It is also what keeps a migration reviewable: a `yaml` Document serializes
 * back with its comments, key order and quoting intact, so the written file
 * differs from the original only where the step says. Rename a key by
 * assigning the pair's key value in place — `setIn` + `deleteIn` would append
 * the new key at the end of its map instead.
 */
export interface MigrationStep {
  /** The schema version this step reads; it writes `from + 1`. */
  readonly from: number;
  /**
   * Dotted key paths this step renames or removes. The typed schema must not
   * declare any of them, which test/unit/config-migrations.test.ts asserts —
   * a retired spelling that is still live is exactly the second contract this
   * design exists to avoid.
   */
  readonly retires: readonly string[];
  /** Mutates the document in place. Throwing aborts the whole run, and nothing is written. */
  apply(doc: Document): void;
}

/**
 * The shipped ladder, in version order. Empty at the change that introduced
 * it: both known stores were already at the supported version, so there was
 * nothing to carry. The first release that raises SUPPORTED_SCHEMA_VERSION
 * adds its step here, in the same change — the contiguity test fails until
 * it does.
 */
export const MIGRATION_STEPS: readonly MigrationStep[] = [];

/**
 * The oldest schema version this release can bring forward. With no steps it
 * is the supported version itself, so every older store is below it and the
 * behind-version refusal never names an update that could not help.
 */
export function migrationFloor(steps: readonly MigrationStep[] = MIGRATION_STEPS): number {
  if (steps.length === 0) return SUPPORTED_SCHEMA_VERSION;
  return Math.min(...steps.map((step) => step.from));
}

export class MigrationStepFailedError extends Error {
  constructor(
    readonly from: number,
    readonly cause: unknown,
  ) {
    super(
      `schema migration step ${from} -> ${from + 1} failed: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
    this.name = 'MigrationStepFailedError';
  }
}

/**
 * Applies every step from `fromVersion` up to the supported version, in order,
 * to a CLONE of `doc`, records the supported version on it, and returns it.
 * The input document is never touched, so a failure partway up the ladder
 * leaves the caller holding exactly what it read. A missing or throwing step
 * aborts with MigrationStepFailedError — a half-migrated document is never
 * returned as if it were whole.
 */
export function runMigrations(
  doc: Document,
  fromVersion: number,
  steps: readonly MigrationStep[] = MIGRATION_STEPS,
): Document {
  const migrated = doc.clone();
  for (let version = fromVersion; version < SUPPORTED_SCHEMA_VERSION; version += 1) {
    const step = steps.find((candidate) => candidate.from === version);
    if (!step) {
      throw new MigrationStepFailedError(version, new Error('no step carries this version forward'));
    }
    try {
      step.apply(migrated);
    } catch (err) {
      throw new MigrationStepFailedError(version, err);
    }
  }
  migrated.set('schema_version', SUPPORTED_SCHEMA_VERSION);
  return migrated;
}
