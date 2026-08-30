import { z } from 'zod';

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
 */
export const SUPPORTED_SCHEMA_VERSION = 2;

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

const SessionSchema = z.object({
  branch_prefix: z.string().min(1),
  worktrees_path: z.string().min(1),
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

const DisclosureSchema = z.object({
  internal_audiences: z.array(z.string()),
  hard_walls: z.array(HardWallSchema),
});

/** context-ingest spec: where capture lands raw material before ingest stamps identity onto it. */
const IngestSchema = z.object({
  inbox_path: z.string().min(1),
});

/** context-organize spec: archive's destination — independent of taxonomy layers, so it works under any profile. */
const OrganizeSchema = z.object({
  archive_path: z.string().min(1),
});

/**
 * session-capture-command spec (D3): each identity role MAY be bound to its
 * own store-relative path — a store whose runtime keeps memory elsewhere
 * points the role there, and every identity consumer resolves through it.
 * An unbound role falls back to its canonical file under `identity.path`.
 */
const IdentityFilesSchema = z
  .object({
    posture: z.string().min(1).optional(),
    'world-facts': z.string().min(1).optional(),
    'user-facts': z.string().min(1).optional(),
  })
  .default({});

/** agent-identity spec: canonical identity files live here, excluded from every retrieval leg. */
const IdentitySchema = z.object({
  path: z.string().min(1),
  files: IdentityFilesSchema,
  /** session-capture-command spec (D4): the entry delimiter line; '' means an empty (blank) line. */
  entry_delimiter: z.string().default(''),
});

/** harness-portability spec: the portable procedure pack and operator convention docs AGENTS.md's indexes point into. */
const HarnessSchema = z.object({
  procedures_path: z.string().min(1),
  conventions_path: z.string().min(1).default('.contexture/conventions/'),
});

/**
 * adapters spec: the one declared-registration mechanism shared by every
 * adapter kind. `module` is reserved for a future third-party-loading path;
 * v1 resolves every entry against the built-in adapter registry by
 * (kind, id).
 */
const AdapterKindSchema = z.enum(['harness-generation', 'identity-injection', 'forge']);

const AdapterDeclarationSchema = z.object({
  id: z.string().min(1),
  kind: AdapterKindSchema,
  module: z.string().min(1).optional(),
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
    disclosure: DisclosureSchema,
    ingest: IngestSchema,
    organize: OrganizeSchema,
    identity: IdentitySchema,
    harness: HarnessSchema,
    adapters: z.array(AdapterDeclarationSchema),
  })
  .passthrough();

export type StoreConfig = z.infer<typeof StoreConfigSchema>;
export type TaxonomyLayerConfig = z.infer<typeof TaxonomyLayerSchema>;
export type GraphSettingsConfig = z.infer<typeof GraphSettingsSchema>;
export type HardWallConfig = z.infer<typeof HardWallSchema>;
export type AdapterDeclaration = z.infer<typeof AdapterDeclarationSchema>;
