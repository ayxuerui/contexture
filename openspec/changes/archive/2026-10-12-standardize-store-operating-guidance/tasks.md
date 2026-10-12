## 1. Skills and the retrieval section

- [x] 1.1 `templates/skills/ctxr-submit.md`: add the stale-rollup check to step 1, a routes paragraph before the steps, and the five body questions in step 8's `gh pr create` body.
- [x] 1.2 `templates/skills/ctxr-second-opinion.md`: in section 1, the required-critique rule and where the verdict lands.
- [x] 1.3 `templates/skills/ctxr-derived-artifacts.md`: the gloss-confirmation step and the per-checkout graph sentence.
- [x] 1.4 `templates/agents/retrieval-leg-routing.md`: the fallback line. Regenerate the exact-output fixture in `test/unit/agents-doc.test.ts`.
- [x] 1.5 `test/unit/skills.test.ts`: one assertion per scenario. Check the `TIER_WORDS` ban and flag attribution.
- [x] 1.8 Baseline additions in `templates/conventions/baseline-conventions.md`. Add `harness.scratch_path` and `organize.log_path` to schema and defaults, and the log path to `excludedPrefixesFor`.
- [x] 1.9 Log-append steps in `ctxr-ingest-orchestration` and `ctxr-organize-audit`. Perishable-state and `assets/` lines in `ctxr-capture`. `gh` and branch-prefix lines in `ctxr-submit`.
- [x] 1.10 Tests for each new scenario. Raise the ceiling in `test/integration/entry-document-ceiling.test.ts` to the measured total rounded up to 500.
- [x] 1.6 Run `npm run typecheck && npm test` and confirm both exit 0, including the entry-document ceiling test.
- [x] 1.7 Run `openspec validate standardize-store-operating-guidance --strict` and confirm it exits 0.
- [x] 1.11 Source and retirement practice (capture, ingest orchestration, organize audit, baseline title rule), with one test per scenario.
- [x] 1.12 `ctxr-placement`: a unit with supporting notes gets its own folder, naming the configured cluster depth.
