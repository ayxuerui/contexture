import type { HardWallConfig } from './schema.js';

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
export const DEFAULT_VISIBILITY_FIELD_KEY = 'scope';

/** context-visibility spec rung 3: what a note's visibility fails closed to. */
export const DEFAULT_VISIBILITY_CONTEXT = 'private';

/** context-store spec: derived paths declared in contexture.yaml, gitignored by init. */
export const DEFAULT_DERIVED_PATHS = ['.contexture/'] as const;

/** Paths excluded from every retrieval leg by default. */
export const DEFAULT_EXCLUDE_PATHS = ['.contexture/', 'identity/'] as const;

/** write-lifecycle spec: session worktrees live under a configured, gitignored path. */
export const DEFAULT_WORKTREES_PATH = '.worktrees/';

/** Branch names for session worktrees are prefixed so they're recognizable and sweep-safe. */
export const DEFAULT_SESSION_BRANCH_PREFIX = 'session/';

/** write-lifecycle spec: pre-commit's diff-size ceiling, in total changed lines. */
export const DEFAULT_DIFF_SIZE_CEILING_LINES = 2000;

/** context-catalog spec: where per-section catalog files live — tracked (never gitignored), since glosses are authored. */
export const DEFAULT_CATALOG_PATH = 'catalog/';

/** context-catalog spec: a section exceeding this triggers a failing doctor check, not a silent slowdown. */
export const DEFAULT_CATALOG_SECTION_MAX_BYTES = 32 * 1024;

/** disclosure-policy spec: v1 ships with no audiences pre-declared internal, and no hard walls — an explicit, empty starting point the operator opts into. */
export const DEFAULT_INTERNAL_AUDIENCES: readonly string[] = [];
export const DEFAULT_HARD_WALLS: readonly HardWallConfig[] = [];

/** context-ingest spec: capture's landing zone — a normal, retrievable directory, not an exclusion. */
export const DEFAULT_INBOX_PATH = 'inbox/';

