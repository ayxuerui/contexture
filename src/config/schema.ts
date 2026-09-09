import { z } from 'zod';
import { isStrictlyUnderPrefix } from '../core/fs/prefix.js';
import { SHIPPED_DEFAULTS } from './defaults.js';

/**
 * store-lifecycle spec: schema_version versions STORE STATE (config shape +
 * note frontmatter conventions) — a monotonic integer independent of the npm
 * package version — not "what this CLI release happens to be."
 *
 * retire-store-migrations: contexture ships no migration mechanism, so this
 * number is a gate rather than a starting point. `readConfig` refuses any
 * store whose recorded version is not exactly this one, in either direction:
 * a newer store because this release cannot know its shape, an older one
 * because this release no longer reads that shape and offers nothing that
 * would bring it forward. A release that changes the store's shape bumps this
 * and documents the one-time fixup in its release notes.
 *
 * It stayed at 10 through that retirement on purpose: nothing about a
 * conforming store's shape changed. What was dropped were superseded INPUT
 * spellings that no store at 10 has ever written, since `renderStoreConfig`
 * only ever emitted the current names.
 */
export const SUPPORTED_SCHEMA_VERSION = 10;

export const TaxonomyLayerSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  description: z.string().min(1),
});

const TaxonomySchema = z.object({
  /** A shipped profile id, or "custom" when a custom taxonomy definition was supplied. */
  profile: z.string().min(1),
  layers: z.array(TaxonomyLayerSchema),
});

const DerivedSchema = z.object({
  paths: z.array(z.string()).default([...SHIPPED_DEFAULTS.derived.paths]),
});

/**
 * graph-context-document spec: the graph document's knobs. Clusters are
 * positional (the first `cluster_depth` directory segments), never nominal,
 * so no layer name is involved; `orphan_exempt_clusters` keeps a
 * deliberately unlinked cluster out of the document without touching the
 * orphan lint check.
 */
const GraphSettingsSchema = z.object({
  cluster_depth: z.number().int().positive().default(SHIPPED_DEFAULTS.retrieval.graph.cluster_depth),
  hub_top: z.number().int().positive().default(SHIPPED_DEFAULTS.retrieval.graph.hub_top),
  bridge_top: z.number().int().positive().default(SHIPPED_DEFAULTS.retrieval.graph.bridge_top),
  orphan_exempt_clusters: z.array(z.string()).default([...SHIPPED_DEFAULTS.retrieval.graph.orphan_exempt_clusters]),
});

const RetrievalSchema = z.object({
  exclude_paths: z.array(z.string()).default([...SHIPPED_DEFAULTS.retrieval.exclude_paths]),
  /**
   * compose-the-retrieval-pass spec: prefixes that remain fully retrievable —
   * present in the catalog, present in the graph, returned by every leg — but
   * ordered after everything else. Distinct from `exclude_paths`, which removes
   * a path from retrieval entirely; declaring one path both ways fails doctor
   * rather than being resolved by precedence.
   *
   * The shipped default demotes nothing. `init` seeds it from the resolved
   * taxonomy's archive destination instead, which is why that seeded value is
   * written out rather than omitted (config-defaults-as-the-convention D2).
   */
  demote_paths: z.array(z.string()).default([...SHIPPED_DEFAULTS.retrieval.demote_paths]),
  /** compose-the-retrieval-pass spec: the pass's note cap; truncation is reported, never silent. */
  gather_max_notes: z.number().int().positive().default(SHIPPED_DEFAULTS.retrieval.gather_max_notes),
  /** graph-context-document spec: relation names whose section headings type the wikilinks under them; empty = no typed edges. */
  relations: z.array(z.string().min(1)).default([...SHIPPED_DEFAULTS.retrieval.relations]),
  graph: GraphSettingsSchema.default({ ...SHIPPED_DEFAULTS.retrieval.graph, orphan_exempt_clusters: [] }),
});

/**
 * Recorded once, at init, from whatever branch `git init` actually created
 * (never hardcoded to "main") — this is what lets the pre-push hook refuse
 * a push to the default branch without re-deriving it from a possibly
 * network-dependent `git remote show` at hook time.
 */
