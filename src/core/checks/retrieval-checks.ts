import type { Finding } from '../envelope.js';
import { defineCheck } from './types.js';

/**
 * compose-the-retrieval-pass spec (D10): exclusion removes a path from
 * retrieval; demotion keeps it retrievable and sorts it last. A path declared
 * both ways is an ambiguity about reachability, and reachability must never be
 * resolved by precedence order — so doctor fails rather than picking a winner.
 */
export const retrievalTierOverlapCheck = defineCheck({
  id: 'retrieval.tier_overlap',
  title: 'No path prefix is declared both excluded and demoted',
  severity: 'invariant',
  capability: 'context-retrieval',
  scopes: ['store'],
  async run(ctx) {
    const normalize = (prefix: string): string => prefix.replace(/\/+$/, '');
    const excluded = new Set(ctx.config.retrieval.exclude_paths.map(normalize));
    const findings: Finding[] = ctx.config.retrieval.demote_paths
      .map(normalize)
      .filter((prefix) => excluded.has(prefix))
      .map((prefix) => ({
        code: 'retrieval.tier_overlap.both',
        severity: 'error' as const,
        message: `"${prefix}" is declared both excluded and demoted. Excluded material is not retrievable at all; demoted material is retrievable and ordered last. Declare it as exactly one.`,
        subject: prefix,
      }));
    return { status: findings.length > 0 ? 'fail' : 'pass', findings };
  },
});

export const RETRIEVAL_CHECKS = [retrievalTierOverlapCheck];
