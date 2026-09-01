## Context

See proposal.md - Why. This design was built in two passes: an initial version implemented independently, then reconciled against `inline-conventions-and-mission` — an already-open PR (#26), opened separately hours earlier, that inlines the same conventions/mission directory in full into `AGENTS.md`. Both changes started from the same base commit. Rather than land as two competing rewrites of `agents-doc.ts`, `conventions.ts`, and the same templates, this change was rebuilt to sit strictly on top of the other's already-validated mechanism (confirmed by rebasing it onto current `main` and running the full suite clean before starting).

What `inline-conventions-and-mission` already owns, unmodified by this change:
- `src/core/conventions.ts`'s `inlineDocBody`/`extractDocMetadata` (heading demotion, fence-marker stripping, `body` field).
- `src/core/agents-doc.ts`'s `renderConventionsSection`/`renderConventionBlock`/`renderMissionSection`, the `AGENTS_MD_MISSION_FENCE`, `checkAgentsMdDrift`, and `AGENTS_MD_SECTION_ORDER`/`reorderFencedRegionsInFile`.
- The doctor/pre-commit drift checks (`agentsMdInlinedContentCurrentCheck`, `stagedAgentsMdInlinedContentCurrentCheck`) and `verify --portable`'s rewritten steps.
- The skill index's removal from `AGENTS.md` (unrelated to this change's scope).

What this change adds, all additive on top of that:
- The guidance-directory rename (`harness.conventions_path` → `harness.guidance_path`) and its migration.
- A shipped, contexture-owned baseline convention file.
- Mission's default location, init-time seed, and a direct-path staleness lookup (mission-inlining itself is `inline-conventions-and-mission`'s).
- A size-ceiling doctor check, since inlining removed the index's natural size bound.

## Goals / Non-Goals

**Goals:**
- Zero duplication of `inline-conventions-and-mission`'s mechanism — every file this change touches either is untouched by that PR, or gets a small, additive, config-key-rename-shaped edit to it.
- The baseline convention participates in the *existing* scan-and-inline mechanism as an ordinary file — no second composition step, no parallel rendering path.
- Every store, not just an operator who opts in, gets a mission document from `init` onward.

**Non-Goals:**
- Anything already covered in proposal.md's Non-goals.
- Reordering, drift-checking, or otherwise touching the *mechanism* by which conventions/mission become part of `AGENTS.md` — see Context above.

## Decisions

**D1 — Build strictly on top of `inline-conventions-and-mission`, not around it.** Considered opening this as an independent, competing PR and letting the two reconcile at merge time. Rejected: both touch `agents-doc.ts`'s conventions/mission rendering, `conventions.ts`'s scan function, and the same two templates — landing either first would leave the other needing a substantial, avoidable rewrite anyway. Rebasing `inline-conventions-and-mission` onto current `main` first and validating it there — clean typecheck, clean build, full test suite green, before this change's own edits began — turned "is the thing I'm building on solid" from an assumption into a checked fact.

**D2 — Folder: `.contexture/guidance/`, not `conventions/` or `context/`.** Unchanged from the original design: `conventions/` would leave a mission document sitting in a folder named for something it isn't; `context/` collides with this codebase's own "named context" visibility vocabulary.

**D3 — No composition step; the baseline file is just another scanned file.** The original (pre-reconciliation) design composed a baseline template and an operator file into one generated `convention.md`, then inlined *that*. Once `inline-conventions-and-mission` already scans every file in the directory and inlines each under its own heading with a provenance line, that composition step became pure duplication of a mechanism that already exists and is better-tested (it also handles heading demotion, fence-marker stripping, and drift detection generically). The baseline file is now delivered exactly like a shipped skill copy — a single managed file, synced by `syncBaselineConvention` (parallel to, but far simpler than, `syncShippedSkills`) — and the existing `scanConventions`/`renderConventionsSection` do the rest.

**D4 — `organize.mission_path` keeps its schema-level `.optional()`, no `.default()`.** A zod `.default()` on a field with no existing value makes the field non-optional in `StoreConfig`'s TS *output* type (present but possibly `undefined`), not merely absent-with-a-fallback — every one of the ~40 test fixtures across the codebase that construct a `StoreConfig` literal without that key would then fail to typecheck, a disproportionate cascade for a config-default change. The same problem was hit and solved the same way for the new `harness.convention_max_bytes` field: return it from `HarnessSchema`'s `.transform()` via a conditional spread (`...(value !== undefined ? {key: value} : {})`) rather than a plain key, which keeps the TS output type genuinely optional (`key?: T`) rather than always-present-but-possibly-undefined (`key: T | undefined`). `organize.mission_path`'s default is instead applied once, at the point `ctxr init` builds a *new* store's config object — the same mechanism every other init-time default (`archive_path`, etc.) already uses, none of which have a zod-level default either.

