import type { CommandOutcome, CommandRequires } from '../core/command.js';
import { CHECKS } from '../core/checks/manifest.js';
import { overallStatus, runChecks } from '../core/checks/registry.js';
import type { CheckContext, CheckStatus } from '../core/checks/types.js';
import type { Finding } from '../core/envelope.js';
import { ExitCode } from '../core/exit-codes.js';
import { listNotes } from '../core/notes/list.js';
import type { Store } from '../core/store.js';

export const requires: CommandRequires = { store: 'required' };

export interface DoctorCheckSummary {
  id: string;
  title: string;
  result: CheckStatus;
  reason?: string;
  findings?: Finding[];
}

export interface DoctorData {
  checks: DoctorCheckSummary[];
  summary: { pass: number; fail: number; skip: number };
}

export async function execute(store: Store): Promise<CommandOutcome<DoctorData>> {
  const ctx: CheckContext = {
    storeRoot: store.root,
    scope: 'store',
    notes: () => listNotes(store.root),
    graph: async () => undefined,
    catalog: async () => undefined,
  };

  // Phase 0 ships with zero checks registered (task 0.8); later phases
  // extend CHECKS, never this dispatch.
  const reports = await runChecks(CHECKS, ctx, { scope: 'store' });

  const summary = {
    pass: reports.filter((r) => r.result.status === 'pass').length,
    fail: reports.filter((r) => r.result.status === 'fail').length,
    skip: reports.filter((r) => r.result.status === 'skip').length,
  };
  const status = overallStatus(reports);

  const data: DoctorData = {
    checks: reports.map((r) => ({
      id: r.id,
      title: r.title,
      result: r.result.status,
      reason: r.result.skipReason,
      findings: r.result.findings.length > 0 ? r.result.findings : undefined,
    })),
    summary,
  };

  return {
    exitCode: status === 'fail' ? ExitCode.CheckFailed : ExitCode.Ok,
    data,
    findings: reports.flatMap((r) => r.result.findings),
    humanSummary: `doctor: ${summary.pass} passed, ${summary.fail} failed, ${summary.skip} skipped`,
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}
