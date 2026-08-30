import { IDENTITY_ROLES, identityFilePath } from '../identity.js';
import { defineCheck } from './types.js';
import type { Finding } from '../envelope.js';

/**
 * agent-identity spec: "Identity files... SHALL live under a path declared
 * in the store's retrieval exclusion configuration." Catalog and graph
 * already can't surface anything under an excluded prefix (they're both
 * built from listNotes()) — this check guards the one way that guarantee
 * could quietly break: an operator editing config.retrieval.exclude_paths
 * and dropping an identity path from it.
 *
 * session-capture-command spec (D3): checked against each ROLE'S RESOLVED
 * path — not the identity directory alone — so a role relocated outside
 * `identity.path` (e.g. into a directory a harness runtime links into)
 * still cannot leak into retrieval.
 */
export const identityExclusionCheck = defineCheck({
  id: 'identity.excluded_from_retrieval',
  title: 'Every identity role\'s resolved path is excluded from retrieval',
  severity: 'invariant',
  capability: 'agent-identity',
  scopes: ['store'],
  async run(ctx) {
    const findings: Finding[] = [];
    for (const role of IDENTITY_ROLES) {
      const resolvedPath = identityFilePath(ctx.config, role);
      const covered = ctx.config.retrieval.exclude_paths.some((prefix) => {
        const trimmed = prefix.replace(/\/+$/, '');
        return resolvedPath === trimmed || resolvedPath.startsWith(`${trimmed}/`);
      });
      if (!covered) {
        findings.push({
          code: 'identity.not_excluded',
          severity: 'error',
          message: `The ${role} identity file "${resolvedPath}" is not covered by retrieval.exclude_paths — it could leak into the catalog or graph.`,
          subject: resolvedPath,
        });
      }
    }
    return { status: findings.length > 0 ? 'fail' : 'pass', findings };
  },
});

export const IDENTITY_CHECKS = [identityExclusionCheck];
