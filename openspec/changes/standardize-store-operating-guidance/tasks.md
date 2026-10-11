## 1. Skills and the retrieval section

- [x] 1.1 `templates/skills/ctxr-submit.md`: add the stale-rollup check to step 1, a routes paragraph before the steps, and the five body questions in step 8's `gh pr create` body.
- [x] 1.2 `templates/skills/ctxr-second-opinion.md`: in section 1, the required-critique rule and where the verdict lands.
- [x] 1.3 `templates/skills/ctxr-derived-artifacts.md`: the gloss-confirmation step and the per-checkout graph sentence.
- [x] 1.4 `templates/agents/retrieval-leg-routing.md`: the fallback line. Regenerate the exact-output fixture in `test/unit/agents-doc.test.ts`.
- [x] 1.5 `test/unit/skills.test.ts`: one assertion per scenario. Check the `TIER_WORDS` ban and flag attribution.
- [x] 1.6 Run `npm run typecheck && npm test` and confirm both exit 0, including the entry-document ceiling test.
- [x] 1.7 Run `openspec validate standardize-store-operating-guidance --strict` and confirm it exits 0.
