## Context

See `proposal.md` — Why, and the three spec deltas under `specs/` for the requirement set. This change depends on `separate-scope-and-name-the-axes` for the scope selector and the combined pre-filter, and on `write-lifecycle`'s existing derived-path guarantees, which it reuses rather than restates.

The founding design already concedes the shape of the problem: "enforcement is a gate, not a cage," and the only guarantee any specification may assert is bounded to what contexture itself computes. That is a correct and honest position, and it leaves a real gap — there is no way to hand another tool a subset of the store that is safe *because of what it contains* rather than because that tool agreed to filter.

GBrain supplies the evidence that the gap matters. Its per-page `visibility:` frontmatter has "no query filters on it"; protection there means placing content where a caller holds no grant, and its isolating primitive is a source marked `federated=false`. It also supplies the specific bug this change is written to preempt: its private-page filter "folds into the query-cache key, so trusted and untrusted runs never share cache rows." A derived artifact built for one requester and served to another is a leak with no note-level mistake anywhere in it.

## Goals / Non-Goals

**Goals:**
- Make it possible to produce a subset of the store whose safety does not depend on the consumer's cooperation.
- Fix the cache-key hazard by requirement, before any per-requester artifact exists to be got wrong.
- Give the requesting context the same resolution discipline every other resolved input already has.

**Non-Goals:**
- Specifying anything that consumes a projection. The corpus is the deliverable; an index over it is deferred work with its own change.
- Changing the enforcement posture. This adds a mechanism that is stronger for one specific use, and narrows no existing claim.
- Making filtering mandatory. The chain makes the resolved context visible and reportable; requiring one is a separate breaking change.

## Decisions

### D1 — The corpus is the boundary, not the label
A projection excludes by not writing. A consumer that indexes it cannot surface an excluded note by any means — not by ranking it, not by traversing to it, not by summarizing it into an answer whose citation was dropped. That last case is the one a query-time filter handles worst and the one a per-note label handles not at all, and it is why the requirement is written as "an excluded note's body, gloss, frontmatter, path, and identity SHALL be absent from every file" rather than "excluded from results." Alternative considered: specifying a filtered read API for consumers to call — rejected, because it makes the guarantee depend on every consumer calling it correctly, which is precisely the arrangement GBrain reports does not hold.

### D2 — Key the artifact, and specify it before building one
Requiring the location to be determined by both the requesting context and the scope selector is cheap now and expensive to retrofit: a projection accidentally shared between two contexts is a leak that no note-level review would catch, and the scenarios are the only place a reviewer would notice the omission. Contexture is currently safe by accident — the graph artifact is built once and filtered per query, so nothing is keyed per requester yet. This change is the moment that stops being true, so the requirement lands with it rather than after.

### D3 — The secret scan moves to the boundary, and stays one implementation
The store already scans for secret-shaped content when changes are committed. Materializing content outside the store tree is the other moment content escapes review, and it currently has no check. The requirement deliberately specifies the *same* check rather than a second one, with a scenario asserting one pattern list — a second list would drift, and the drift would be silent in the direction that matters.

Blocking the entire projection on one match, rather than omitting the offending note, is deliberate: silently dropping a note would make the projection quietly incomplete, and incompleteness that nobody is told about is the failure mode the catalog's coverage invariant exists to prevent elsewhere.

### D4 — The resolution chain reports rather than requires
Every step of the chain is added, and none of them changes what happens when nothing resolves: the command behaves exactly as it does today. What changes is that the store can now say what it *would* resolve, and `doctor` reports when the answer is "nothing." That converts an invisible default into a visible one without breaking a single existing invocation, and it produces the bindings a later change would need before requiring a context is anything other than a wall of errors. Alternative considered: requiring a context now and defaulting to the most restrictive one — rejected, because a default that filters silently is worse than one that does not filter at all: the operator sees fewer results with no indication why.

### D5 — A declared adapter that resolves to nothing is an error
Adapter absence and adapter breakage currently collapse into the same path: an unconfigured kind degrades, and a declaration that resolves to nothing also, in effect, degrades. The first is a supported configuration; the second is a typo that silently disables a capability the operator asked for. GBrain's guardrail seam makes the same distinction explicitly — a failing classification fails open and never breaks a call, but a guardrail module that is configured and registers nothing exits non-zero — and the asymmetry is right for the same reason here.

## Risks / Trade-offs

- **[Risk] A projection duplicates note content on disk,** once per requesting context and scope combination, so a store with many contexts multiplies its own size. → **Mitigation**: the projection is a declared derived path, so it is gitignored, never committed, and disposable; it is built on demand rather than maintained. The alternative — one shared corpus with a query-time filter — is the arrangement this change exists to avoid.
- **[Risk] A stale projection can be indexed after the store has moved on,** presenting old content as current. → **Mitigation**: byte-stability makes a rebuild cheap to compare, and the projection is derived, so the honest answer is that freshness is the consumer's contract. Specifying a staleness guarantee here would be specifying a consumer, which this change deliberately does not do.
- **[Risk] Blocking the whole projection on one secret match** can leave an operator unable to produce a corpus over a single false positive. → **Mitigation**: the failure names the note and the matched pattern class, so the fix is scoped; and the same pattern would already be blocking that note's commits, so the projection is not introducing a new class of stall.
- **[Trade-off] The marker-file step in the resolution chain adds a second place a context can come from,** which is one more thing to look for when behavior surprises someone. → Accepted, and mitigated by requiring every resolution to report *which* step produced it, so the answer to "why this context" is always available rather than inferred.
- **[Trade-off] This change specifies a corpus with no consumer in-tree.** Nothing exercises a projection end-to-end until a later change indexes one. → Accepted: the requirements are all independently testable against the projection's own output, and the leak test — grep the whole projection tree for an excluded note's content — is the strongest single assertion in the project and does not need a consumer to be meaningful.

## Migration Plan

Additive throughout. No schema version bump, no migration. A store that never builds a projection and always passes its requesting context explicitly behaves identically before and after.

One sequencing constraint: the projection build must land after the combined pre-filter from `separate-scope-and-name-the-axes`, because a projection that filtered on one axis only would be exactly the leak this change is written to prevent.

## Open Questions

None. Whether to make the requesting context mandatory, and what should consume a projection, are both deliberately deferred to their own changes and neither affects the requirements here.
