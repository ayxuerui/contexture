import type { Finding } from './envelope.js';
import type { ExitCode } from './exit-codes.js';

/**
 * Declarative, per-command metadata read uniformly by run.ts's dispatcher —
 * `init` is the one command that declares `store: 'absent'`; every other
 * command requires an already-opened store. This is what keeps `init`'s
 * exception to the usual git-check/schema-gate an enumerated, testable fact
 * rather than an `if (commandName === 'init')` special case in the
 * dispatcher.
 */
export interface CommandRequires {
  store: 'required' | 'absent';
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