const GitSchema = z.object({
  default_branch: z.string().min(1),
});

const SessionSchema = z.object({
  branch_prefix: z.string().min(1).default(SHIPPED_DEFAULTS.session.branch_prefix),
  worktrees_path: z.string().min(1).default(SHIPPED_DEFAULTS.session.worktrees_path),
});

/** session-capture-command spec (D5): declaring any path here turns the sanctioned-location gate on; empty (the default) leaves every in-store path accepted. */
const WriteLifecycleSchema = z.object({
  diff_size_ceiling_lines: z.number().int().positive().default(SHIPPED_DEFAULTS.write_lifecycle.diff_size_ceiling_lines),
  writable_paths: z.array(z.string()).default([...SHIPPED_DEFAULTS.write_lifecycle.writable_paths]),
});

const CatalogSchema = z.object({
  path: z.string().min(1).default(SHIPPED_DEFAULTS.catalog.path),
  section_max_bytes: z.number().int().positive().default(SHIPPED_DEFAULTS.catalog.section_max_bytes),
});

/**
 * publish spec (design.md): unlike every other tool-owned path field, this one is
 * schema-optional with a default — a `contexture.yaml` written before this field
 * existed has no `publish:` key at all, and `readConfig`'s strict `safeParse` has
 * no default-merging, so a required field here would break every pre-existing
 * store. `init` still writes it explicitly for a freshly generated config.
 */
const PublishSchema = z.object({
  path: z.string().min(1).default(SHIPPED_DEFAULTS.publish.path),
});

/**
 * harness-portability spec (vendored-craft-skills): which vendored
 * third-party skills a store wants, defaulting to the shipped set so a
 * `contexture.yaml` predating this key still parses. An empty list opts
 * out entirely — same schema-optional-with-default shape as `publish`.
 */
/**
 * cli-contract (keep-the-installed-cli-current): whether session start and
 * update consult the release registry, and how long a resolved answer is
 * reused. Schema-optional with defaults, like `publish` and `skills` — a
 * `contexture.yaml` predating this key parses unchanged, which is why this
 * block needed no schema_version bump.
 */
const UpdateCheckSchema = z.object({
  enabled: z.boolean().default(SHIPPED_DEFAULTS.update_check.enabled),
  ttl_hours: z.number().positive().default(SHIPPED_DEFAULTS.update_check.ttl_hours),
});

/**
 * harness-portability spec (a store declares which note templates it installs):
 * where a store's note templates live, and which of the packaged library it
 * installs. Shaped as its own block rather than as keys on `harness`, matching
 * `catalog` and `publish` — an authored-but-tool-owned location with its own
 * settings. Schema-optional with defaults, so a `contexture.yaml` predating the
 * block parses unchanged; that is why this needs no schema_version bump and no
 * migration. An empty `installed` list opts out entirely, same as `skills`.
 */
const TemplatesSchema = z.object({
  path: z.string().min(1).default(SHIPPED_DEFAULTS.templates.path),
  installed: z.array(z.string()).default([...SHIPPED_DEFAULTS.templates.installed]),
});

const SkillsSchema = z.object({
  vendored: z.array(z.string()).default([...SHIPPED_DEFAULTS.skills.vendored]),
});

/**
 * context-ingest spec: the capture tier. `capture_root` is the retained
 * ledger's root and `inbox_path` is the not-yet-ingested state inside it.
 *
 * Both paths carry the shipped convention as a schema default, so a config
 * that declares neither resolves to it. The rule that the inbox sits inside
 * the capture root lives on StoreConfigSchema instead of here, because it
 * spans two keys and only that scope sees both.
 */
const IngestSchema = z
  .object({
    inbox_path: z.string().min(1).default(SHIPPED_DEFAULTS.ingest.inbox_path),
    capture_root: z.string().min(1).default(SHIPPED_DEFAULTS.ingest.capture_root),
    /** store-primitives-from-migration-audit spec (D2): query parameters stripped when canonicalizing a URL source identity, in addition to the shipped defaults. */
    tracking_params: z.array(z.string()).default([...SHIPPED_DEFAULTS.ingest.tracking_params]),
  });

