import type { CommandOutcome, CommandRequires } from '../core/command.js';
import { CHECKS } from '../core/checks/manifest.js';
import { runChecks } from '../core/checks/registry.js';
import type { CheckContext, CheckStatus } from '../core/checks/types.js';
import type { RunEnv } from '../core/env.js';
import type { Finding } from '../core/envelope.js';
import { ExitCode } from '../core/exit-codes.js';
import { readGraph } from '../core/graph/persist.js';
import { listNotes } from '../core/notes/list.js';
import type { Store } from '../core/store.js';

export const requires: CommandRequires = { store: 'required' };

export interface LintCheckSummary {
  id: string;
  title: string;
  result: CheckStatus;
  reason?: string;
  findings?: Finding[];
}

export interface LintData {
  checks: LintCheckSummary[];
  summary: { pass: number; fail: number; skip: number };
}

/**
 * context-organize spec: "lint SHALL always exit 0 ... regardless of how
 * many findings it reports" and "SHALL NOT be used as a gate." Runs the
 * SAME check registry doctor does, filtered to `severity: 'observation'`
 * instead of `'invariant'` — the type-level split (task 9.4) that keeps
 * this command from ever affecting an exit code.
 */
export async function execute(env: RunEnv, store: Store): Promise<CommandOutcome<LintData>> {
  const ctx: CheckContext = {
    storeRoot: store.root,
    config: store.config,
    scope: 'store',
    git: env.git,
    notes: () => listNotes(store.root, store.config),
    graph: () => readGraph(store),
    catalog: async () => undefined,
  };

  const reports = await runChecks(CHECKS, ctx, { scope: 'store', severity: 'observation' });
  const summary = {
    pass: reports.filter((r) => r.result.status === 'pass').length,
    fail: reports.filter((r) => r.result.status === 'fail').length,
    skip: reports.filter((r) => r.result.status === 'skip').length,
  };

  return {
    exitCode: ExitCode.Ok,
    data: {
      checks: reports.map((r) => ({
        id: r.id,
        title: r.title,
        result: r.result.status,
        reason: r.result.skipReason,
        findings: r.result.findings.length > 0 ? r.result.findings : undefined,
      })),
      summary,
    },
    findings: reports.flatMap((r) => r.result.findings),
    humanSummary: `lint: ${summary.pass} clean, ${summary.fail} with findings, ${summary.skip} skipped`,
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}
