## 1. Establish the failing case first

- [x] 1.1 Add a failing unit test for the self-match: a capture carrying its own `source_id`, with **neither `source_hash` nor `ingested`** (the not-yet-ingested shape — this distinction is load-bearing, see design D2), and no other record carrying that source-id. Assert `new`. Put it where the command's behaviour is already covered rather than in `test/unit/ingest-model.test.ts`, which tests the pure model and should stay free of a candidate-path concept (design D1) — extend `describe('source check command (via the CLI command layer)')` in `test/unit/ingest-command.test.ts`
- [x] 1.2 Add the companion case: the same not-yet-ingested candidate, but a *different* record also carries that source-id — assert the verdict names that other record, not the candidate (spec's self-exclusion-does-not-hide-a-real-record scenario)
- [x] 1.3 Add the regression guard for the opposite direction: confirm `test/unit/ingest-command.test.ts:246-268`'s existing "finds a retained capture even though retrieval excludes the tier" test (an already-ingested capture checked against its own identity, asserting `already_ingested` naming itself) is not modified by this change and still encodes the required behaviour — this is the case an unconditional fix would have broken; do not touch it, just confirm it stays as-is
- [x] 1.4 Run the new tests and confirm both fail for the right reason before the fix — 1.1: `already_ingested` matching the candidate's own path; 1.2: `multiple_matches` (candidate and the real prior record both match by source-id when the candidate isn't excluded) rather than `drift` naming only the prior record. Confirmed 2/14 failing, the other 12 (including the 246-268 regression guard) green — `npx vitest run test/unit/ingest-command.test.ts`

## 2. Fix

- [x] 2.1 `src/commands/source-check.ts`: find the candidate's own record in the set `identityRecords()` returns (by `relativePath`), and exclude it from what's passed to `evaluateSourceCheck` **only if `hasAssignedIdentity` on that record is false** (design D1, D2 revised). Match on store-relative path equality, filtering the input rather than post-processing `result.matches` (D3). Import `hasAssignedIdentity` from `../core/ingest/identity.js`. Implemented as a named `excludeUnassignedCandidate` helper rather than inlined, matching this file's existing style of small, well-documented functions
- [x] 2.2 Update `identityRecords()`'s doc comment, or the call site's, to say the candidate is conditionally excluded and why — the existing comment explains why the set is a union but not what it leaves out, and the condition (not just "excluded") is the part worth getting right in the comment given how easy it was to get wrong in this change's own first draft
- [x] 2.3 Run `npx vitest run test/unit/ingest-command.test.ts` — exits 0, tasks 1.1, 1.2, and the untouched 1.3 regression guard all pass (14/14)
- [x] 2.4 Run `npm run typecheck` — exits 0

## 3. Confirm nothing else moved

- [x] 3.1 Run `npx vitest run test/unit/ingest-model.test.ts test/unit/ingest-command.test.ts` — exits 0 (25/25); `evaluateSourceCheck`'s own tests are untouched by the fix
- [x] 3.2 Run `npm run test` — exits 0, full suite green (103 files, 987 tests) with no verdict regressions elsewhere

## 4. Spec

- [x] 4.1 Leave `openspec/specs/context-ingest/spec.md` untouched — this change's delta carries the requirement text; syncing into the main spec is the archive step's job
- [x] 4.2 Run `openspec validate exclude-candidate-from-source-check --strict` — exits 0, valid

## 5. Verify against the real store that surfaced this

- [x] 5.1 Build (`npm run build`), then re-run the two commands from proposal.md's Why against the pkm store using this build (`node <worktree>/dist/bin.js --root /home/ubuntu/workspace/pkm --json source check ...`). Only the second (no `source_hash`/`ingested` — the daniel-pink capture) is this change's bug: it must now return `new`. The first (the Sigmund granola capture, which carries `ingested`) is EXPECTED to still self-match, unchanged — it has `hasAssignedIdentity() === true`, so it is correctly left in the comparison set (design D2); fixing it needs the downstream pipeline fix this change deliberately doesn't include (Non-goals). Record both before/after outputs and confirm this asymmetry, not identical "both now new" results — CONFIRMED against real pkm data: granola/Sigmund unchanged (drift, matches=[self]); url/daniel-pink flipped from already_ingested/matches=[self] to new/matches=[] (exit 0 both). Store confirmed untouched afterward (git status: only pre-existing untracked scratch files)
- [x] 5.2 Run `npm run build && npm run verify:phase0` — exits 0, all Phase 0 checks passed

## 6. Release

- [ ] 6.1 Confirm with the operator before publishing — a downstream store is gated on the npm release, not the merge, so this change is not "done" at merge, but publishing is an operator action and not automatic
