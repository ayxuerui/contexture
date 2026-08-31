import type { CommandOutcome, CommandRequires } from '../core/command.js';
import { CHECKS } from '../core/checks/manifest.js';
import { overallStatus, runChecks } from '../core/checks/registry.js';
import type { CheckContext, CheckScope, CheckStatus } from '../core/checks/types.js';
import type { RunEnv } from '../core/env.js';
import type { Finding } from '../core/envelope.js';
import { ExitCode } from '../core/exit-codes.js';
import { getStagedFiles } from '../core/git/staged.js';
import { readGraph } from '../core/graph/persist.js';
import { listNotes } from '../core/notes/list.js';
import type { Store } from '../core/store.js';

export const requires: CommandRequires = { store: 'required' };

export interface DoctorFlags {
  staged?: boolean;
}

export interface DoctorCheckSummary {
  id: string;
  title: string;
  result: CheckStatus;
  reason?: string;
  findings?: Finding[];
}

export interface DoctorData {
  scope: CheckScope;
  checks: DoctorCheckSummary[];
  summary: { pass: number; fail: number; skip: number };
}

export async function execute(env: RunEnv, store: Store, flags: DoctorFlags = {}): Promise<CommandOutcome<DoctorData>> {
  const scope: CheckScope = flags.staged ? 'staged' : 'store';
  const staged = scope === 'staged' ? await getStagedFiles(env.git, store.root) : undefined;

  const ctx: CheckContext = {
    storeRoot: store.root,
    config: store.config,
    scope,
    git: env.git,
    staged,
    notes: () => listNotes(store.root, store.config),
    graph: () => readGraph(store),
    catalog: async () => undefined,
  };

  // doctor runs only `invariant` checks — `observation` checks (lint's,
  // Phase 7) are registered in the same manifest but never affect doctor's
  // exit code. This is what makes "no condition double-counted as both a
  // lint finding and a doctor failure" (task 9.4) a type-level fact instead
  // of a later audit.
  const reports = await runChecks(CHECKS, ctx, { scope, severity: 'invariant' });

  const summary = {
    pass: reports.filter((r) => r.result.status === 'pass').length,
    fail: reports.filter((r) => r.result.status === 'fail').length,
    skip: reports.filter((r) => r.result.status === 'skip').length,
  };
  const status = overallStatus(reports);

  const data: DoctorData = {
    scope,
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
    humanSummary: `doctor (${scope}): ${summary.pass} passed, ${summary.fail} failed, ${summary.skip} skipped`,
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}
