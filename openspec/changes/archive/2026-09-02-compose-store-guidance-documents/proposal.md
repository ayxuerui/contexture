## Why

`inline-conventions-and-mission` (in flight, not yet archived) fixes AGENTS.md's biggest self-sufficiency gap by inlining operator conventions and the mission document in full, rather than merely referencing them. But it inlines whatever is already at `.contexture/conventions/` — every byte of that content is still operator-authored from scratch. In practice, most of what a new store needs there is generic contexture behavior (visibility resolution and its fail-closed rule, the disclosure ladder, the relation-vocabulary convention, archiving, git/session rules) that every store re-derives and hand-writes identically. The one real store built on contexture (`~/workspace/pkm`) proves this: the bulk of its 293-line conventions file is this same generic material, sitting in a per-store file instead of the tool. Separately, the mission document — despite `organize.mission_path` existing since `generalize-identity-migration-residue` — has no shipped default location, no init-time seed, and (once conventions move to a directory `AGENTS.md`'s own note-listing excludes) no reliable way for `ctxr rollup stale` to find it.

## What Changes

- **BREAKING**: `harness.conventions_path` renames to `harness.guidance_path`, defaulting to `.contexture/guidance/` (was `.contexture/conventions/`) — a clearer name for a directory that now holds more than operator conventions. A migration accepts the old key and, for a store still at the old default, moves the directory; an operator-customized path is preserved verbatim.
- Ships a **baseline convention**: a new package template (`templates/conventions/baseline-convention.md`), rendered from the store's own configuration (the visibility field and its resolution order, the full `directory_defaults` table, the disclosure ladder from `hard_walls`/`internal_audiences`, the configured relation vocabulary, archiving, git/session rules including `ctxr session land`'s canonical-clone auto-sync and the pre-push override, directory-scoped `README.md` conventions) — extracted from the generic material in pkm's conventions file. Synced into `<guidance_path>/baseline-convention.md` at init and refreshed by `ctxr update`, contexture-owned the same way a shipped skill copy is (managed, never hand-edited). `inline-conventions-and-mission`'s existing per-file scan-and-inline mechanism (`scanConventions` → `renderConventionsSection`) picks it up automatically, exactly like any operator file — no separate composition step.
- Seeds an operator-authored **custom convention** file, `<guidance_path>/custom-convention.md`, with heading prompts only (placement distinctions, content style, tags, store context) — no content contexture would be guessing at.
- Gives `organize.mission_path` a shipped default, `<guidance_path>/mission.md`, seeded by `ctxr init` (previously unset/opt-in). Unsetting it still disables both the seed and the staleness rule.
- Fixes `findStaleRollups`'s mission lookup to read the configured path directly rather than searching the in-memory note listing, since the guidance directory (old or new) is excluded from that listing by design.
- Adds a doctor check for AGENTS.md's inlined "Store conventions" section exceeding a configured size budget (`harness.convention_max_bytes`, defaulting to 32 KiB) — inlining removed the natural bound an index provided.

## Non-goals

- **Re-implementing or modifying how conventions/mission are inlined into AGENTS.md.** That mechanism — the per-file scan, heading-demotion, provenance line, drift detection, section reordering, skill-index removal — is `inline-conventions-and-mission`'s, already built, reviewed, and validated against current `main`. This change is strictly additive on top of it: shipping one more (contexture-owned) file into the directory that mechanism already scans, plus the directory rename and mission relocation. No file `inline-conventions-and-mission` owns (`agents-doc.ts`'s renderers, the reordering primitive, the drift checks) changes its own behavior here.
- **Editing `~/workspace/pkm`.** Removing the now-shipped sections from its `vault-conventions.md` and keeping only what's genuinely store-specific is a separate, follow-on change in that repo.
- **Recursive convention scanning.** Directory-scoped `README.md` conventions are named by the baseline convention as a rule to follow, not indexed — `scanDocsDir` stays non-recursive, unchanged from `inline-conventions-and-mission`.
- **Changing the visibility or disclosure field keys.** The baseline template renders whatever `fields.visibility` and the disclosure config currently are; this change neither depends on nor blocks `separate-scope-and-name-the-axes`.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `harness-portability`: adds the baseline-convention-shipping mechanism (a new file type in the guidance directory, contexture-owned, synced like a skill) as an addition to the conventions directory `inline-conventions-and-mission` already scans and inlines.
- `context-organize`: adds the mission document's shipped default location and init-time seeding, and changes the staleness lookup from a note-listing scan to a direct path read.
- `store-integrity`: `doctor`'s minimum check list gains a size ceiling on AGENTS.md's inlined conventions section.

## Impact

- **Config schema** (`src/config/schema.ts`, `src/config/defaults.ts`): `harness.conventions_path` → `harness.guidance_path`; new filename constants; `harness.convention_max_bytes` (optional); `organize.mission_path` gains an init-time default (not a schema-level one — see design.md D3 for why).
- **New migration**: `src/core/migrations/rename-conventions-path.ts`, registered in `src/core/migrations/registry.ts`; `SUPPORTED_SCHEMA_VERSION` 3 → 4.
- **New module**: `src/core/convention-doc.ts` (renders and syncs the baseline file; seeds the custom file).
- **New template**: `templates/conventions/baseline-convention.md`, `templates/conventions/custom-convention-seed.md`.
- **Changed**: `src/core/conventions.ts` (`scanConventions` reads `guidance_path` and excludes the configured mission document by basename), `src/core/rollup.ts` (`findStaleRollups` reads the mission document directly), `src/commands/init.ts` and `src/core/reconcile.ts` (seed/sync ordering ahead of the AGENTS.md conventions section `inline-conventions-and-mission` already builds), `src/core/write-lifecycle/path-gate.ts` and `src/core/notes/list.ts` (the renamed key), a new doctor check (`src/core/checks/harness-portability-checks.ts`).
- **Downstream, out of scope for this change**: `~/workspace/pkm`'s `vault-conventions.md` needs its now-shipped sections removed — tracked as a follow-up.
- **Sequencing**: this change's `context-organize` delta and `inline-conventions-and-mission`'s AGENTS.md mechanism both touch AGENTS.md generation. This change is written as a layer on top of `inline-conventions-and-mission` and should be archived after it, in the same order the two branches were reconciled — see design.md.