/**
 * context-organize spec: archive's destination — independent of taxonomy
 * layers, so it works under any profile.
 *
 * `archive_destination` is the only spelling. Its pre-rename name
 * `archive_path` was accepted here as an input while a migration existed to
 * rewrite it; retire-store-migrations removed both, so a config still
 * carrying the old name now fails the schema-version gate before it reaches
 * this schema at all.
 */
const OrganizeSchema = z
  .object({
    archive_destination: z.string().min(1).optional(),
    /** store-primitives-from-migration-audit spec (D4): the grace period, in days, before a stale rollup is reported — bounds noise from a backlink edited moments ago. */
    rollup_stale_days: z.number().int().nonnegative().default(SHIPPED_DEFAULTS.organize.rollup_stale_days),
    /**
     * context-organize spec: the store's standing current-state document
     * (priorities, active builds, back burner, sunset candidates, debt).
     * Unset by default — no mission mechanism until an operator opts in.
     * Content is written via `ctxr rollup write` exactly like an entity
     * rollup; `ctxr rollup stale` reports this one path stale on elapsed
     * time rather than backlinks (see `checkMissionStaleness`).
     */
    mission_path: z.string().min(1).optional(),
  })
  .transform((value, ctx) => {
    /**
     * config-defaults-as-the-convention (D2): derived, not conventional — a
     * shipped profile supplies this from the taxonomy at init. A constant
     * default here would give every PARA store `archive/` while its own
     * taxonomy declares `archives/`, which is the defect
     * archive-destination-from-taxonomy exists to prevent. Absent under both
     * spellings, the key is reported rather than guessed.
     */
    const archiveDestination = value.archive_destination;
    if (archiveDestination === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['archive_destination'],
        message:
          'organize.archive_destination is missing. It is resolved from the store taxonomy at init rather than defaulted, so declare it explicitly.',
      });
      return z.NEVER;
    }
    return {
      archive_destination: archiveDestination,
      rollup_stale_days: value.rollup_stale_days,
      // Spread, not a plain key, so the output type keeps `mission_path`
      // genuinely optional (`key?: string`) rather than always-present-but-
      // possibly-undefined — the latter would force every `StoreConfig`
      // object literal in the codebase to add the key just to compile.
      //
      // config-defaults-as-the-convention (D2): an opt-in key, deliberately
      // NOT defaulted. Call sites branch on its presence to decide whether the
      // store has a mission mechanism at all, so defaulting it would switch
      // that on for every store predating it, pointing at a document none has.
      ...(value.mission_path !== undefined ? { mission_path: value.mission_path } : {}),
    };
  });

/**
 * harness-portability spec: the portable skill pack and the guidance
 * documents (a shipped baseline convention file, the operator's own
 * convention files, and the mission document) AGENTS.md's generated
 * sections read from and inline.
 *
 * `skills_path` and `guidance_path` are the only spellings. Their pre-rename
 * names `procedures_path` and `conventions_path` were accepted here as inputs
 * while migrations existed to rewrite them; retire-store-migrations removed
 * both, so a config still carrying either now fails the schema-version gate
 * before it reaches this schema at all.
 */
const HarnessSchema = z
  .object({
    skills_path: z.string().min(1).optional(),
    guidance_path: z.string().min(1).optional(),
    /**
     * compose-store-guidance-documents design.md D6: a size ceiling on
     * AGENTS.md's inlined "Store conventions" section, guarding against
     * unbounded growth now that its content is inlined rather than indexed
     * (inline-conventions-and-mission). A convention key like any other
     * since config-defaults-as-the-convention: the default is declared here
     * rather than applied by the one doctor check that reads it, so the check
     * and the schema cannot disagree about the budget.
     */
    convention_max_bytes: z.number().int().positive().default(SHIPPED_DEFAULTS.harness.convention_max_bytes),
  })
  .transform((value) => {
    /**
     * config-defaults-as-the-convention: a config declining to name either
     * path is a config accepting the shipped one, not an error.
     */
    const skillsPath = value.skills_path ?? SHIPPED_DEFAULTS.harness.skills_path;
    const guidancePath = value.guidance_path ?? SHIPPED_DEFAULTS.harness.guidance_path;
    // Spread, not a plain key, so the output type keeps `convention_max_bytes`
    // genuinely optional (`key?: number`) rather than always-present-but-possibly-undefined
    // (`key: number | undefined`) — the latter would require every existing
    // `StoreConfig` object literal in the codebase to add the key just to compile.
    return {
      skills_path: skillsPath,
      guidance_path: guidancePath,
      convention_max_bytes: value.convention_max_bytes,
    };
  });

