## 1. Reconciliation and config

- [x] 1.1 Rebase `inline-conventions-and-mission` (PR #26) onto current `main` locally, resolve the trivial version-bump conflicts (`package.json`, `package-lock.json`, `src/version.ts`), and validate it clean (typecheck, build, full test suite) before building on top of it.
- [x] 1.2 Rename `harness.conventions_path` to `harness.guidance_path` in `src/config/schema.ts`'s `HarnessSchema`, accepting the old key via the same transform pattern `skills_path`/`procedures_path` already uses.
- [x] 1.3 Add `harness.convention_max_bytes` (optional, no schema-level default) via a conditional-spread return from the transform, so the field stays genuinely optional in `StoreConfig`'s TS type.
- [x] 1.4 In `src/config/defaults.ts`, replace `DEFAULT_CONVENTIONS_PATH` with `DEFAULT_GUIDANCE_PATH`; add `DEFAULT_BASELINE_CONVENTION_FILE_NAME`, `DEFAULT_CUSTOM_CONVENTION_FILE_NAME`, `DEFAULT_MISSION_FILE_NAME`, `DEFAULT_MISSION_PATH`, `DEFAULT_CONVENTION_MAX_BYTES`.
- [x] 1.5 Write `src/core/migrations/rename-conventions-path.ts` (config-delta plus a plain filesystem directory move when the store sat at the old default) and register it in `src/core/migrations/registry.ts`; bump `SUPPORTED_SCHEMA_VERSION` to 4.
- [x] 1.6 Update every reference to `conventions_path` across source (`src/core/conventions.ts`, `src/core/agents-doc.ts`, `src/core/checks/integrity-checks.ts`, `src/core/notes/list.ts`, `src/core/write-lifecycle/path-gate.ts`) and every test fixture.
- [x] 1.7 Verify: `npm run typecheck && npx vitest run test/unit/migrations.test.ts test/unit/migrate-command.test.ts --exclude '**/.claude/**'`

## 2. Shipped baseline and custom convention

- [x] 2.1 Write `templates/conventions/baseline-convention.md`: frontmatter (title/description), a managed-header comment, and the extracted-from-pkm generic content (visibility resolution and the exclusion-vs-visibility axis rule, the disclosure ladder, relation vocabulary, archiving, git/session rules including `ctxr session land`'s canonical-clone auto-sync, directory-scoped conventions) — headed at H2, relying on `inline-conventions-and-mission`'s `inlineDocBody` to demote on inlining.
- [x] 2.2 Write `templates/conventions/custom-convention-seed.md`: heading prompts only, no wrapping H1/H2 (the wrapper heading comes from frontmatter title via the existing scan-and-render mechanism).
- [x] 2.3 Write `src/core/convention-doc.ts`: `renderBaselineConvention`/`syncBaselineConvention` (read-compare-write, managed, parallel to `syncShippedSkills` but for one file) and `seedCustomConventionFile` (write-once).
- [x] 2.4 Update `src/core/conventions.ts`'s `scanConventions` to read `guidance_path` and exclude the configured mission document's basename from the scan (so it isn't double-rendered — it already gets its own "Mission" section).
- [x] 2.5 Wire `syncBaselineConvention` and `seedCustomConventionFile` into `src/commands/init.ts` and `syncBaselineConvention` into `src/core/reconcile.ts`, ordered before the existing `buildAgentsConventionsSection` call.
- [x] 2.6 Verify: `npx vitest run test/unit/conventions.test.ts --exclude '**/.claude/**'`; then in a tmp store, `ctxr init` and confirm the guidance directory holds all three files, inlined correctly in `AGENTS.md`; `ctxr update` twice confirms byte-stability.

## 3. Mission relocation

- [x] 3.1 Give `organize.mission_path` its init-time default (`DEFAULT_MISSION_PATH`) in `src/commands/init.ts`'s config literal, and seed the file when the path is non-empty and missing.
- [x] 3.2 Change `findStaleRollups` in `src/core/rollup.ts` to read the mission document directly by path instead of the passed-in `notes` array.
- [x] 3.3 Confirm `contextureOwnedPrefixes` in `src/core/write-lifecycle/path-gate.ts` sanctions the renamed guidance path (closing the mission write-gate gap a root-level `mission.md` previously had under a strict `writable_paths` allowlist); add regression coverage.
- [x] 3.4 Verify: `npx vitest run test/unit/organize-checks.test.ts test/unit/rollup-staleness.test.ts test/unit/path-gate.test.ts --exclude '**/.claude/**'`; then in a tmp store, `ctxr rollup stale --json` reports the freshly seeded, unwritten mission document as stale, and `ctxr rollup write` on it refreshes AGENTS.md's Mission section in the same operation.

## 4. Doctor guard

- [x] 4.1 Add `src/core/checks/harness-portability-checks.ts`'s `conventionsSectionSizeCheck`: measures `AGENTS_MD_CONVENTIONS_FENCE`'s rendered byte size against `harness.convention_max_bytes ?? DEFAULT_CONVENTION_MAX_BYTES`, registered in `src/core/checks/manifest.ts`.
- [x] 4.2 Verify: `npx vitest run test/unit/harness-portability-checks.test.ts --exclude '**/.claude/**'`; then in a tmp store, set a tiny `convention_max_bytes` and confirm `doctor` fails naming the size and budget.

## 5. Full verification

- [x] 5.1 `npm run typecheck && npm run build && npx vitest run --exclude '**/.claude/**'` — full suite green.
- [x] 5.2 In a scratch store: `ctxr init` produces the full guidance directory and an `AGENTS.md` whose conventions section inlines the baseline and custom files; write custom prose and confirm it's picked up by `ctxr update`; hand-edit the baseline file and confirm `inline-conventions-and-mission`'s existing drift check fails doctor, then `ctxr update` heals it; a store still carrying `harness.conventions_path` at the old default migrates cleanly (`ctxr migrate --dry-run` names both deltas, a real run moves the directory and bumps the schema version); `ctxr doctor` and `ctxr verify --portable` pass throughout.

## 6. Collapse the conventions template pair and rename the fence (D7)

- [x] 6.1 Replace `templates/agents/store-conventions.md` and `templates/agents/store-conventions-empty.md` with one `templates/agents/conventions.md` carrying a single `__CONVENTION_BODY__` slot.
- [x] 6.2 In `src/core/agents-doc.ts`, add `conventionsBody()` computing either branch's lines in code; `renderConventionsSection` becomes a single `substituteBlock` call; rename `AGENTS_MD_CONVENTIONS_FENCE`'s underlying marker from `store-conventions` to `conventions`.
- [x] 6.3 Add `RETIRED_AGENTS_MD_STORE_CONVENTIONS_FENCE` cleanup in `src/core/reconcile.ts`, same shape as the existing identity-fence retirement.
- [x] 6.4 Update the fence-order literal in `test/unit/agents-doc.test.ts` and drop the now-structurally-impossible byte-identical-paragraph test in `test/unit/conventions.test.ts` (kept the two exact-output tests, since output is unchanged).
- [x] 6.5 Verify: `npx vitest run --exclude '**/.claude/**'` — full suite green (753/753, one fewer than before by design); a fresh `ctxr init` writes the `contexture:conventions` fence; a store carrying the old `contexture:store-conventions` fence has it retired and replaced on the next `ctxr update`, with `doctor`/`verify --portable` passing throughout.
