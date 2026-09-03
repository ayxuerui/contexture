## 1. The corpus

- [ ] 1.1 Add a fixture corpus under `test/fixtures/`: notes spanning more than one taxonomy section and more than one link distance, including at least one note under a path the corpus's exclusion configuration withholds
- [ ] 1.2 Add query fixtures, each declaring its entry selector, hop budget, expected note set, and the vocabulary a reader would search by
- [ ] 1.3 Run `npx vitest run test/unit/retrieval-corpus.test.ts` — every fixture declares all four, and the anti-vacuity condition holds

## 2. The evaluation

- [ ] 2.1 Implement the evaluation over the corpus, computing seam respect, reachability, and the three states of gloss vocabulary coverage, naming every offending or unreached note with the fixture that expected it
- [ ] 2.2 Add the committed `package.json` script that runs it
- [ ] 2.3 Run that script — it prints all three metrics and exits 0

## 3. The gate

- [ ] 3.1 Make seam respect exit non-zero regardless of any baseline, naming each escaped note and the leg that returned it
- [ ] 3.2 Add the source-level half: enumerate the modules permitted to read notes from the filesystem, in the style of the existing single-source-literals assertion
- [ ] 3.3 Run the evaluation against a test double whose leg reads notes outside the enumeration — exits non-zero naming the note and the leg; restore, add an unlisted module that reads notes — exits non-zero naming the module; restore both and confirm exit 0

## 4. The baseline

- [ ] 4.1 Write the metrics to a version-controlled baseline in a stable, diff-readable, timestamp-free form; compare each run against it, failing on a worsened metric and reporting without rewriting on an improved one
- [ ] 4.2 Run the evaluation twice against the unchanged corpus and `diff` the outputs — byte-identical, exit 0 — then commit the baseline
- [ ] 4.3 Worsen one fixture deliberately and re-run — exits non-zero naming the metric, the baseline value and the new value; restore and confirm exit 0

## 5. Verify

- [ ] 5.1 Run `npm run build && npm run typecheck && npx vitest run` and the evaluation script — all green
- [ ] 5.2 Run `openspec validate measure-the-no-ranker-bet --strict` and `openspec validate --all --strict` — both exit 0
