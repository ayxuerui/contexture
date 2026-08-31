import { resolveAdapter } from '../../adapters/registry.js';
import { StoreConfigSchema, SUPPORTED_SCHEMA_VERSION } from '../../config/schema.js';
import { checkCatalogStale } from '../catalog/build.js';
import type { Finding } from '../envelope.js';
import { buildGraphFromNotes, graphBuildOptions } from '../graph/model.js';
import { defineCheck } from './types.js';

/**
 * store-integrity spec: "unrecognized top-level config keys." StoreConfigSchema
 * is `.passthrough()` (config/schema.ts — deliberately loose, so a later
 * package version's additive field never forces every existing store through
 * a migration). Passthrough's cost is that a REMOVED key — e.g. `identity`,
 * dropped by remove-agent-identity — is silently carried through as dead
 * config instead of surfacing anywhere; this check closes that gap generically
 * (any key StoreConfigSchema doesn't declare, not just `identity` by name), so
 * the safety net promised at removal time actually exists.
 */
const KNOWN_TOP_LEVEL_CONFIG_KEYS = new Set(Object.keys(StoreConfigSchema.shape));

/**
 * store-integrity spec (task 9.3): "derived-artifact staleness." Covers
 * both derived legs in one check — the catalog's confirmed-gloss hash
 * (Phase 3) and the persisted graph compared against a fresh rebuild from
 * the store's current notes. Neither sub-condition being "not built yet"
 * is treated as a failure — there's nothing stale about an artifact that
 * has simply never been built.
 */
export const derivedArtifactStalenessCheck = defineCheck({
  id: 'derived_artifacts.stale',
  title: 'Derived artifacts (catalog, graph) match the store\'s current notes',
  severity: 'invariant',
  capability: 'store-integrity',
  scopes: ['store'],
  async run(ctx) {
    const findings: Finding[] = [];

    const store = { root: ctx.storeRoot, config: ctx.config };
    const staleCatalogEntries = await checkCatalogStale(store);
    for (const entry of staleCatalogEntries) {
      findings.push({
        code: 'derived_artifacts.catalog_stale',
        severity: 'error',
        message: `"${entry.path}" in catalog section "${entry.section}" has changed since its gloss was last confirmed.`,
        subject: entry.path,
      });
    }

    const persistedGraph = await ctx.graph();
    if (persistedGraph) {
      const freshGraph = buildGraphFromNotes(await ctx.notes(), graphBuildOptions(ctx.config));
      if (JSON.stringify(persistedGraph) !== JSON.stringify(freshGraph)) {
        findings.push({
          code: 'derived_artifacts.graph_stale',
          severity: 'error',
          message: 'The persisted graph does not match what a rebuild would produce from the store\'s current notes. Run `ctxr graph build`.',
        });
      }
    }

    return { status: findings.length > 0 ? 'fail' : 'pass', findings };
  },
});

/**
 * store-integrity spec: "dangling links... (per context-retrieval)." A
 * genuine identity collision is NOT re-checked here — buildGraphFromNotes
 * refuses to persist a graph that has one (core/graph/model.ts), so a
 * persisted graph.json is proof by construction that none exists; there is
 * nothing for a doctor check to find after the fact.
 */
// Shares detection with organize-checks.ts:brokenLinksCheck (lint, observation) under a
// different id (task 9.4: two ids, two severity lanes, one condition, never double-counted).
export const graphDanglingLinksCheck = defineCheck({
  id: 'graph.dangling_links',
  title: 'The graph has no dangling links',
  severity: 'invariant',
  capability: 'context-retrieval',
  scopes: ['store'],
  async run(ctx) {
    const graph = await ctx.graph();
    if (!graph) {
      return { status: 'skip', skipReason: 'graph has not been built yet — run `ctxr graph build`', findings: [] };
    }
    const findings: Finding[] = graph.dangling.map((d) => ({
      code: 'graph.dangling_link',
      severity: 'error',
      message: `"${d.from}" links to "${d.target}", which is ${d.reason === 'ambiguous' ? 'ambiguous' : 'not found'}.`,
      subject: d.from,
      details: { target: d.target, reason: d.reason },
    }));
    return { status: findings.length > 0 ? 'fail' : 'pass', findings };
  },
});

/** store-integrity spec: "schema version currency (per store-lifecycle)." */
export const schemaVersionCurrencyCheck = defineCheck({
  id: 'store.schema_version_currency',
  title: 'The store is at the current schema version',
  severity: 'invariant',
  capability: 'store-lifecycle',
  scopes: ['store'],
  async run(ctx) {
    if (ctx.config.schema_version >= SUPPORTED_SCHEMA_VERSION) {
      return { status: 'pass', findings: [] };
    }
    return {
      status: 'fail',
      findings: [
        {
          code: 'store.schema_version_behind',
          severity: 'error',
          message: `The store is at schema_version ${ctx.config.schema_version}, behind the supported version ${SUPPORTED_SCHEMA_VERSION}. Run \`ctxr migrate\`.`,
          details: { current: ctx.config.schema_version, supported: SUPPORTED_SCHEMA_VERSION },
        },
      ],
    };
  },
});

/** store-integrity spec: "adapter compatibility (per adapters)." */
export const adapterCompatibilityCheck = defineCheck({
  id: 'adapters.compatibility',
  title: 'Every configured adapter resolves and matches its supported interface version',
  severity: 'invariant',
  capability: 'adapters',
  scopes: ['store'],
  async run(ctx) {
    const findings: Finding[] = [];
    for (const declaration of ctx.config.adapters) {
      try {
        resolveAdapter(declaration);
      } catch (err) {
        findings.push({
          code: 'adapters.incompatible',
          severity: 'error',
          message: err instanceof Error ? err.message : String(err),
          subject: declaration.id,
          details: { kind: declaration.kind },
        });
      }
    }
    return { status: findings.length > 0 ? 'fail' : 'pass', findings };
  },
});

/** store-integrity spec: "no unrecognized top-level config keys." */
export const noUnrecognizedConfigKeysCheck = defineCheck({
  id: 'store.no_unrecognized_config_keys',
  title: 'contexture.yaml declares no top-level key StoreConfigSchema doesn\'t recognize',
  severity: 'invariant',
  capability: 'store-integrity',
  scopes: ['store'],
  async run(ctx) {
    const unrecognized = Object.keys(ctx.config).filter((key) => !KNOWN_TOP_LEVEL_CONFIG_KEYS.has(key));
    const findings: Finding[] = unrecognized.map((key) => ({
      code: 'store.unrecognized_config_key',
      severity: 'error',
      message: `contexture.yaml has a top-level "${key}" key that this version of contexture doesn't recognize — a config schema this old, or a capability retired in a later release. Remove it, or check contexture's changelog for a migration note.`,
      subject: key,
    }));
    return { status: findings.length > 0 ? 'fail' : 'pass', findings };
  },
});

export const INTEGRITY_CHECKS = [
  derivedArtifactStalenessCheck,
  graphDanglingLinksCheck,
  schemaVersionCurrencyCheck,
  adapterCompatibilityCheck,
  noUnrecognizedConfigKeysCheck,
];
