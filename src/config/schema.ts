import { z } from 'zod';
import { isStrictlyUnderPrefix } from '../core/fs/prefix.js';
import { SHIPPED_DEFAULTS } from './defaults.js';

/**
 * store-lifecycle spec: schema_version versions STORE STATE (config shape +
 * note frontmatter conventions) — a monotonic integer independent of the npm
 * package version — not "what this CLI release happens to be."
 */
/**
 * Bumped to 2 by the visibility-field key rename migration (store-lifecycle
 * spec task 9.2). Both that field and the config key naming it were removed
 * at schema 7 (see below); the migration survives only to keep the 1 -> 2
 * step in the chain intact.
 *
 * Bumped to 3 by the procedures-to-skills key rename migration
 * (rename-procedures-to-skills, 0003-rename-procedures-path-to-skills):
 * `harness.procedures_path` -> `harness.skills_path`. HarnessSchema's
 * transform accepts the old key through this version so an unmigrated
 * store still loads (see schema.ts's HarnessSchema comment).
 *
 * Bumped to 4 by the conventions-to-guidance key rename migration
 * (rename-conventions-path-to-guidance-path, 0004-rename-conventions-path-to-guidance-path):
 * `harness.conventions_path` -> `harness.guidance_path`. HarnessSchema's
 * transform accepts the old key through this version too, the same way.
 */
/**
 * Bumped to 7 on main by the explanation-craft-skill migration
 * (vendor-explanation-craft-skill, 0007-add-explanation-craft-skill), which
 * pins its own local SCHEMA_VERSION and is unaffected by later bumps here.
 *
 * Bumped to 8 by the access-axis removal (retire-the-access-axes,
 * drop-access-axes): the `visibility:` and `disclosure:` blocks and the
 * `fields:` block that named the visibility frontmatter key are all gone.
 * Unlike the rename migrations above, nothing here is accepted loosely for
 * an older store — `noUnrecognizedConfigKeysCheck` derives from this
 * schema's shape, so an unmigrated store fails `doctor` on the three stale
 * keys until `ctxr migrate` drops them, exactly as `identity` did when
 * remove-agent-identity retired it.
 */
/**
 * Bumped to 9 by the capture-tier change (retain-captures-as-provenance,
 * retain-captures-as-provenance): `ingest.capture_root` is added and
 * `ingest.inbox_path`'s shipped default moves inside it. IngestSchema accepts
 * a config with no `capture_root` so an unmigrated store still loads —
 * `ctxr migrate` has to be able to read the file it is about to rewrite —
 * and skips the nesting rule for exactly that case.
 */
export const SUPPORTED_SCHEMA_VERSION = 10;

/** The version at which the capture tier became part of the store's shape, and its nesting rule enforceable. */
export const CAPTURE_TIER_SCHEMA_VERSION = 9;

/**
 * Bumped to 10 by config-defaults-as-the-convention: every convention key now
 * carries its shipped default here, and a written config omits what it agrees
 * with. Nothing about the shape got stricter — the bump exists so the pruning
 * migration has a `schema_version <` predicate to decide it still has work,
 * the same way every migration in this repo does.
 */

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
const SkillsSchema = z.object({
  vendored: z.array(z.string()).default([...SHIPPED_DEFAULTS.skills.vendored]),
});

/**
 * context-ingest spec: the capture tier. `capture_root` is the retained
 * ledger's root and `inbox_path` is the not-yet-ingested state inside it.
 *
 * Both paths carry the shipped convention as a schema default, so a config
 * written before schema 9 still parses — `ctxr migrate` has to be able to
 * read the file it is about to rewrite. The rule that the inbox sits inside
 * the capture root lives on StoreConfigSchema instead of here, since it is a
 * schema-9 invariant and only that scope can see the version.
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
 * archive-destination-from-taxonomy migration (0006): `archive_destination`
 * is the current key; `archive_path` is its pre-migration name, accepted
 * here so a store on schema 5 still loads. Like `harness.guidance_path` and
 * unlike `harness.skills_path`, this key always had a workable default, so
 * an unmigrated store loads silently onto that default rather than erroring
 * — `ctxr migrate` rewrites the key (and, for a profile that declares a
 * destination, the value) but nothing breaks before it runs.
 *
 * The transform below is the ONLY place the old spelling is read — every
 * other consumer sees `config.organize.archive_destination` and nothing
 * else, so `archive_path` never leaks past config loading.
 */
