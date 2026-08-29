import { z } from 'zod';

/**
 * store-lifecycle spec: schema_version versions STORE STATE (config shape +
 * note frontmatter conventions) — a monotonic integer independent of the npm
 * package version — not "what this CLI release happens to be."
 */
export const SUPPORTED_SCHEMA_VERSION = 1;

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
});

const DerivedSchema = z.object({
  paths: z.array(z.string()),
});

const RetrievalSchema = z.object({
  exclude_paths: z.array(z.string()),
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

const WriteLifecycleSchema = z.object({
  diff_size_ceiling_lines: z.number().int().positive(),
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
  audience: z.string().min(1),
  /** Omitted means the wall applies to every note. */
  note_path_prefix: z.string().min(1).optional(),
  verdict: z.enum(['allow', 'deny']),
});

const DisclosureSchema = z.object({
  internal_audiences: z.array(z.string()),
  hard_walls: z.array(HardWallSchema),
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
  })
  .passthrough();

export type StoreConfig = z.infer<typeof StoreConfigSchema>;
export type TaxonomyLayerConfig = z.infer<typeof TaxonomyLayerSchema>;
export type HardWallConfig = z.infer<typeof HardWallSchema>;
