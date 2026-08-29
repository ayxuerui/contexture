import { defineCheck } from './types.js';

/**
 * agent-identity spec: "Identity files... SHALL live under a path declared
 * in the store's retrieval exclusion configuration." Catalog and graph
 * already can't surface anything under an excluded prefix (they're both
 * built from listNotes()) — this check guards the one way that guarantee
 * could quietly break: an operator editing config.retrieval.exclude_paths
 * and dropping the identity path from it.
 */
export const identityExclusionCheck = defineCheck({
  id: 'identity.excluded_from_retrieval',
  title: 'The identity path is excluded from retrieval',
  severity: 'invariant',
  capability: 'agent-identity',
  scopes: ['store'],
  async run(ctx) {
    const identityPath = ctx.config.identity.path.replace(/\/+$/, '');
    const covered = ctx.config.retrieval.exclude_paths.some((prefix) => {
      const trimmed = prefix.replace(/\/+$/, '');
      return identityPath === trimmed || identityPath.startsWith(`${trimmed}/`);
    });
    if (covered) {
      return { status: 'pass', findings: [] };
    }
    return {
      status: 'fail',
      findings: [
        {
          code: 'identity.not_excluded',
          severity: 'error',
          message: `The identity path "${ctx.config.identity.path}" is not covered by retrieval.exclude_paths — identity content could leak into the catalog or graph.`,
          subject: ctx.config.identity.path,
        },
      ],
    };
  },
});

export const IDENTITY_CHECKS = [identityExclusionCheck];
