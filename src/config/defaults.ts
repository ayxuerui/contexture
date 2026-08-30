import type { AdapterDeclaration, HardWallConfig } from './schema.js';

/**
 * context-store spec: "The visibility field's frontmatter key is configurable
 * with a shipped default... No specification other than this one SHALL
 * assert the literal key name." This module is that one place, in code —
 * enforced by test/unit/single-source-literals.test.ts. Every other module
 * reads the key via StoreConfig.fields.visibility, never this constant
 * directly, and never the literal "scope" string.
 *
 * "scope" is provisional (design.md D7 / openspec/config.yaml): renaming it
 * is meant to be a config-default change plus a migration, never a spec or
 * code rewrite. Do not let this constant's value leak into any other file.
 */
export const DEFAULT_VISIBILITY_FIELD_KEY = 'lens';

/**
 * The visibility field key every store created before schema_version 2
 * used. Named here, once, purely as history for the rename migration
 * (core/migrations/rename-visibility-field.ts) to read from — this is the
 * one sanctioned place a superseded key value is allowed to live once it's
 * no longer the shipped default.
 */
export const SCHEMA_V1_VISIBILITY_FIELD_KEY = 'scope';

/** context-visibility spec rung 3: what a note's visibility fails closed to. */
export const DEFAULT_VISIBILITY_CONTEXT = 'private';

/**
 * context-store spec (contexture-home-layout): `.contexture/` is the tool's
 * home directory. Only its cache subpath is derived/gitignored — the
 * catalog, identity, and procedure subdirectories are authored-but-tool-
 * owned and stay tracked.
 */
export const DEFAULT_DERIVED_PATHS = ['.contexture/cache/'] as const;

/** agent-identity spec: canonical identity files live here, excluded from every retrieval leg. */
export const DEFAULT_IDENTITY_PATH = '.contexture/identity/';

/**
 * harness-portability spec (entry-doc-generation D5): contexture-owned
 * skills are copied here (`<slug>/SKILL.md`), defaulting to the directory
 * harnesses with skill auto-discovery read — one file, one hop. A store
 * driven by another harness points this at that harness's skills directory.
 */
export const DEFAULT_PROCEDURES_PATH = '.claude/skills/';

/** harness-portability spec (entry-doc-generation): operator-authored convention docs, indexed by AGENTS.md. */
export const DEFAULT_CONVENTIONS_PATH = '.contexture/conventions/';

/** Paths excluded from every retrieval leg by default. */
export const DEFAULT_EXCLUDE_PATHS = ['.contexture/'] as const;

/** graph-context-document spec: no relation vocabulary by default — no typed edges until a store declares names. */
export const DEFAULT_RELATIONS: readonly string[] = [];

/** graph-context-document spec: positional clusters two directory segments deep; document sections capped for readability. */
export const DEFAULT_GRAPH_SETTINGS = {
  cluster_depth: 2,
  hub_top: 8,
  bridge_top: 10,
  orphan_exempt_clusters: [] as string[],
};

/** write-lifecycle spec: session worktrees live under a configured, gitignored path. */
export const DEFAULT_WORKTREES_PATH = '.worktrees/';

/** Branch names for session worktrees are prefixed so they're recognizable and sweep-safe. */
export const DEFAULT_SESSION_BRANCH_PREFIX = 'session/';

/** write-lifecycle spec: pre-commit's diff-size ceiling, in total changed lines. */
export const DEFAULT_DIFF_SIZE_CEILING_LINES = 2000;

/** context-catalog spec: where per-section catalog files live — tracked (never gitignored), since glosses are authored. */
export const DEFAULT_CATALOG_PATH = '.contexture/catalog/';

/** context-catalog spec: a section exceeding this triggers a failing doctor check, not a silent slowdown. */
export const DEFAULT_CATALOG_SECTION_MAX_BYTES = 32 * 1024;

/** disclosure-policy spec: v1 ships with no audiences pre-declared internal, and no hard walls — an explicit, empty starting point the operator opts into. */
export const DEFAULT_INTERNAL_AUDIENCES: readonly string[] = [];
export const DEFAULT_HARD_WALLS: readonly HardWallConfig[] = [];

/** context-ingest spec: capture's landing zone — a normal, retrievable directory, not an exclusion. */
export const DEFAULT_INBOX_PATH = 'inbox/';

/** context-organize spec: archive's destination, decoupled from any taxonomy layer name. */
export const DEFAULT_ARCHIVE_PATH = 'archive/';

/**
 * adapters spec: init registers both shipped builtins by default, so
 * out-of-the-box UX (a PR opened on session submit, a generated CLAUDE.md)
 * keeps working without the operator hand-writing config — each is just as
 * removable from this list as it was addable.
 */
export const DEFAULT_ADAPTERS: readonly AdapterDeclaration[] = [
  { id: 'github', kind: 'forge' },
  { id: 'claude-code', kind: 'harness-generation' },
];

