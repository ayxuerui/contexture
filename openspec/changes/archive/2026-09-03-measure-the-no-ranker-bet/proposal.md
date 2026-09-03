## Why

`bootstrap-contexture-core` D2 calls shipping no ranker "the single riskiest decision in this design," and names its failure mode precisely: a note genuinely about a topic, whose body and catalog gloss both avoid the query's vocabulary, is a silent recall miss with no detection mechanism. The mitigations it named — the catalog's coverage invariant and its size budget — are both structural checks on the catalog's *shape*. Neither observes whether retrieval returns the right notes. The riskiest bet in the project remains the one thing nothing measures.

The predecessor attempt at this, `retrieval-legs-hardening`, is instructive about why it has to be re-cut rather than revived. It defined its zero-tolerance gate as a leak count over a requesting context's visibility and scope, and `retire-the-access-axes` deleted both three days after it was written. `openspec validate --strict` never noticed, because it checks structure rather than whether a requirement's subject still exists. A measurement capability built on a mechanism that can disappear underneath it is the same defect again, so this one is anchored to the two guarantees that are live in a single-owner store: the enumeration seam that decides what is retrievable at all, and the ordering the pass computes over it.

It lands after `compose-the-retrieval-pass` rather than before, reversing the predecessor's sequencing, because recall over a leg is undefined until a leg accepts a mechanizable request. `catalog show --section` returns a whole section, so its recall is 100% by the coverage invariant and measures nothing; `graph query neighbors` needs a human-chosen seed; direct content matching is the agent's own tool and contexture never invokes it. The pass is the first leg in the system whose input a fixture can state.

## What Changes

- Add a `retrieval-quality` capability: a version-controlled fixture corpus whose fixtures declare their own entry selector, hop budget, expected note set, and the vocabulary a reader would plausibly search by.
- Compute **enumeration-seam respect** as a gate that fails at any non-zero value and can never be baselined: no leg contexture computes returns a note outside the store's own enumeration. The gate has a runtime half over the corpus and a source half that enumerates the modules permitted to read notes off the filesystem, so a future leg that bypasses the seam fails by construction rather than by whether a fixture happened to exercise it.
- Compute **reachability** — the proportion of fixtures whose full expected set the pass returns from the declared entry at the declared hop budget — naming every unreached note and the fixture that expected it.
- Compute **gloss vocabulary coverage**, the metric D2 actually asks for and nothing has ever computed, reported as three states that are never summed: the gloss carries the fixture's vocabulary; the body carries it but the gloss does not; neither does.
- Commit a byte-stable, timestamp-free baseline, compare each run against it, fail on a worsened metric, and report — never rewrite — an improvement.
- **BREAKING**: N/A. Nothing ships into a user's store; no command, config key, or note changes.

## Capabilities

### New Capabilities

- `retrieval-quality`: how the store measures whether retrieval finds what its own structure makes reachable and withholds what configuration excludes — the fixture corpus, the metrics computed over it, and which of them fail a run rather than merely reporting.

### Modified Capabilities

_None._

## Impact

Affected code: a fixture corpus under `test/fixtures/`, an evaluation entry point run by a committed `package.json` script, a committed baseline file, and a source-level assertion in the style of `test/unit/single-source-literals.test.ts`. Nothing under `src/` changes behavior; the evaluation reads the same enumeration and the same pass the CLI does.

Affected stores: none. The corpus and the baseline are the project's own test material and are never delivered by `init` or `update`.

No dependency changes. The evaluation makes no network call, no model call, and reads no clock.

## Non-goals

- **A target number.** This change establishes measurement. What reachability and vocabulary coverage *should* be, and whether either justifies revisiting D2, are questions the first committed baseline exists to inform and cannot be answered before it.
- **Gating reachability at zero.** A recall miss is a known, accepted limitation of a design that deliberately ships no ranker; gating it would make the suite red on day one for a property the design trades away, and a permanently red gate is one nobody reads.
- **Any metric over visibility, scope, or a requesting context.** Those fields do not exist. Re-deriving a gate for them would repeat the defect this change exists to correct.
- **A store-facing `ctxr` command.** A version shipped into every store would carry contexture's fixture corpus with it, and a per-store version needs a gold set no operator will write. The evaluation is the project's own harness, so it stays a committed script.
- **A vocabulary heuristic inside the CLI.** Deciding whether a gloss "carries" a term needs stopwords and stemming, which is a quality judgment; putting it in `catalog check` would ship that judgment into every store. It stays in the evaluation until the measured number says whether a store-facing version is worth its ambiguity.
- **Automatically updating the baseline on an improvement.** An auto-update lets a change that improves one fixture while quietly breaking another ratchet the baseline forward with nobody seeing the trade.
