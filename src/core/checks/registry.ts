import type { CheckContext, CheckDefinition, CheckResult, CheckScope, CheckSeverity } from './types.js';

export interface CheckReport {
  id: string;
  title: string;
  capability: string;
  severity: CheckSeverity;
  result: CheckResult;
}

export interface RunSelection {
  scope: CheckScope;
  /** Restrict to these check ids, if given. */
  only?: readonly string[];
  severity?: CheckSeverity;
}

/**
 * The dispatch every phase's checks run through, and the one thing that must
 * never change after Phase 0: extending the system means appending an
 * import and an array entry to manifest.ts — a data change, not a change to
 * this function.
 */
export async function runChecks(
  defs: readonly CheckDefinition[],
  ctx: CheckContext,
  selection: RunSelection,
): Promise<CheckReport[]> {
  const applicable = defs.filter(
    (d) =>
      d.scopes.includes(selection.scope) &&
      (!selection.only || selection.only.includes(d.id)) &&
      (!selection.severity || d.severity === selection.severity),
  );

  const reports: CheckReport[] = [];
  for (const def of applicable) {
    const gate = def.appliesTo?.(ctx);
    if (gate && !gate.applicable) {
      reports.push({
        id: def.id,
        title: def.title,
        capability: def.capability,
        severity: def.severity,
        result: { status: 'skip', skipReason: gate.reason, findings: [] },
      });
      continue;
    }
    const result = await def.run(ctx);
    reports.push({ id: def.id, title: def.title, capability: def.capability, severity: def.severity, result });
  }
  return reports;
}

/** doctor exits non-zero only when a real invariant failed; skips and passes both succeed. */
export function overallStatus(reports: readonly CheckReport[]): 'pass' | 'fail' {
  return reports.some((r) => r.result.status === 'fail') ? 'fail' : 'pass';
}
