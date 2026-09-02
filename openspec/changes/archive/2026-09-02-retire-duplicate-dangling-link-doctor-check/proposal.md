## Why

`graphDanglingLinksCheck` (doctor, `graph.dangling_links`, severity `invariant`) and `brokenLinksCheck`
(lint, `organize.broken_links`, severity `observation`) have byte-identical `run()` bodies — same
`ctx.graph()` call, same `graph.dangling.map(...)`, same message template, same `subject`/`details` shape.
Measured on a real store, the `(subject, target)` finding sets from `ctxr lint` and `ctxr doctor` were
identical: 125/125, zero found by only one side. So the same condition is simultaneously a blocking
invariant and a non-blocking observation, depending only on which command ran — the one thing
store-integrity's "Doctor is distinct from lint" requirement exists to forbid: "No single check SHALL be
duplicated as both a lint finding and a doctor failure for the same underlying condition."

`graph.dangling` actually covers two distinct conditions, distinguished by its own `reason` field
(`not_found` | `ambiguous`), and they don't deserve the same classification:

- **`not_found`** (the target matches no note's basename) is genuinely ambiguous *in intent* — the graph
  cannot tell a typo from a healthy forward reference (a name you'll write about later, a planned hub).
  `context-retrieval/spec.md` already says a dangling link is "reported... without failing the build," and
  `ctxr-organize-audit.md` already tells agents to leave the forward-reference case alone and "never
  fabricate stub notes to silence" it. This class was already doctrine everywhere except doctor.
- **`ambiguous`** (the target's basename matches two or more notes) is not ambiguous in intent at all —
  resolution is mechanically broken, and `ctxr-organize-audit.md` gives it a single, always-applicable fix:
  rewrite with `[[Real Name|display]]` alias syntax. It's structurally closer to an identity collision
  (which doctor already treats as fatal) than to a forward reference.

Blocking on `not_found` forces a false choice between fabricating a stub note (which the project's own
guidance forbids, since it hides the real TODO) or deleting a legitimate forward reference to make doctor
pass — measured concretely: getting one real store's doctor green cost 73 unlinked references, including
one that read `[[...]] (to-create)`, where the author had written the forward-reference intent in plain
English. Not blocking on `ambiguous`, meanwhile, throws away doctor's ability to catch a condition that
has no legitimate "leave it" reading and no source of judgment lint can apply that doctor can't.

This is a latent defect from the project's bootstrap: task 9.4 ("confirm no single condition is
double-counted as both a lint finding and a doctor failure; reconcile any overlap found") was satisfied by
giving the two checks different ids/codes rather than reconciling the overlap, and by treating both
`dangling` reasons as one condition when they aren't. This change reconciles it by splitting on `reason`
instead of picking one side wholesale.

## What Changes

- Doctor's check narrows to the `ambiguous` reason only: rename `graphDanglingLinksCheck` (id
  `graph.dangling_links`) to a check with id `graph.ambiguous_links`, reporting code
  `graph.ambiguous_link`, that fails when the graph has one or more `ambiguous`-reason dangling links and
  ignores `not_found`-reason ones.
- Lint's check narrows to the `not_found` reason only: `brokenLinksCheck` (id `organize.broken_links`,
  code `organize.broken_link`, unchanged) stops reporting `ambiguous`-reason dangling links, since those
  are now doctor's exclusively.
- Update `store-integrity`'s enumeration of doctor's required checks: replace "dangling links and identity
  collisions" with "ambiguous link resolution and identity collisions" — both are invariants; `not_found`
  dangling links are not.
- Update `context-organize`'s lint requirement to scope "broken links" to non-resolving (`not_found`)
  links only, and state explicitly that an ambiguous resolution is doctor's, not lint's — closing the same
  kind of silent cross-spec overlap that caused the original defect, this time on purpose and in the spec
  text itself.
- **BREAKING**: `ctxr doctor --json` no longer reports a `graph.dangling_links` check or fails on a
  `not_found`-reason dangling link; it now reports `graph.ambiguous_links` and fails only on an
  `ambiguous`-reason one. `ctxr lint`'s `organize.broken_link` findings no longer include `ambiguous`-reason
  links (only `not_found`-reason ones) — an operator who was scripting against lint's full dangling-link
  count will see it drop by however many `ambiguous` cases existed.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `store-integrity`: the "`doctor` is machine-readable and fails on real invariants" requirement's
  enumerated check list changes from "dangling links and identity collisions" to "ambiguous link
  resolution and identity collisions."
- `context-organize`: the "Lint reports; it never fails a build" requirement's "broken links" finding is
  scoped to non-resolving (`not_found`) links; an ambiguous resolution is explicitly excluded as doctor's.

## Impact

- `src/core/checks/integrity-checks.ts`: rename `graphDanglingLinksCheck` to a check filtering
  `graph.dangling` to `reason === 'ambiguous'` before mapping to findings; update its id, title, and
  reporting code; update its `INTEGRITY_CHECKS` entry and its explanatory comments (the "genuine identity
  collision is NOT re-checked here" block stays relevant and is preserved; the cross-reference to
  `brokenLinksCheck` is rewritten to describe the reason-based split instead of two checks over the same
  data).
- `src/core/checks/organize-checks.ts`: filter `brokenLinksCheck`'s `graph.dangling` to
  `reason === 'not_found'` before mapping to findings; rewrite its explanatory comment to describe the
  split; the check's id, code, and severity are unchanged.
- `test/unit/integrity-checks.test.ts`: update the `graphDanglingLinksCheck` describe block for the
  renamed check and narrowed behavior (fails only on `ambiguous`, passes when only `not_found` links
  exist).
- `test/unit/organize-checks.test.ts`: add a case asserting `brokenLinksCheck` does not report an
  `ambiguous`-reason dangling link.
- `test/integration/migrate-and-doctor.test.ts`: the "doctor --json on a deliberately broken store..."
  test's dangling-link fixture changes from `not_found` to `ambiguous` reason and its assertion moves to
  the renamed check id; a new case confirms doctor passes on a store whose only defect is a `not_found`
  dangling link.
- No template, skill, or other doc references `graph.dangling_links` or `graphDanglingLinksCheck` by name
  (swept the repo before writing this proposal) — no other doc changes needed beyond the two spec deltas
  above.
- `core/graph/model.ts` (`graph.dangling` computation itself), `ctxr graph build`'s own reporting, and
  `test/integration/graph.test.ts` are untouched — the `reason` field this split relies on already exists
  and needs no change.

## Non-goals

- **Changing how dangling links are detected, computed, or reported by `ctxr graph build`.** The `reason`
  field this split relies on already exists; this change only changes which commands act on which reason.
- **Adding a doctor check for identity collisions beyond what exists today.** None exists today because
  none is needed — a persisted graph is already proof no collision occurred — and this change does not
  revisit that design.
- **Reclassifying any other doctor/lint pair for a similar overlap.** This change fixes the one overlap
  that was measured and proven identical; auditing the rest of the check manifest for other latent
  duplicates is separate work, out of scope here.
