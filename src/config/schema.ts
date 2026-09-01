import { z } from 'zod';
import { DEFAULT_PUBLISH_PATH, DEFAULT_VENDORED_SKILLS } from './defaults.js';

/**
 * store-lifecycle spec: schema_version versions STORE STATE (config shape +
 * note frontmatter conventions) — a monotonic integer independent of the npm
 * package version — not "what this CLI release happens to be."
 */
/**
 * Bumped to 2 by the visibility-field key rename migration (store-lifecycle
 * spec task 9.2) — proof that renaming DEFAULT_VISIBILITY_FIELD_KEY really
 * is "a config-default change plus a migration, never a spec or code
 * rewrite" (design.md D7): every consumer already reads
 * config.fields.visibility, never a literal key, so nothing else changed.
 *
 * Bumped to 3 by the procedures-to-skills key rename migration
 * (rename-procedures-to-skills, 0003-rename-procedures-path-to-skills):
 * `harness.procedures_path` -> `harness.skills_path`. HarnessSchema's
 * transform accepts the old key through this version so an unmigrated
 * store still loads (see schema.ts's HarnessSchema comment).
 */
export const SUPPORTED_SCHEMA_VERSION = 3;

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

/**
 * Loose (passthrough), not strict: a later phase adding its own field key
 * (e.g. audience tagging) must not force every existing store through a
 * migration just to keep loading. schema_version bumps only on a genuinely
 * incompatible change, never on an additive one.
 */
const FieldsSchema = z
  .object({
    visibility: z.string().min(1),
  })
  .passthrough();

const VisibilitySchema = z.object({
  default_context: z.string().min(1),
  directory_defaults: z.record(z.string(), z.string()).default({}),
  /**
   * context-visibility spec (visibility-contexts-and-wall-verdicts): which
   * visibility VALUES each named context can see. A context with no entry
   * sees exactly its own value (identity default) — so an unconfigured
   * store behaves byte-identically to the equality matching this replaced,
   * and an unknown context fails closed to that same identity match.
   */
  contexts: z.record(z.string(), z.array(z.string())).default({}),
});

const DerivedSchema = z.object({
  paths: z.array(z.string()),
});

/**
 * graph-context-document spec: the graph document's knobs. Clusters are
 * positional (the first `cluster_depth` directory segments), never nominal,
 * so no layer name is involved; `orphan_exempt_clusters` keeps a
 * deliberately unlinked cluster out of the document without touching the
 * orphan lint check.
 */
const GraphSettingsSchema = z.object({
  cluster_depth: z.number().int().positive().default(2),
  hub_top: z.number().int().positive().default(8),
  bridge_top: z.number().int().positive().default(10),
  orphan_exempt_clusters: z.array(z.string()).default([]),
});

