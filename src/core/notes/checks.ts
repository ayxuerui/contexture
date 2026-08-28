import type { Finding } from '../envelope.js';
import { defineCheck } from '../checks/types.js';
import { resolveVisibility } from './visibility.js';

/**
 * store-lifecycle/context-visibility: a note relying on the fail-closed
 * default is a health OBSERVATION (lint), not a doctor-failing invariant —
 * doctor's own fail-closed-visibility invariant (wired in Phase 5) is a
 * different, stricter check. `severity: 'observation'` is what keeps this
 * out of doctor's exit code by construction, via the same registry lint
 * will read from in Phase 7.
 */
export const failClosedVisibilityCheck = defineCheck({
  id: 'visibility.fail_closed_default',
  title: 'Notes relying on the fail-closed default visibility',
  severity: 'observation',
  capability: 'context-visibility',
  scopes: ['store'],
  async run(ctx) {
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
    return { status: findings.length > 0 ? 'fail' : 'pass', findings };
  },
});