const OrganizeSchema = z
  .object({
    archive_destination: z.string().min(1).optional(),
    archive_path: z.string().min(1).optional(),
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
    const archiveDestination = value.archive_destination ?? value.archive_path;
    if (archiveDestination === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['archive_destination'],
        message:
          'organize.archive_destination is missing. It is resolved from the store taxonomy at init rather than defaulted, so declare it explicitly (or run `ctxr migrate` if this store predates the key).',
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
 * rename-procedures-to-skills migration (0003): `skills_path` is the
 * current key; `procedures_path` is its pre-migration name, accepted here
 * so a store on schema 2 still loads (with a message pointing at `ctxr
 * migrate`, not a raw shape-validation error) rather than failing the
 * moment this schema starts requiring the new key.
 *
 * rename-conventions-path-to-guidance-path migration (0004): `guidance_path`
 * is the current key; `conventions_path` is its pre-migration name. Unlike
 * `skills_path`, this key always had a workable default, so an unmigrated
 * store loads silently onto that default rather than erroring — `ctxr
 * migrate` moves the directory and rewrites the key, but nothing breaks if
 * it hasn't run yet.
 *
 * The transform below is the ONLY place any of these spellings is read —
 * every other consumer in the codebase sees `config.harness.skills_path` /
 * `config.harness.guidance_path` and nothing else, so no old key ever leaks
 * past config loading.
 */
const HarnessSchema = z
  .object({
    skills_path: z.string().min(1).optional(),
    procedures_path: z.string().min(1).optional(),
    guidance_path: z.string().min(1).optional(),
    conventions_path: z.string().min(1).optional(),
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
     * config-defaults-as-the-convention: the pre-rename spellings are still
     * read first, so an unmigrated store keeps the path it declared. What
     * changed is the end of the chain — absent under BOTH spellings used to
     * raise a custom "run `ctxr migrate`" error, but an unmigrated store HAS
     * `procedures_path` and never reached it. What it actually rejected was a
     * config declining to name a skills path, which is now a config that
     * accepts the shipped one.
     */
    const skillsPath = value.skills_path ?? value.procedures_path ?? SHIPPED_DEFAULTS.harness.skills_path;
    const guidancePath = value.guidance_path ?? value.conventions_path ?? SHIPPED_DEFAULTS.harness.guidance_path;
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
 * session-keeps-only-what-git-cannot-do (D2): removing the `forge` kind
 * outright would make a store still declaring `{ kind: forge }` fail to
 * load at all — a shape error, not a migration opportunity — since
 * `readConfig` runs this schema before `ctxr migrate` can act. Mirrors
 * `HarnessSchema`'s fallback-transform precedent: accept the legacy shape
 * loosely, drop it here, and let the schema_version < 5 migration rewrite
 * the YAML on disk. Any OTHER unrecognized kind is a genuine error and
 * still fails loudly against `AdapterDeclarationSchema` below.
 */
const AdaptersFieldSchema = z
  .array(z.object({ id: z.string().min(1), kind: z.string().min(1), module: z.string().min(1).optional() }))
  .transform((declarations) => declarations.filter((d) => d.kind !== 'forge'))
  .pipe(z.array(AdapterDeclarationSchema));

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
    skills: SkillsSchema.prefault({}),
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
     * inbox is strictly inside the capture root. Gated on the version that
     * introduced the capture tier — a store still on an older schema has a
     * `capture_root` this schema defaulted in, not one it declared, and
     * migrations of earlier versions must be able to write their configs
     * back untouched.
     */
    if (value.schema_version < CAPTURE_TIER_SCHEMA_VERSION) return;
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
