import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { configuredAdapters, resolveAdapter } from '../../adapters/registry.js';
import { StoreConfigSchema, SUPPORTED_SCHEMA_VERSION } from '../../config/schema.js';
import {
  AGENTS_MD_CONVENTIONS_FENCE,
  AGENTS_MD_MISSION_FENCE,
  agentsMdPath,
  checkAgentsMdDrift,
  renderConventionsSection,
  renderMissionSection,
} from '../agents-doc.js';
import { checkCatalogStale } from '../catalog/build.js';
import { extractDocMetadata, scanConventions } from '../conventions.js';
import type { Finding } from '../envelope.js';
import { readFencedRegion, removeFencedRegion } from '../fs/fenced-region.js';
import { buildGraphFromNotes, graphBuildOptions } from '../graph/model.js';
import { harnessEntryFence } from '../markers.js';
import type { StagedFile } from './types.js';
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

const MARKDOWN_HEADING_RE = /^#{1,6}\s+(.+)$/gm;

function headingsOf(text: string): Set<string> {
  const headings = new Set<string>();
  for (const match of text.matchAll(MARKDOWN_HEADING_RE)) {
    headings.add(match[1]!.trim().toLowerCase());
  }
  return headings;
}

/**
 * harness-portability spec: "A harness-specific entry file only imports" —
 * SHALL contain nothing beyond the adapter's own managed import plus that
 * harness's own extras, and SHALL NOT duplicate canonical content. Exact
 * prose duplication is undecidable to check in general (paraphrase, partial
 * copy, reordering), so this catches the concrete failure mode the
 * requirement is aimed at: a section heading also present in AGENTS.md,
 * copy-pasted into the entry file outside its managed fence — the way an
 * operator reaching for "where do I put a Claude-only note" might otherwise
 * duplicate a whole AGENTS.md section into CLAUDE.md instead of writing a
 * harness-specific extra beneath the import (see the `store-conventions`
 * fence's own guidance in `agents-doc.ts`).
 */
