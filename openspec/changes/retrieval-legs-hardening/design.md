## Context

See `proposal.md` — Why, and the three spec deltas under `specs/` for the requirement set.

The relevant prior decision is `bootstrap-contexture-core` D2: retrieval v1 ships two CLI-computed legs and no ranker, with the catalog serving as the ranking mechanism. That document records the bet's failure mode precisely — a note about a topic whose body and gloss both avoid the query's vocabulary is a silent miss — and its mitigations were the catalog's coverage invariant and its size budget. Both are structural checks on the catalog's shape. Neither observes whether retrieval actually returns the right notes.

The external evidence that reframes the work is GBrain's retrieval ablation: without a knowledge graph, hybrid vector-plus-keyword retrieval scores P@5 ~18; with the full stack including graph traversal, 49.1. Whatever the absolute numbers are worth across different corpora, the ordering is the useful part — the graph leg carries more precision than the embedding leg. Contexture's graph is deterministic, already built, and currently used only for structural queries. That is the asset to develop.

## Goals / Non-Goals

**Goals:**
- Make the no-ranker bet observable, so the decision to keep or revisit it rests on a measured rate rather than an impression.
- Close the specific recall gap D2 names, using deterministic mechanisms rather than a ranker.
- Convert the routing contract from prose into something a test can hold to.

**Non-Goals:**
- Reaching a target retrieval score. This change establishes measurement and three improvements; what the numbers should be is a question for after the first baseline exists.
- Changing what the legs are. Catalog, graph, and direct content matching remain the three legs.
- Anything that requires a network call, a model, or an index server.

## Decisions

### D1 — Measurement is its own capability, not a test suite
Retrieval quality is a behavior contract the store makes, not an implementation detail of the code that happens to be tested. Expressing it as a capability means the gate ("a leak fails the run") is a requirement rather than a convention someone can delete with a passing build. Alternative considered: ordinary unit tests over fixtures with no spec — rejected, because the leak gate in particular is a guarantee the project asserts publicly, and an assertion with no requirement behind it is exactly the "instructions that decay" the project's code/judgment seam exists to avoid.

### D2 — The leak count gates at zero; the recall-miss rate has a baseline
These two metrics get deliberately different treatment because they are different kinds of claim. A leak is a violation of a stated guarantee: any non-zero value means a requirement is false, so no baseline should be able to normalize it. A recall miss is a known, accepted limitation of a design that ships no ranker: the useful signal is the trend, so it gets a committed baseline and fails only on regression. Alternative considered: gating both at zero — rejected, because it would make the suite red on day one for a property the design deliberately trades away, and a permanently red gate is one nobody reads.

### D3 — An improvement never auto-updates the baseline
A run that improves the recall-miss rate reports the improvement and leaves the committed file alone. Auto-updating would let a change that improves one fixture while quietly breaking another ratchet the baseline forward with no human seeing the trade. Updating a baseline should be a reviewable diff in a pull request, which is the same reasoning the store already applies to derived artifacts never riding a review.

### D4 — Aliases are authored, never inferred
An inferred alias is an unreviewed assertion that two names denote the same thing. The graph build already refuses to silently merge two notes whose identities collide (D3 of the founding design), on the grounds that a silent merge is worse than an inconvenient identifier; generating aliases would reintroduce that failure through a side door. Colliding aliases therefore fail the build under the same rule rather than being resolved by a heuristic.

### D5 — Routing is classified deterministically, and the command reports its reason
The routing command returns the leg *and* why it chose it. Returning a bare leg would make the command an oracle an agent must trust; returning the reason makes it a computation an agent can check and a test can assert against the documented contract. This keeps the code/judgment seam intact — the CLI computes a classification, the agent decides what to do with it. Alternative considered: a model call to classify the question — rejected outright: it would make routing non-deterministic, add a network dependency to a core leg, and make the routing requirement untestable again, which is the problem this change exists to solve.

### D6 — Demotion is a separate declaration from exclusion, and overlapping the two is an error
Archived material is the motivating case: today it is either fully retrievable or invisible, with nothing between. Demotion adds the middle. The two lists are kept separate rather than one list with a mode, so that reading the configuration answers "is this reachable at all" without inspecting a flag, and `doctor` fails a path declared both ways rather than picking a winner — an ambiguity about reachability should never be resolved by precedence order.

## Risks / Trade-offs

- **[Risk] A fixture corpus measures the corpus, not the store.** Good scores on fixtures a maintainer wrote can coexist with poor real-world recall, because the fixtures encode the same assumptions the retrieval design does. → **Mitigation**: the recall-miss report names each missed note and fixture, so the corpus is debuggable rather than a single number; and the metric that gates — the leak count — is a property that does not depend on the corpus being representative, only on it containing notes across more than one visibility and scope.
- **[Risk] Aliases add a second name space over notes,** and a store that uses them heavily can make link resolution harder for a human to predict. → **Mitigation**: collisions fail the build loudly rather than resolving by precedence, and aliases are authored, so every alias in a store is something a reviewer approved in a pull request.
- **[Risk] Demotion adds an ordering concern to legs that currently have none,** which is a step toward the ranking machinery D2 deferred. → **Mitigation**: the requirement is deliberately a total order over tiers with existing ordering preserved inside a tier — no scores, no weights, nothing to tune. If a ranker is later adopted, tiers are an input to it rather than something it must undo.
- **[Trade-off] The routing command duplicates in code what the procedure documentation states in prose.** They can drift. → Accepted, and the spec turns it into a caught drift rather than a silent one: a scenario asserts the command and the documented contract agree, so divergence fails a test.
- **[Trade-off] This change adds four mechanisms at once.** Each is small, but the surface is wide for one change. → Accepted because they share one justification and one verification path: all four exist to move the no-ranker bet from unmeasured to measured, and the evaluation added here is what demonstrates the other three did anything.

## Migration Plan

Every part of this change is additive and inert by default: a store declaring no aliases and no tiers, and never invoking the routing or evaluation commands, retrieves byte-identically to before. No migration and no schema version bump.

Sequencing within the change matters in one place: the evaluation capability lands first, so the baseline it commits is measured against pre-change retrieval. Aliases, demotion, and routing then land against a baseline that can show whether they helped — which is the entire point of doing measurement first.

## Open Questions

None that would change these specs. What the recall-miss rate *should* be, and whether it justifies revisiting D2, are questions the first committed baseline exists to inform and cannot be answered before it.
