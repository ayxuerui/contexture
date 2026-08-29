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
