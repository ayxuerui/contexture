import type { Finding } from './envelope.js';
import type { ExitCode } from './exit-codes.js';

/**
 * Declarative, per-command metadata read uniformly by run.ts's dispatcher —
 * `init` and `version` declare `store: 'absent'`; `plugin build`
 * (contexture's own plugin needs no store, publish-one-contexture-plugin D1)
 * and `second-opinion` (the lineup is the store's inside one, the shipped one
 * outside, second-opinion-lineup-in-store-config D4) declare `store:
 * 'optional'`; every other command requires an already-opened store. This is what keeps `init`'s
 * exception to the usual git-check/schema-gate an enumerated, testable fact
 * rather than an `if (commandName === 'init')` special case in the
 * dispatcher.
 */
export interface CommandRequires {
  store: 'required' | 'absent' | 'optional';
}

export interface CommandOutcome<TData> {
  exitCode: ExitCode;
  data: TData | null;
  findings: Finding[];
  /** One-line human-readable summary, used when --json is not passed. */
  humanSummary: string;
  /**
   * Diagnostic lines for stderr, emitted through Reporter alongside the result
   * in BOTH modes — this is how a command says something to a human without
   * touching stdout, which --json reserves for exactly one JSON value.
   */
  notices?: string[];
  storeRoot: string | null;
  schemaVersion: number | null;
}