/**
 * adapters spec: the one declared-registration mechanism shared by every
 * adapter kind. `module` is reserved for a future third-party-loading path;
 * v1 resolves every entry against the built-in adapter registry by
 * (kind, id).
 */
const AdapterKindSchema = z.enum(['harness-generation']);

const AdapterDeclarationSchema = z.object({
  id: z.string().min(1),
  kind: AdapterKindSchema,
  module: z.string().min(1).optional(),
  /** vendored-craft-skills spec: overrides a harness-generation adapter's declared skillsDir for this store; equal to the configured skills path means no bridge is created. */
  skills_dir: z.string().min(1).optional(),
});

/**
 * Every declaration is validated by `AdapterDeclarationSchema` directly, so
 * an unrecognized `kind` fails loudly.
 *
 * retire-store-migrations (D8): this used to pipe through a looser
 * `z.object({ id, kind, module? })` that filtered out the retired
 * `kind: forge` before strict validation, so a store still declaring it
 * could be read by the migration about to rewrite it. That pre-schema was
 * also silently dropping `skills_dir` — zod strips unknown keys, and the
 * looser object never declared it — so a store's declared override never
 * reached `effectiveSkillsDir`. Removing the filter is what makes
 * `adapters[].skills_dir` work at all.
 */
const AdaptersFieldSchema = z.array(AdapterDeclarationSchema);

export const StoreConfigSchema = z
  .object({
    schema_version: z.number().int().positive(),
    taxonomy: TaxonomySchema,
    // `prefault`, not `default`: it substitutes an INPUT, so the block's own
    // per-key defaults fill it in. `.default({})` would demand a fully
    // resolved output object here and duplicate every value a second time.
    derived: DerivedSchema.prefault({}),
    retrieval: RetrievalSchema.prefault({}),
    git: GitSchema,
    session: SessionSchema.prefault({}),
    write_lifecycle: WriteLifecycleSchema.prefault({}),
    catalog: CatalogSchema.prefault({}),
    publish: PublishSchema.prefault({}),
    templates: TemplatesSchema.prefault({}),
    skills: SkillsSchema.prefault({}),
    update_check: UpdateCheckSchema.prefault({}),
    ingest: IngestSchema.prefault({}),
    organize: OrganizeSchema,
    harness: HarnessSchema.prefault({}),
    adapters: AdaptersFieldSchema.default([...SHIPPED_DEFAULTS.adapters]),
  })
  .passthrough()
  .superRefine((value, ctx) => {
    /**
     * retain-captures-as-provenance (D7): one prefix has to serve both the
     * retrieval exclusion and the write-path gate, which only holds while the
     * inbox is strictly inside the capture root. Unconditional since
     * retire-store-migrations — every config that reaches this refinement is
     * at the supported version, which is exactly what the old version guard
     * tested for. It existed only while migrations had to write configs at
     * earlier versions back to disk.
     */
    if (!isStrictlyUnderPrefix(value.ingest.inbox_path, value.ingest.capture_root)) {
      ctx.addIssue({
        code: 'custom',
        path: ['ingest', 'inbox_path'],
        message: `"${value.ingest.inbox_path}" must be a directory inside capture_root ("${value.ingest.capture_root}")`,
      });
    }
  });

export type StoreConfig = z.infer<typeof StoreConfigSchema>;
export type TaxonomyLayerConfig = z.infer<typeof TaxonomyLayerSchema>;
export type GraphSettingsConfig = z.infer<typeof GraphSettingsSchema>;
export type AdapterDeclaration = z.infer<typeof AdapterDeclarationSchema>;
