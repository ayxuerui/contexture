import type { Finding } from '../envelope.js';
import type { CheckContext } from '../checks/types.js';
import { defineCheck } from '../checks/types.js';
import { resolveVisibility } from './visibility.js';

async function failClosedFindings(ctx: CheckContext): Promise<Finding[]> {
  const notes = await ctx.notes();
  const findings: Finding[] = [];
  for (const note of notes) {
    const resolution = resolveVisibility(ctx.config, note);
    if (resolution.reason === 'fail-closed default') {
      findings.push({
        code: 'visibility.fail_closed_default',
        severity: 'info',
        message: `"${note.path}" has no explicit or directory-derived visibility; relying on the fail-closed default.`,
        subject: note.path,
      });
    }
  }
  return findings;
}

/**
 * store-lifecycle/context-visibility: a note relying on the fail-closed
 * default is a health OBSERVATION (lint), not a doctor-failing invariant —
 * doctor's own fail-closed-visibility invariant (wired in Phase 5, below)
 * is a different, stricter check. `severity: 'observation'` is what keeps
 * this out of doctor's exit code by construction, via the same registry
 * lint reads from in Phase 7.
 */
export const failClosedVisibilityCheck = defineCheck({
  id: 'visibility.fail_closed_default',
  title: 'Notes relying on the fail-closed default visibility',
  severity: 'observation',
  capability: 'context-visibility',
  scopes: ['store'],
  async run(ctx) {
    const findings = await failClosedFindings(ctx);
    return { status: findings.length > 0 ? 'fail' : 'pass', findings };
  },
});

/**
 * context-visibility spec (task 5.2): the same underlying condition as the
 * lint-facing observation above, registered a second time as its own
 * invariant so `doctor` can fail a run on it. Each check id carries exactly
 * one severity, so the two never double-count a single run's pass/fail
 * totals against each other (task 9.4) even though both watch the same
 * condition for two different audiences (an operator skimming lint output,
 * versus a gate that must block).
 */
export const failClosedVisibilityInvariantCheck = defineCheck({
  id: 'visibility.fail_closed_default_invariant',
  title: 'Every note has a resolvable visibility value',
  severity: 'invariant',
  capability: 'context-visibility',
  scopes: ['store'],
  async run(ctx) {
    const findings = await failClosedFindings(ctx);
    return { status: findings.length > 0 ? 'fail' : 'pass', findings };
  },
});
