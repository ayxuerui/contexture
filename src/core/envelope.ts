import { ExitCode } from './exit-codes.js';

/**
 * The `--json` output envelope every contexture command shares (cli-contract
 * spec). Snake_case throughout, matching contexture.yaml's own `schema_version`
 * — an agent parsing --json output shouldn't have to remember that config is
 * snake_case but output is camelCase.
 *
 * `envelope_version` is the stability lever: additive-only within version 1;
 * a breaking reshape bumps it, and both shapes ship for one minor release.
 */
export type Status = 'ok' | 'failed' | 'error';

export interface Finding {
  /** Stable, machine-readable id, e.g. "root.not_found", "config.schema_version.newer". */
  code: string;
  severity: 'error' | 'warning' | 'info';
  /** One human sentence. */
  message: string;
  /** The thing the finding is about: a path, a config key, a check id. */
  subject?: string;
  details?: Record<string, unknown>;
}

export interface Envelope<TData = unknown> {
  envelope_version: 1;
  cli_version: string;
  /** Dot-joined command path, e.g. "init", "doctor", later "note.resolve". */
  command: string;
  status: Status;
  exit_code: number;
  store: { root: string | null; schema_version: number | null };
  findings: Finding[];
  data: TData | null;
}

export interface BuildEnvelopeInput<TData> {
  cliVersion: string;
  command: string;
  storeRoot: string | null;
  schemaVersion: number | null;
  findings: Finding[];
  data: TData | null;
  exitCode: ExitCode;
}

function statusForExitCode(exitCode: ExitCode): Status {
  if (exitCode === ExitCode.Ok) return 'ok';
  if (exitCode === ExitCode.Internal || exitCode === ExitCode.Usage) return 'error';
  return 'failed';
}

export function buildEnvelope<TData>(input: BuildEnvelopeInput<TData>): Envelope<TData> {
  return {
    envelope_version: 1,
    cli_version: input.cliVersion,
    command: input.command,
    status: statusForExitCode(input.exitCode),
    exit_code: input.exitCode,
    store: { root: input.storeRoot, schema_version: input.schemaVersion },
    findings: input.findings,
    data: input.data,
  };
}
