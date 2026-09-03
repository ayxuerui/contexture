## Context

See `proposal.md` — Why, and the `retrieval-quality` delta under `specs/` for the requirement set.

This change depends on `compose-the-retrieval-pass`, which adds the first retrieval leg whose input a fixture can state, and which moves the exclusion guarantee from prose into an enforced invariant at the graph loader. That invariant is what this change measures against; the two are deliberately split so that a guarantee failing closed and a metric tolerated against a baseline are not requirements of the same capability.

## Goals / Non-Goals

**Goals:**
- Make the no-ranker bet observable, so keeping or revisiting it rests on a measured rate rather than an impression.
- Distinguish, when retrieval misses, whether the catalog is thin or the corpus genuinely lacks the vocabulary — because the two call for different work.
- Make a regression appear as a reviewable diff rather than a discovered surprise.

**Non-Goals:**
- Improving any metric. This change measures; the improvement it enables is the next one.
- Shipping anything into a user's store.
- Any network call, model call, or clock read.

## Decisions

### D1 — Measurement is a capability, and its vehicle is a committed script rather than a command
Retrieval quality is a behavior contract the project asserts publicly, not an implementation detail of code that happens to be tested; expressing it as a capability makes the zero-gate a requirement rather than a convention someone can delete with a passing build. But the capability is named for the concept, and its delivery vehicle is deliberately not part of it — the evaluation runs from a committed script over the project's own corpus. **Alternative considered:** a `ctxr` subcommand — rejected, because a store-facing evaluation either ships contexture's fixture corpus into every store or requires a per-store gold set no operator will write, and neither is a thing to put behind a command.

### D2 — The zero-gate is enumeration-seam respect; the quality metrics get baselines
These are different kinds of claim and get deliberately different treatment. A note escaping the store's own enumeration is a violation of a stated guarantee: any non-zero value means a requirement is false, so no baseline may normalize it. Reachability and vocabulary coverage measure a limitation the design knowingly accepts, so the useful signal is the trend. **Alternative considered:** gating reachability at zero too — rejected: red on day one for a property the design trades away, and a permanently red gate is one nobody reads. **Alternative considered:** keeping the predecessor's leak gate — rejected: its subject was deleted.

### D3 — The gate is not tautological, because the seam is exactly what a new leg bypasses
"No leg returns a note outside `listNotes()`" sounds true by construction, and is true only as long as every leg goes through the seam. The preceding change adds a leg and a loader check precisely because one leg did not: the graph query served nodes from a persisted artifact without re-checking admission. The gate protects against the next instance of the change we just made. **Alternative considered:** dropping it as vacuous — rejected on that evidence.

### D4 — The gate has a source-level half as well as a runtime half
A fixture-driven gate catches the bypass it happens to exercise. Enumerating the modules permitted to read notes off the filesystem catches the next one by construction, before a fixture exists for it. The precedent is already in the tree: an existing unit test enumerates the modules permitted to write to standard output and to spawn a subprocess, on the same reasoning. **Alternative considered:** the runtime half alone — rejected, because a new leg's first version is exactly when no fixture covers it.

### D5 — Vocabulary coverage reports three states and never sums them
For each expected note and the fixture's declared vocabulary: the gloss carries a term (the catalog is doing its job); the body carries it but the gloss does not (direct content matching would have found it and the catalog is the weak link); neither carries it (no leg composed of position, links, and literal text can reach it, and only an authored alias can). A single number cannot tell a catalog problem from a corpus problem, and D2's named failure is specifically the catalog problem. Reporting three states is what turns the metric into a decision about where effort goes. **Alternative considered:** one coverage percentage — rejected for exactly that reason.

### D6 — "Reachability", not "recall"
Recall is defined against a query, and the pass takes no query. What is measured is whether the store's own structure — sections, links, and the declared hop budget — connects the declared entry to the notes a correct answer contains. Naming it accurately keeps the metric from being read as a claim about vocabulary matching, which it is not and which the preceding change explicitly disclaims. **Alternative considered:** keeping the predecessor's "recall-miss rate" name — rejected as a claim the measurement does not support.

### D7 — An improvement never auto-updates the baseline
Carried verbatim from the superseded change's D3, which survives its context intact. A run that improves a metric reports the improvement and leaves the committed file alone. Auto-updating would let a change that improves one fixture while quietly breaking another ratchet the baseline forward with no human seeing the trade, and updating a baseline should be a reviewable diff in a pull request — the same discipline the store already applies to derived artifacts never riding a review.

### D8 — Fixtures declare their own expectations, and adding one is not a code change
The expected note set, the entry selector, the hop budget and the vocabulary all live in the fixture. A separately maintained answer key drifts from the corpus it answers for, and a corpus that requires an edit to the evaluation for each addition will stop growing. **Alternative considered:** a central answer-key file — rejected for the drift.

## Risks / Trade-offs

- **[Risk] A fixture corpus measures the corpus, not the store.** Good numbers on fixtures a maintainer wrote can coexist with poor real-world behavior, because the fixtures encode the same assumptions the retrieval design does. → **Mitigation**: every miss names the note and the fixture that expected it, so the corpus is debuggable rather than a single number; and the metric that *gates* — seam respect — does not depend on the corpus being representative, only on it containing a note under an excluded path.
- **[Risk] The gate could pass against a corpus that never exercises it.** → **Mitigation**: an anti-vacuity scenario requires the corpus to contain at least one note the exclusion configuration withholds, so a leg that stopped filtering would fail rather than find nothing to fail on; and the source half holds independently of the corpus.
- **[Risk] Vocabulary coverage depends on a term-matching rule** — stopwords, casing, stemming — and a naive rule will misreport. → **Mitigation**: the rule lives in the evaluation rather than in `catalog check`, so it can be revised without changing a store-facing guarantee, and the three-state report makes a misclassification visible as an implausible split rather than a plausible single number.
- **[Trade-off] The baseline is committed, so every change that moves retrieval carries a baseline diff for review.** → Accepted: that diff is the mechanism. A number that moves without anyone seeing it is the state this change exists to end.

## Migration Plan

Nothing to migrate. No configuration key, no `schema_version` bump, no note rewritten, nothing delivered into a store by `init` or `update`. The corpus, the evaluation, and the baseline are project test material.

Sequencing: the corpus and the evaluation land first and the pre-improvement baseline is committed before any change that could move a metric — which is the discipline the predecessor asserted and then violated by bundling four improvements into the change that was supposed to measure them.

## Open Questions

None that would change these specs. What the first numbers should be, and whether they justify revisiting `bootstrap-contexture-core` D2, are exactly what the first committed baseline exists to inform.

**Named successor, so the thread is not lost.** The improvement this baseline is built to judge is `resolve-or-surface-every-dangling-link`: authored note aliases — a note reachable by a name its filename and body never contain, which is the only mechanism that addresses the third state D5 reports — together with a lint observation ranking unresolved link targets by the number of distinct notes mentioning them, which separates a typo from a concept the store keeps referring to and has never given a page. Both are deterministic and offline, both read data the graph build already produces, and both land after this baseline so their value is measured rather than asserted.
