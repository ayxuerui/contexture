## Why

Retrieval v1 ships no ranker by design (`bootstrap-contexture-core` D2), and that design document names the resulting gap as "the single riskiest decision": a note genuinely about a topic, whose body and catalog gloss both avoid the query's vocabulary, is a silent recall miss with no detection mechanism. Two years of shipped behavior later there is still **no measurement of retrieval at all** — the riskiest bet in the project is the one thing nothing observes.

Evidence from a system that did measure this changes where the effort should go. GBrain's published ablation (`docs/architecture/RETRIEVAL.md`) reports P@5 of ~18 for hybrid vector-plus-keyword retrieval without a knowledge graph, against 49.1 with the full stack — the graph contributes more precision than the embeddings do, and they call it "the load-bearing wall." Contexture already builds a deterministic wikilink graph with typed edges. The implication is that strengthening the leg already in hand beats acquiring a ranker, and that three cheap, deterministic mechanisms are available right now: aliases so a note is reachable by names its text never uses, computable leg routing so the routing contract stops being prose that decays, and demotion so archived material is ordered last rather than made invisible.

## What Changes

- Add a retrieval measurement capability: a fixture corpus with gold annotations, a **recall-miss rate** (a relevant note existed and no leg returned it), and a **leak count that gates at zero** (a note surfaced to a context that cannot see it). Baselines are committed so a regression appears as a diff rather than a discovered surprise.
- Add note aliases: alternative names indexed at graph build, resolving wikilinks and catalog lookups, so a note is reachable by vocabulary its body never contains.
- Make leg routing **computable**: a command that takes a question and returns which retrieval leg to use and why, deterministically and with no model call — replacing a documentation-only requirement with a mechanism that can be tested.
- Separate **demotion** from **exclusion**: a retrievable-but-deprioritized tier, so archived notes are ordered last instead of dropped from retrieval entirely, while genuinely non-retrievable paths stay excluded as they are today.

## Capabilities

### New Capabilities

- `retrieval-quality`: how the store measures whether retrieval finds what exists and withholds what it must — the fixture corpus, the metrics, and the gates that fail rather than warn.

### Modified Capabilities

- `context-retrieval`: leg-routing becomes a computable command in addition to documentation; aliases join link and lookup resolution; a demotion tier is defined as distinct from exclusion.
- `context-catalog`: sections carry a retrieval tier that ordering consumes.

## Impact

Affected code: the graph build and its link resolution (alias indexing), the catalog build and section model (tier), a new routing command and a new evaluation command, the note frontmatter schema (alias field), `contexture.yaml` (tier declarations, alias field key), and a new fixture corpus under the test tree.

Affected stores: additive. A store declaring no aliases and no tiers retrieves exactly as it does today; the new commands are available but change nothing until used.

No dependency changes. Every mechanism here is deterministic and offline — no model call, no embedding, no index server.

## Non-goals

- **Any ranker, score, or embedding.** The lever this change uses is ordering, not weighting, and the argument is the ablation cited above: the graph is where the precision is, and Contexture already has one. Introducing scoring would also reopen D2, which is deliberately still deferred.
- **A search command or a search adapter kind.** Still the D2 cut. Measuring the legs that exist is a prerequisite for deciding whether a ranker is needed at all, not a step toward one.
- **Automatic alias generation.** Aliases are authored, never inferred — a generated alias is an unreviewed claim that two names mean the same thing, which is exactly the kind of silent merge the graph's identity-collision rule already refuses.
- **Semantic or fuzzy matching in the routing command.** Routing classifies a question's shape deterministically; a classifier that guessed would make the routing contract untestable again, which is the problem this change exists to fix.
- **Replacing direct content matching.** It remains the agent's own leg, unwrapped by any command, per the existing capability.
