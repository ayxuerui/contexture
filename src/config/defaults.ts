import type { AdapterDeclaration } from './schema.js';

/**
 * context-store spec (contexture-home-layout): `.contexture/` is the tool's
 * home directory. Only its cache subpath is derived/gitignored — the
 * catalog and skill subdirectories are authored-but-tool-owned and stay
 * tracked.
 */
export const DEFAULT_DERIVED_PATHS = ['.contexture/cache/'] as const;

/**
 * harness-portability spec (vendored-craft-skills): the ecosystem's
 * cross-harness canonical skills location — the directory the majority of
 * agent runtimes read natively, with no bridge required. A harness that
 * reads its own branded directory instead (e.g. Claude Code's
 * `.claude/skills/`) gets that directory bridged to this one; see
 * `core/harness/bridge.ts`. A store driven by no auto-discovering harness
 * can still point this anywhere.
 */
export const DEFAULT_SKILLS_PATH = '.agents/skills/';

/**
 * harness-portability spec (vendored-craft-skills): the shipped vendored skill
 * set, installed by default and refreshed by update — one skill per craft axis
 * a published page needs and contexture supplies none of (its visual form; the
 * prose that explains its subject to a reader).
 *
 * Appended, never sorted in: the notices order, the paths init stages, and a
 * store's rendered configuration all follow this order, so growing the set is
 * a pure insertion rather than a reshuffle.
 */
export const DEFAULT_VENDORED_SKILLS = ['frontend-design', 'eli5'] as const;

/**
 * harness-portability spec: the guidance directory holding contexture's
 * shipped baseline convention file, the operator's own convention files
 * (inlined into AGENTS.md's "Store conventions" section — see
 * agents-doc.ts, from inline-conventions-and-mission), and (per
 * context-organize) the mission document.
 */
export const DEFAULT_GUIDANCE_PATH = '.contexture/guidance/';

/** The shipped, contexture-owned baseline conventions — never hand-edited; refreshed by `ctxr update` like a skill copy. */
export const DEFAULT_BASELINE_CONVENTIONS_FILE_NAME = 'baseline-conventions.md';

/**
 * The baseline file's pre-rename name. `syncBaselineConventions` removes it
 * when it still carries the managed-owner header, so the rename leaves no
 * orphan — the guidance directory is scanned wholesale, so an orphan would
 * be inlined into AGENTS.md a second time rather than merely sitting unused.
 */
export const LEGACY_BASELINE_CONVENTION_FILE_NAME = 'baseline-convention.md';

/**
 * The operator-authored conventions file seeded at init: this store's house
 * rules, layered on the shipped baseline and winning where the two speak to
 * the same thing.
 */
export const DEFAULT_HOUSE_CONVENTIONS_FILE_NAME = 'house-conventions.md';

/** context-organize spec: the store's standing current-state document's filename, under the guidance directory. */
export const DEFAULT_MISSION_FILE_NAME = 'mission.md';

/** context-organize spec: `organize.mission_path`'s shipped default — every store gets a mission document from `init` onward, seeded there. */
export const DEFAULT_MISSION_PATH = `${DEFAULT_GUIDANCE_PATH}${DEFAULT_MISSION_FILE_NAME}`;

/** store-integrity spec: AGENTS.md's inlined "Store conventions" section's size ceiling when `harness.convention_max_bytes` is unset. */
export const DEFAULT_CONVENTION_MAX_BYTES = 32 * 1024;

/** Paths excluded from every retrieval leg by default. */
export const DEFAULT_EXCLUDE_PATHS = ['.contexture/'] as const;

/**
 * compose-the-retrieval-pass spec (D10/D11): path prefixes that stay fully
 * retrievable but sort after everything else. Empty here because the shipped
 * value is not a literal — `init` seeds it from the taxonomy's own resolved
 * archive destination, so a custom taxonomy demotes its archive, not PARA's.
 */
export const DEFAULT_DEMOTE_PATHS: readonly string[] = [];

/** compose-the-retrieval-pass spec: how many notes `ctxr context gather` returns before it reports truncation. */
export const DEFAULT_GATHER_MAX_NOTES = 50;

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

/** publish spec: where published pages live — tracked, authored-but-tool-owned, excluded from retrieval like the catalog and skill pack. */
export const DEFAULT_PUBLISH_PATH = '.contexture/publish/';

/** context-ingest spec: capture's landing zone — a normal, retrievable directory, not an exclusion. */
export const DEFAULT_INBOX_PATH = 'inbox/';

/** store-primitives-from-migration-audit spec (D2): the shipped tracking-parameter list source check strips before comparing URL identities. */
export const DEFAULT_TRACKING_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid'];

/**
 * context-organize spec: archive's destination, decoupled from any taxonomy
 * layer name. This is the fallback for a taxonomy that declares none of its
 * own — a shipped profile with a retirement layer (PARA's Archives) supplies
 * its `archiveDestination` at init instead, so a PARA store is never born
 * pointing at a directory its own taxonomy doesn't declare.
 */
export const DEFAULT_ARCHIVE_DESTINATION = 'archive/';

/** store-primitives-from-migration-audit spec (D4): grace period, in days, before a stale rollup is reported. */
export const DEFAULT_ROLLUP_STALE_DAYS = 7;

/**
 * adapters spec: init registers the shipped builtin by default, so
 * out-of-the-box UX (a generated CLAUDE.md) keeps working without the
 * operator hand-writing config — it is just as removable from this list as
 * it was addable.
 */
export const DEFAULT_ADAPTERS: readonly AdapterDeclaration[] = [{ id: 'claude-code', kind: 'harness-generation' }];

