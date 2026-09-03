## Why

Contexture ships a pipeline in prose and a menu in code. `templates/agents/retrieval-leg-routing.md` already instructs an agent to narrow "first to a catalog section or graph neighborhood" — a join of the catalog and the graph that exists nowhere in `src/`. The two legs share `listNotes()` and nothing else. So the store documents a step it cannot perform, and the agent is left to do the join by hand or skip it.

GBrain's published retrieval ablation puts a number on what that costs. Over a 240-page relational corpus: keyword-only P@5 ≈ 18, vector-only ≈ 18, hybrid retrieval with graph traversal **disabled** ≈ 18 — and the full stack, with the graph augmenting what the other legs returned, 49.1. Their conclusion: "the graph isn't a marginal feature; it's the load-bearing wall." The load-bearing part is specifically that the graph is *not* a fusion peer there — it is a post-recall augmentation over candidates some other entry point produced. Contexture's graph is deterministic, already built, and used only to answer structural questions standing alone, which is the configuration that ablation scores at 18. Karpathy's LLM Wiki describes the same shape from the model's side: read the index, then drill through the cross-references that are already there, and at this corpus scale skip the embedding infrastructure entirely. Contexture has a stricter index than that one — coverage is a `doctor` invariant and glosses are authored rather than generated. It has the cross-references. It has never composed them.

Meanwhile the guarantee the store does make about withholding is currently false. `loadGraph` in `src/commands/graph-query.ts` reads the persisted graph and returns it with no admission check, so a graph built before a path was added to `retrieval.exclude_paths` answers `neighbors`, `path`, `hubs`, and every other query with nodes the store no longer admits. `doctor` reports the staleness afterwards; nothing stops the query.

The predecessor change, `retrieval-legs-hardening`, aimed at part of this and cannot land: it defines its zero-tolerance gate over a requesting context's visibility and scope, and `retire-the-access-axes` deleted both three days after it was written. Its corpus requirement, two of its task phases, and half its design rationale name machinery that does not exist, and `openspec validate --strict` does not catch it.

## What Changes

- **Restate `context-retrieval`'s purpose as one pass, not a second leg.** Entry (a catalog section, a path prefix, a note in hand, an entity's backlinks) → expansion (the graph, run over whatever entered) → widening (the agent's own content matching, unchanged and still uncommanded).
- **Add `ctxr context gather`**: entry selectors in; every note reachable from them through the built graph out, each carrying its catalog section, its authored gloss, its hop distance, and the labels explaining why it is there. Identities and glosses, never bodies. Selectors, never a query string.
- **Make exclusion an enforced guarantee across every leg contexture computes**, closing the graph-loader hole that makes it false today.
- **Add demotion as a path-prefix tier distinct from exclusion**, with the configured archive destination demoted by default, so archived material is ordered last rather than ranked identically to live notes.
- **Forbid wall-clock dependence in retrieval output**, as a requirement rather than a habit.
- **Rewrite the routing guidance in place** so it describes the pass and names the command that computes its first two steps.
- **Delete `openspec/changes/retrieval-legs-hardening/`**, recording the disposition of all four of its mechanisms.
- **BREAKING**: `graph query` now exits non-zero on a persisted graph carrying a note the store no longer admits, instead of answering from it. That is the defect being fixed, and the remedy it names is `ctxr graph build`.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `context-retrieval`: the purpose becomes the pass; the composition, the exclusion guarantee, evidence labels, the total order, the budget, the demotion tier, and the wall-clock prohibition are added; the routing requirement is restated to name the command.
- `store-integrity`: `doctor`'s enumerated checks gain the excluded-and-demoted overlap check.

## Impact

Affected code: new `src/core/retrieval/pass.ts` and `src/commands/context-gather.ts`, registered in `src/run.ts` under a `context` group; `loadGraph` in `src/commands/graph-query.ts` (the single seam every graph query already routes through); `src/core/records.ts` reused as the result shape; one new error in `src/core/errors.ts`; one check plus one import and one array entry in `src/core/checks/manifest.ts`; two keys in `src/config/schema.ts`, `src/config/defaults.ts`, and `src/config/render.ts`; `templates/agents/retrieval-leg-routing.md` and `templates/skills/ctxr-connection-finding.md`; a new fixture store under `test/`.

Affected stores: additive except for the corrected graph-query behavior. Both new configuration keys are schema-optional with shipped defaults, so no migration and no `schema_version` bump; a store that never runs `ctxr context gather` retrieves exactly as it does today, except that a stale over-inclusive graph now fails loudly instead of leaking.

No dependency changes. Nothing here is networked, timestamped, or model-backed.

## Non-goals

- **A query string, on this or any command.** The pass takes selectors. A query implies a relevance function between a note and that query, which is precisely the ranker `bootstrap-contexture-core` D2 defers. Stated as a tripwire rather than a preference: **a future change adding `--query`, a weight, or a floating-point value to this command's output reopens D2 and must re-argue it.**
- **A ranker, a score, an embedding, a search command, or a search adapter kind.** D2 and D5 stand. The cited ablation is an argument for developing the graph, not for acquiring the rest of the stack, and GBrain's own evaluation found LLM query expansion *hurt* — 54.89% against 93.19% recall — which is evidence for the deferral rather than against it.
- **A computable leg-routing command**, proposed by the superseded change. Routing a question to a leg is a reading judgment, and the code/judgment seam assigns judgment to the agent. A deterministic classifier over prose is a weaker version of the move GBrain measured as harmful, with less evidence behind it. Its one good idea — report the reason, not just the verdict — survives as the evidence labels, and the drift it existed to prevent is better prevented by giving the prose a real command to name.
- **Catalog section tiers**, also proposed by the superseded change. A section is a path prefix, so the prefix tier already covers a layer; and declaring one taxonomy layer inherently less retrievable than another is an operator preference with no mechanical ground truth. One ordering axis, not two.
- **Note aliases.** Deferred, not rejected — an alias is a third namespace over notes, alongside path identity and filename stem, and it deserves its own argument against `bootstrap-contexture-core` D3 rather than a ride-along. It is also the improvement most worth measuring rather than assuming, so it belongs after a baseline exists.
- **A migration retrofitting the demotion default.** Its only observable effect would be the ordering of a command no existing store has run. Same reasoning as `retire-the-access-axes` D3: do not rewrite what nothing reads.
- **Recency, decay, or hotness ordering.** Refused already by `graph-context-document`, and here it becomes a positive requirement that output cannot vary with the clock — so the refusal is enforced rather than remembered.
- **Wrapping direct content matching.** `context gather` accepts paths, prefixes, section ids and entity names, and never reads a note body to match against anything. The requirement that contexture ship no content-matching command is untouched, and the widening step remains the agent's own.
- **A new owned skill.** The pass is retrieval guidance, and retrieval guidance already has a home in the generated entry-document section. A fourteenth skill would be surface for nothing.
- **Editing archived changes.** `2026-09-02-local-browsing-surface` points a reader at `retrieval-legs-hardening` as "where ranked retrieval is being designed" — now doubly wrong, since that change refused a ranker too. Archives are the historical record; this change's `design.md` is where a reader following that pointer lands.