const RetrievalSchema = z.object({
  exclude_paths: z.array(z.string()),
  /** graph-context-document spec: relation names whose section headings type the wikilinks under them; empty = no typed edges. */
  relations: z.array(z.string().min(1)).default([]),
  graph: GraphSettingsSchema.default({ cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] }),
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

/**
 * write-lifecycle spec: `workspaces_external: true` marks a store whose
 * session worktrees are created/removed by a process outside `ctxr` (e.g. an
 * external agent-runtime WebUI) — `ctxr session reap` refuses to run rather
 * than touch a worktree it does not own. Defaults to `false`, the prior
 * behavior, for every store that does not set it.
 */
const SessionSchema = z.object({
  branch_prefix: z.string().min(1),
  worktrees_path: z.string().min(1),
  workspaces_external: z.boolean().default(false),
});

/** session-capture-command spec (D5): declaring any path here turns the sanctioned-location gate on; empty (the default) leaves every in-store path accepted. */
const WriteLifecycleSchema = z.object({
  diff_size_ceiling_lines: z.number().int().positive(),
  writable_paths: z.array(z.string()).default([]),
});

const CatalogSchema = z.object({
  path: z.string().min(1),
  section_max_bytes: z.number().int().positive(),
});

/**
 * publish spec (design.md): unlike every other tool-owned path field, this one is
 * schema-optional with a default — a `contexture.yaml` written before this field
 * existed has no `publish:` key at all, and `readConfig`'s strict `safeParse` has
 * no default-merging, so a required field here would break every pre-existing
 * store. `init` still writes it explicitly for a freshly generated config.
 */
const PublishSchema = z.object({
  path: z.string().min(1).default(DEFAULT_PUBLISH_PATH),
});

/**
 * harness-portability spec (vendored-craft-skills): which vendored
 * third-party skills a store wants, defaulting to the shipped set so a
 * `contexture.yaml` predating this key still parses. An empty list opts
 * out entirely — same schema-optional-with-default shape as `publish`.
 */
const SkillsSchema = z.object({
  vendored: z.array(z.string()).default([...DEFAULT_VENDORED_SKILLS]),
});

/**
 * disclosure-policy spec: "v1 keeps the disclosure ladder's shape with a
 * flat, user-defined value list" (design.md) — no registry syntax, just a
 * flat set of audience names the operator considers internal, and a flat
 * list of hard-wall rules evaluated before any tag or visibility rung.
 */
const HardWallSchema = z.object({
  /** A named audience, or "*" to match every audience. */
  audience: z.string().min(1),
  /** Omitted means the wall applies to every note. */
  note_path_prefix: z.string().min(1).optional(),
  /** Audiences this wall does NOT apply to — evaluation falls through to later rungs for them. */
  except: z.array(z.string()).optional(),
  verdict: z.enum(['allow', 'deny', 'ask']),
});

/** store-primitives-from-migration-audit spec (D3): a context's marker patterns for the leak scan; empty (the default) makes the scan a no-op. */
const DisclosureSchema = z.object({
  internal_audiences: z.array(z.string()),
  hard_walls: z.array(HardWallSchema),
  leak_markers: z.record(z.string(), z.array(z.string())).default({}),
});

/** context-ingest spec: where capture lands raw material before ingest stamps identity onto it. */
const IngestSchema = z.object({
  inbox_path: z.string().min(1),
  /** store-primitives-from-migration-audit spec (D2): query parameters stripped when canonicalizing a URL source identity, in addition to the shipped defaults. */
  tracking_params: z
    .array(z.string())
    .default(['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid']),
});

/** context-organize spec: archive's destination — independent of taxonomy layers, so it works under any profile. */
const OrganizeSchema = z.object({
  archive_path: z.string().min(1),
  /** store-primitives-from-migration-audit spec (D4): the grace period, in days, before a stale rollup is reported — bounds noise from a backlink edited moments ago. */
  rollup_stale_days: z.number().int().nonnegative().default(7),
  /**
   * context-organize spec: the store's standing current-state document
   * (priorities, active builds, back burner, sunset candidates, debt).
   * Unset by default — no mission mechanism until an operator opts in.
   * Content is written via `ctxr rollup write` exactly like an entity
   * rollup; `ctxr rollup stale` reports this one path stale on elapsed
   * time rather than backlinks (see `checkMissionStaleness`).
   */
  mission_path: z.string().min(1).optional(),
});

/**
 * harness-portability spec: the portable skill pack and operator convention
 * docs AGENTS.md's indexes point into.
 *
 * rename-procedures-to-skills migration (0003): `skills_path` is the
 * current key; `procedures_path` is its pre-migration name, accepted here
 * so a store on schema 2 still loads (with a message pointing at `ctxr
 * migrate`, not a raw shape-validation error) rather than failing the
 * moment this schema starts requiring the new key. The transform below is
 * the ONLY place either spelling is read — every other consumer in the
 * codebase sees `config.harness.skills_path` and nothing else, so the old
 * key never leaks past config loading.
 */
const HarnessSchema = z
  .object({
    skills_path: z.string().min(1).optional(),
    procedures_path: z.string().min(1).optional(),
    conventions_path: z.string().min(1).default('.contexture/conventions/'),
  })
  .transform((value, ctx) => {
    const skillsPath = value.skills_path ?? value.procedures_path;
    if (skillsPath === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['skills_path'],
        message: 'harness.skills_path is missing. If this store predates the skills-path rename, run `ctxr migrate`.',
      });
      return z.NEVER;
    }
    return { skills_path: skillsPath, conventions_path: value.conventions_path };
  });

/**
 * adapters spec: the one declared-registration mechanism shared by every
 * adapter kind. `module` is reserved for a future third-party-loading path;
 * v1 resolves every entry against the built-in adapter registry by
 * (kind, id).
 */
const AdapterKindSchema = z.enum(['harness-generation', 'forge']);

const AdapterDeclarationSchema = z.object({
  id: z.string().min(1),
  kind: AdapterKindSchema,
  module: z.string().min(1).optional(),
  /** vendored-craft-skills spec: overrides a harness-generation adapter's declared skillsDir for this store; equal to the configured skills path means no bridge is created. */
  skills_dir: z.string().min(1).optional(),
});

export const StoreConfigSchema = z
  .object({
    schema_version: z.number().int().positive(),
    taxonomy: TaxonomySchema,
    fields: FieldsSchema,
    visibility: VisibilitySchema,
    derived: DerivedSchema,
    retrieval: RetrievalSchema,
    git: GitSchema,
    session: SessionSchema,
    write_lifecycle: WriteLifecycleSchema,
    catalog: CatalogSchema,
    publish: PublishSchema.default({ path: DEFAULT_PUBLISH_PATH }),
    skills: SkillsSchema.default({ vendored: [...DEFAULT_VENDORED_SKILLS] }),
    disclosure: DisclosureSchema,
    ingest: IngestSchema,
    organize: OrganizeSchema,
    harness: HarnessSchema,
    adapters: z.array(AdapterDeclarationSchema),
  })
  .passthrough();

export type StoreConfig = z.infer<typeof StoreConfigSchema>;
export type TaxonomyLayerConfig = z.infer<typeof TaxonomyLayerSchema>;
export type GraphSettingsConfig = z.infer<typeof GraphSettingsSchema>;
export type HardWallConfig = z.infer<typeof HardWallSchema>;
export type AdapterDeclaration = z.infer<typeof AdapterDeclarationSchema>;
