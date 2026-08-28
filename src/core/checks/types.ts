import type { Finding } from '../envelope.js';
import type { Note } from '../notes/list.js';

/**
 * `doctor` (invariant checks, fails a run) and `lint` (observation checks,
 * never fails a run — context-organize spec) run off the SAME registry,
 * distinguished only by `severity`. This is what makes Phase 9.4 ("no
 * condition double-counted as both a lint finding and a doctor failure") a
 * type constraint instead of a manual audit six phases later.
 */
export type CheckSeverity = 'invariant' | 'observation';
export type CheckStatus = 'pass' | 'fail' | 'skip';

/**
 * `'staged'` exists from Phase 0 even though nothing uses it yet, because
 * Phase 2.2's pre-commit hook runs `doctor --staged` against a check subset
 * that store-scope checks (like Phase 3's catalog coverage) don't belong in.
 * Omitting this now would mean building a second dispatcher in Phase 2.
 */
export type CheckScope = 'store' | 'staged';

export interface CheckResult {
  status: CheckStatus;
  /** Required when status === 'skip'. */
  skipReason?: string;
  findings: Finding[];
  summary?: string;
}

/**
 * Memoized accessors shared across every check in one run. Reserved with
 * this shape from Phase 0 so that by Phase 9 — when catalog coverage,
 * dangling-link, identity-collision, fail-closed-visibility, and gloss-rot
 * checks all need the full note set — adding memoization doesn't mean
 * changing `run()`'s signature across six phases of accumulated checks.
 */
export interface CheckContext {
  readonly storeRoot: string;
  readonly scope: CheckScope;
  notes(): Promise<readonly Note[]>;
  graph(): Promise<unknown>;
  catalog(): Promise<unknown>;
}

export interface CheckDefinition {
  /** Stable, lowercase-dotted id — part of the --json contract once shipped. */
  id: string;
  title: string;
  severity: CheckSeverity;
  /** Which capability this check verifies, e.g. "context-catalog" — traceability to the spec. */
  capability: string;
  scopes: readonly CheckScope[];
  appliesTo?(ctx: CheckContext): { applicable: true } | { applicable: false; reason: string };
  run(ctx: CheckContext): Promise<CheckResult>;
}

export function defineCheck(def: CheckDefinition): CheckDefinition {
  return def;
}
