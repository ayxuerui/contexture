## 1. Extract the 5 no-interpolation skill bodies

- [x] 1.1 Create `templates/skills/ctxr-ingest-orchestration.md` from `INGEST_ORCHESTRATION.body()`'s current array, verbatim (the `GRAPH_DOCUMENT_RELATIVE_PATH` constant is a fixed string — bake its literal value `.contexture/cache/graph.md` directly into the file, no placeholder needed).
- [x] 1.2 Create `templates/skills/ctxr-connection-finding.md` the same way (same `GRAPH_DOCUMENT_RELATIVE_PATH` literal).
- [x] 1.3 Create `templates/skills/ctxr-rollup.md` from `ROLLUP.body()`.
- [x] 1.4 Create `templates/skills/ctxr-session-capture.md` from `SESSION_CAPTURE.body()`.
- [x] 1.5 Create `templates/skills/ctxr-organize-audit.md` from `ORGANIZE_AUDIT.body()`.

## 2. Extract the 4 single-placeholder skill bodies

- [x] 2.1 Create `templates/skills/ctxr-submit.md` from `SUBMIT.body()`, replacing each `${defaultBranch}` interpolation with the literal token `__DEFAULT_BRANCH__`.
- [x] 2.2 Create `templates/skills/ctxr-land.md` the same way from `LAND.body()`.
- [x] 2.3 Create `templates/skills/ctxr-session-lifecycle.md` the same way from `SESSION_LIFECYCLE.body()` (three occurrences of `${defaultBranch}`).
- [x] 2.4 Create `templates/skills/ctxr-derived-artifacts.md` the same way from `DERIVED_ARTIFACTS.body()`.

## 3. Extract the 2 branching-logic skill bodies

- [x] 3.1 Create `templates/skills/ctxr-placement.md` from `PLACEMENT.body()`, replacing the `...placementLayerStep(config)` splice point with the literal token `__LAYER_STEP__` on its own line.
- [x] 3.2 Create `templates/skills/ctxr-connection-proposal.md` from `CONNECTION_PROPOSAL.body()`, replacing the `...relationGroupingStep(config.retrieval.relations)` splice point with the literal token `__RELATION_GROUPING_STEP__` on its own line.

## 4. Loader and rewired seeds

- [x] 4.1 In `src/core/procedures.ts`, add a synchronous template loader: resolve `templates/skills/` via `fileURLToPath(new URL('../../templates/skills', import.meta.url))` (same relative depth as `hooks.ts`'s `templatesDir()`), `readFileSync` each of the 11 files once, cache in a `Record<string, string>` keyed by slug, stripping exactly one trailing `\n` before use.
- [x] 4.2 Rewrite each of the 11 `ProcedureSeed.body` functions to read from the cached template and apply the substitutions from design.md's Decisions (plain read for the 5 static ones; one `.replaceAll('__DEFAULT_BRANCH__', ...)` for the 4 single-placeholder ones; one `.replace('__LAYER_STEP__'|'__RELATION_GROUPING_STEP__', ...)` for the 2 branching ones), then `.split('\n')`.
- [x] 4.3 Delete the now-unused inline string arrays from `procedures.ts`, keeping `placementLayerStep` and `relationGroupingStep` (still called, just from the new `body()` implementations).

## 5. Verify byte-identical output

- [x] 5.1 `test/unit/procedures.test.ts` already asserts exact rendered content across the exact branch matrix this task calls for (default/empty-relations config, a `['supports', 'contradicts']` non-empty-relations config, a zero-layer taxonomy, a taxonomy with a terminating layer, and a taxonomy whose descriptions imply no end state) via literal `toContain`/`toBe` checks. Ran it unmodified against the rewired seeds and all 87 tests passed with no test-file changes — this is the byte-identical proof; a separate throwaway comparison script would only duplicate it, so none was written.
- [x] 5.2 `npx vitest run test/unit/procedures.test.ts` — 87/87 passed unmodified.

## 6. Full verification

- [x] 6.1 `npm run build && npx tsc --noEmit -p .` — both clean.
- [x] 6.2 `npm pack --dry-run` lists all 11 `templates/skills/*.md` files alongside the existing `templates/hooks/*.sh` — confirms the existing `package.json` `files` entry covers the new directory with no config change needed.
- [x] 6.3 `npx vitest run --exclude '**/.claude/worktrees/**' --exclude '**/node_modules/**'` — 609/609 passed. (A plain `npx vitest run` also picks up a stray, untracked `.claude/worktrees/bridge-cse_0178hePC6qHrBUNRZHZrVqWT/` leftover from an unrelated prior session and re-runs its nested copy of the test suite against stale git state, producing 76 unrelated failures confined entirely to that path — pre-existing repo clutter, not caused by or related to this change.)

## 7. Land it

- [ ] 7.1 Commit on this branch (`extract-skill-templates`, based on `remove-agent-identity`). Do not push until told to.