export const harnessEntryNoDuplicateConventionTextCheck = defineCheck({
  id: 'adapters.harness_entry_no_duplicate_convention_text',
  title: 'A harness entry file carries no convention text already indexed in AGENTS.md',
  severity: 'invariant',
  capability: 'harness-portability',
  scopes: ['store'],
  async run(ctx) {
    const adapters = configuredAdapters(ctx.config, 'harness-generation');
    if (adapters.length === 0) {
      return { status: 'pass', findings: [] };
    }

    let agentsMdContent: string;
    try {
      agentsMdContent = await readFile(agentsMdPath(ctx.storeRoot), 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return { status: 'skip', skipReason: 'AGENTS.md has not been generated yet — run `ctxr update`', findings: [] };
      }
      throw err;
    }
    const agentsMdHeadings = headingsOf(agentsMdContent);

    const findings: Finding[] = [];
    for (const adapter of adapters) {
      let entryContent: string;
      try {
        entryContent = await readFile(path.join(ctx.storeRoot, adapter.entryFileName), 'utf8');
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue; // nothing generated for this adapter yet
        throw err;
      }
      const extra = removeFencedRegion(entryContent, harnessEntryFence(adapter.id)).text;
      for (const heading of headingsOf(extra)) {
        if (agentsMdHeadings.has(heading)) {
          findings.push({
            code: 'adapters.harness_entry_duplicates_agents_md',
            severity: 'error',
            message: `"${adapter.entryFileName}" duplicates AGENTS.md's "${heading}" section outside its managed import — canonical content belongs only in AGENTS.md; a harness-specific extra belongs below the import instead.`,
            subject: adapter.entryFileName,
            details: { heading },
          });
        }
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

/**
 * harness-portability spec (inline-conventions-and-mission): "The entry
 * document's inlined content matches its sources" — `AGENTS.md`'s inlined
 * conventions/mission sections are derived content (rendered from
 * `.contexture/conventions/*.md` and the configured mission path), so
 * editing a source directly without regenerating `AGENTS.md` (e.g. bypassing
 * `ctxr update`) leaves it silently stale. Reuses `checkAgentsMdDrift`, the
 * same re-render-and-diff `ctxr verify --portable` uses, so the two commands
 * can never disagree about whether a store is in sync.
 */
export const agentsMdInlinedContentCurrentCheck = defineCheck({
  id: 'harness_portability.agents_md_inlined_content_current',
  title: "AGENTS.md's inlined conventions and mission content match their source files",
  severity: 'invariant',
  capability: 'harness-portability',
  scopes: ['store'],
  async run(ctx) {
    const drift = await checkAgentsMdDrift(ctx.storeRoot, ctx.config);
    const findings: Finding[] = [
      ...drift.driftedConventions.map((conventionPath) => ({
        code: 'harness_portability.agents_md_convention_drifted',
        severity: 'error' as const,
        message: `AGENTS.md's "Store conventions" section no longer matches "${conventionPath}" — run \`ctxr update\`.`,
        subject: conventionPath,
      })),
      ...(drift.driftedMission
        ? [
            {
              code: 'harness_portability.agents_md_mission_drifted',
              severity: 'error' as const,
              message: `AGENTS.md's "Mission" section no longer matches "${drift.driftedMission}" — run \`ctxr update\`.`,
              subject: drift.driftedMission,
            },
          ]
        : []),
    ];
    return { status: findings.length > 0 ? 'fail' : 'pass', findings };
  },
});

/**
 * A path's staged (index) content when it's part of this commit, else its
 * current on-disk content — the pre-commit-hook analogue of
 * `checkAgentsMdDrift`'s working-tree reads, so a staged-but-not-yet-merged
 * edit to a source file is seen even though nothing has been committed yet.
 * `null` means the path doesn't exist in either the staged set or on disk
 * (deleted, or staged as a deletion).
 */
async function stagedOrDiskContent(storeRoot: string, staged: readonly StagedFile[], relativePath: string): Promise<string | null> {
  const stagedFile = staged.find((f) => f.path === relativePath);
  if (stagedFile) return stagedFile.status === 'D' ? null : (stagedFile.content ?? null);
  try {
    return await readFile(path.join(storeRoot, relativePath), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * write-lifecycle spec / harness-portability spec (inline-conventions-and-mission):
 * "A commit that would leave the entry document stale is refused." The
 * store-scope drift check above reads the working tree, which is the wrong
 * source of truth for a pre-commit hook — an operator can edit a convention
 * file, forget to run `ctxr update`, and `git add` only the convention file;
 * the working tree would then have a regenerated AGENTS.md sitting right
 * next to it only if they happened to run `ctxr update` first, which is
 * exactly the step this check exists to enforce. So this reads STAGED
 * content for any file this commit touches (falling back to disk for files
 * the commit doesn't touch) and re-renders against that view instead.
 */
export const stagedAgentsMdInlinedContentCurrentCheck = defineCheck({
  id: 'staged.agents_md_inlined_content_current',
  title: 'A staged convention or mission change also stages a matching AGENTS.md regeneration',
  severity: 'invariant',
  capability: 'harness-portability',
  scopes: ['staged'],
  async run(ctx) {
    const staged = ctx.staged ?? [];
    const conventionsPrefix = ctx.config.harness.conventions_path.endsWith('/')
      ? ctx.config.harness.conventions_path
      : `${ctx.config.harness.conventions_path}/`;
    const missionPath = ctx.config.organize.mission_path;

    const relevantSourceStaged = staged.some((f) => f.path.startsWith(conventionsPrefix) || f.path === missionPath);
    if (!relevantSourceStaged) return { status: 'pass', findings: [] };

    const agentsMdStaged = staged.find((f) => f.path === 'AGENTS.md');
    if (!agentsMdStaged || agentsMdStaged.content === undefined) {
      return {
        status: 'fail',
        findings: [
          {
            code: 'staged.agents_md_inlined_content_current.not_staged',
            severity: 'error',
            message:
              'This commit stages a change to an operator convention file or the mission document, but not AGENTS.md — run `ctxr update` and stage the result.',
          },
        ],
      };
    }

    const conventions = await scanConventions(ctx.storeRoot, ctx.config);
    const effectiveConventions = await Promise.all(
      conventions.map(async (doc) => {
        const raw = await stagedOrDiskContent(ctx.storeRoot, staged, doc.path);
        return raw === null ? doc : extractDocMetadata(raw, doc.path);
      }),
    );
    const freshConventions = renderConventionsSection(ctx.config, effectiveConventions).join('\n');
    const stagedConventionsRegion = readFencedRegion(agentsMdStaged.content, AGENTS_MD_CONVENTIONS_FENCE).join('\n');

    const findings: Finding[] = [];
    if (freshConventions !== stagedConventionsRegion) {
      findings.push({
        code: 'staged.agents_md_inlined_content_current.conventions_mismatch',
        severity: 'error',
        message: 'The staged AGENTS.md does not reflect the staged convention file content — run `ctxr update` and re-stage AGENTS.md.',
      });
    }

    if (missionPath) {
      const missionRaw = await stagedOrDiskContent(ctx.storeRoot, staged, missionPath);
      const freshMission = renderMissionSection(ctx.config, missionRaw).join('\n');
      const stagedMissionRegion = readFencedRegion(agentsMdStaged.content, AGENTS_MD_MISSION_FENCE).join('\n');
      if (freshMission !== stagedMissionRegion) {
        findings.push({
          code: 'staged.agents_md_inlined_content_current.mission_mismatch',
          severity: 'error',
          message: 'The staged AGENTS.md does not reflect the staged mission document content — run `ctxr update` and re-stage AGENTS.md.',
        });
      }
    }

    return { status: findings.length > 0 ? 'fail' : 'pass', findings };
  },
});

export const INTEGRITY_CHECKS = [
  derivedArtifactStalenessCheck,
  graphDanglingLinksCheck,
  schemaVersionCurrencyCheck,
  adapterCompatibilityCheck,
  harnessEntryNoDuplicateConventionTextCheck,
  noUnrecognizedConfigKeysCheck,
  agentsMdInlinedContentCurrentCheck,
  stagedAgentsMdInlinedContentCurrentCheck,
];
