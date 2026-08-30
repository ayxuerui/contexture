## 1. Session landing

- [ ] 1.1 Add `--branch` and `--title` to `session submit`; add `ctxr session land [--yes]` implementing the D1 state machine with gates before merge, push, and worktree removal
- [ ] 1.2 Tests: each PR state arm; a gate declined leaves state unchanged; a retry after a simulated partial failure re-reads state and performs only the remaining arms; refuses on the default branch

## 2. Fenced-region append

- [ ] 2.1 Add `ctxr entry append <note> --region <name> [--text|stdin]`, creating the `contexture:<region>` fence when absent and returning `{region, lines}`
- [ ] 2.2 Tests: append into existing region; create missing region at end of note; content outside the region byte-identical before/after; frontmatter untouched

## 3. Dedupe verdicts

- [ ] 3.1 Add `drift` to `source check`; add `source stamp <note> --id --hash` and `source add-alt <note> --id`; canonicalize URL identities per D3 with `ingest.tracking_params` config
- [ ] 3.2 Tests: verdict table (new/duplicate/drift/alt); canonicalization unit table (case, fragment, tracking params, trailing slash); stamp then check → duplicate

## 4. Leak scan

- [ ] 4.1 Add `disclosure.leak_markers` config and a `leak` lint check per D5; `ctxr check <note> --scan` reports the same findings for one note
- [ ] 4.2 Tests: marker for `ctx-b` inside a note visible only to `ctx-a` → finding; same marker inside a note `ctx-b` can see → no finding; no markers → no-op

## 5. Rollup staleness

- [ ] 5.1 Add `ctxr rollup stale [--for <entity>]` and an `organize` lint check using `rolled_up:` and `organize.rollup_stale_days`
- [ ] 5.2 Tests: backlink newer than `rolled_up` → stale; no `rolled_up` → stale; all older → fresh

## 6. Integration

- [ ] 6.1 Update `openspec/specs/cli-contract` and `src/core/procedures.ts` so the owned skills call the new verbs instead of their manual equivalents; `npm run build && npm run typecheck && npx vitest run` green
