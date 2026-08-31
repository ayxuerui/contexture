import { scanForLeaks } from '../disclosure/leak-scan.js';
import type { Finding } from '../envelope.js';
import { defineCheck } from './types.js';

/** disclosure-policy spec (store-primitives-from-migration-audit D3): reported by lint, never failed by doctor — a marker match is a judgment call, not an invariant. */
export const leakCheck = defineCheck({
  id: 'disclosure.leak',
  title: "Content matching a context's marker found inside a note that context cannot see",
  severity: 'observation',
  capability: 'disclosure-policy',
  scopes: ['store'],
  async run(ctx) {
    const notes = await ctx.notes();
    const leaks = scanForLeaks(ctx.config, notes);
    const findings: Finding[] = leaks.map((leak) => ({
      code: 'disclosure.leak',
      severity: 'warning',
      message: `"${leak.path}" matches a marker for context "${leak.context}", which cannot see this note: "${leak.matchedText}".`,
      subject: leak.path,
      details: { context: leak.context, pattern: leak.pattern, matchedText: leak.matchedText },
    }));
    return { status: findings.length > 0 ? 'fail' : 'pass', findings };
  },
});

export const DISCLOSURE_CHECKS = [leakCheck];