**D5 — Mission's default location and seeding are new; mission's *inlining into AGENTS.md* is untouched.** `inline-conventions-and-mission` already renders the mission section fully — this change only decides *where* the mission document defaults to living and that `init` seeds it. `findStaleRollups`'s lookup-by-path fix is required regardless of that PR, since moving the default under `.contexture/guidance/` (a directory the note listing excludes) breaks its previous array-lookup, independent of how the content later gets inlined.

**D6 — Size ceiling targets the rendered AGENTS.md section, not a standalone file.** The original design measured a standalone composed `convention.md`'s file size. With no such file in the reconciled design, the ceiling instead measures the byte size of `inline-conventions-and-mission`'s own `AGENTS_MD_CONVENTIONS_FENCE` region (via the already-exported `readFencedRegionFromFile`) against `harness.convention_max_bytes`, defaulting to `DEFAULT_CONVENTION_MAX_BYTES` (32 KiB, matching `catalog.section_max_bytes`'s precedent value). This measures the actual thing that could make `AGENTS.md` unwieldy — the sum of every inlined file, not just the shipped one.

**D7 — One deliberate exception to D1: the two-template shape (`store-conventions.md` / `store-conventions-empty.md`) and the `store-conventions` fence name were folded/renamed after landing, not left untouched.** Two templates existed only to swap one middle paragraph and whether a body slot had content — the same shape `renderMissionPointer`/`substituteBlock`'s empty-list-vanishes mechanic already handles elsewhere in this codebase for optional content in a shared template. Collapsed to one `conventions.md` with a single `__CONVENTION_BODY__` slot; `conventionsBody()` computes either branch's lines in code. This removes a whole file and the test that existed purely to keep the two copies' trailing paragraph from drifting apart — that risk is now structurally impossible rather than merely tested for. The fence itself was renamed `store-conventions` → `conventions` in the same pass, dropping a redundant prefix no sibling fence carries (`canonical`, `placement`, `mission`). Fence names are this codebase's "forever compatibility surface" (see `markers.ts`), so this is not free: `reconcile.ts` gains a one-time `RETIRED_AGENTS_MD_STORE_CONVENTIONS_FENCE` cleanup, the same shape as the existing identity-fence retirement, removing the orphaned old marker from any store (including `~/workspace/pkm`, already migrated once in this change's own rollout) on its next `ctxr update`. Byte-output is otherwise unchanged — verified by keeping the exact-output tests for both branches.

## Risks / Trade-offs

- **[Risk] `inline-conventions-and-mission` changes before it merges** (it is, as of this writing, an open PR, not yet reviewed) → **Mitigation**: this change was validated against a rebase of that PR's exact commit onto current `main`; if the PR's implementation changes materially before merging, this change's dependency on `scanConventions`/`renderConventionsSection`'s exact shape may need a follow-up pass, but the *design* dependency (baseline file is just another scanned file) is robust to minor implementation changes.
- **[Risk] Mission becomes standard rather than opt-in** — every store now carries a `mission.md` from `init` onward. → **Mitigation**: unsetting `organize.mission_path` fully disables seeding and staleness; this is a default flip, not a removed escape hatch.
- **[Trade-off] The baseline file and the operator's custom file look identical in the guidance directory** (both are plain `.md` files) except for the managed-header HTML comment inside the baseline file's body — same trade-off the skills pack already makes.

## Migration Plan

1. Config: rename `harness.conventions_path` → `harness.guidance_path` with the old-key-accepted transform (schema.ts precedent: `rename-procedures-path`'s `HarnessSchema` handling); add `harness.convention_max_bytes` (optional).
2. Migration `0004-rename-conventions-path-to-guidance-path`: config-delta only; where the stored value equals the old default, moves the directory (plain filesystem rename — migrations have no `GitRunner`) and rewrites the config value; an operator-customized path is preserved verbatim.
3. Ship the baseline template and `syncBaselineConvention`; seed the custom-convention file; wire both into `init` and `reconcile` ahead of `inline-conventions-and-mission`'s existing `buildAgentsConventionsSection`/`buildAgentsMissionSection` calls (ordering constraint: those read the guidance directory, so its contents must be current first).
4. Move the mission default and its init seed; fix the staleness lookup in `findStaleRollups`.
5. Add the size-ceiling doctor check.

No data migrates destructively: an operator's existing convention files are untouched, just relocated by the directory-rename migration; content itself is never rewritten by that migration.
