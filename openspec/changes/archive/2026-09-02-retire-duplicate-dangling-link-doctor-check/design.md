## Context

See proposal.md - Why. Two registered checks (`graph.dangling_links` in doctor's invariant lane,
`organize.broken_links` in lint's observation lane) compute over the identical data
(`ctx.graph().dangling`), and until now neither filtered by the `reason` field
(`DanglingReason = 'not_found' | 'ambiguous'`, `src/core/graph/model.ts`) that already distinguishes two
different conditions. Both checks are wired through the same manifest
(`src/core/checks/manifest.ts`); `doctor` and `lint` each filter that one manifest by `severity`.

## Goals / Non-Goals

**Goals:**
- Doctor stops failing on `not_found` links (can't be told apart from a healthy forward reference) while
  starting to fail specifically on `ambiguous` links (always a mechanical defect, never a legitimate
  "leave it" case).
- Lint keeps reporting `not_found` links exactly as today, and stops reporting `ambiguous` ones, so each
  reason has exactly one owner.
- The `reason` field this relies on already exists on every dangling-link record; no change to
  `graph.dangling`'s computation.

**Non-Goals:**
- Auditing the rest of the check manifest for other latent lint/doctor overlaps (see proposal.md
  Non-goals).
- Changing how identity collisions are handled, or adding a second doctor mechanism for them.

## Decisions

**Split by `reason`, not by deleting one side wholesale.** An earlier draft of this change deleted the
doctor check outright, on the reasoning that lint already covers the identical condition. That's true for
`not_found` but not for `ambiguous`: `ctxr-organize-audit.md`'s own classification never tells an agent to
"leave" a basename collision — it's always fixable with alias syntax — so treating it with the same
permissive severity as a forward reference throws away a real invariant doctor could catch. Filtering both
checks by `reason` keeps each condition owned exactly once, matching what the two conditions actually are
rather than treating "dangling" as one thing.

**Rename the doctor check (`graph.dangling_links` → `graph.ambiguous_links`) rather than keep the old id
with narrowed behavior.** The project's own "enforcement is a gate, not a cage" rule requires every
"is enforced" claim to name its actual mechanism; a check called `graph.dangling_links` reporting `pass`
would misstate what's true once it only inspects the `ambiguous` subset — a store can still have `not_found`
dangling links and see this check pass. Renaming makes the claim accurate. `organize.broken_links` (lint)
keeps its id: its behavior narrows but "broken link" (a link resolving to no note) is still an accurate
description of what it reports.

**Add an explicit spec scenario to `context-organize`, not just `store-integrity`.** The original defect
was one requirement (store-integrity's doctor enumeration) silently overlapping another (context-organize's
lint enumeration) with no cross-reference in either spec's text. Fixing only the doctor side and leaving
lint's "broken links" wording unqualified would reproduce exactly that failure mode for the `ambiguous`
subset — a future reader of context-organize alone would have no way to know `ambiguous` is carved out.
Both spec deltas state the boundary explicitly and reference each other's capability by name.

## Risks / Trade-offs

- [Risk] A store whose only failing `doctor` check was a `not_found`-reason dangling link silently goes
  from failing to passing after this change lands. → Mitigation: this is the intended, spec-mandated
  behavior; `ctxr lint` still surfaces every one of those findings, unchanged, so nothing about the store's
  health becomes invisible — only non-blocking. Called out as **BREAKING** in the proposal.
- [Risk] A store whose only lint finding was an `ambiguous`-reason link stops seeing it in `ctxr lint` and
  starts seeing `ctxr doctor` fail instead — a workflow that only ever runs `lint` (e.g. a read-only health
  dashboard) would stop seeing that finding at all. → Mitigation: called out as **BREAKING** in the
  proposal; `ambiguous` links are rarer in practice than `not_found` ones (basename collisions require two
  notes sharing a name), and the finding is strictly upgraded in severity, not silenced — `doctor --json`
  still reports it, just under a different command.
- [Risk] Renaming the doctor check's id could break a script or dashboard that greps `doctor --json` output
  for `graph.dangling_links`. → Mitigation: unavoidable given the check's old name is now inaccurate; this
  is already inside the same **BREAKING** release note as the behavior change itself, so it's one break to
  absorb, not two.

## Migration Plan

No data migration — this only changes which checks the CLI registers, what each filters on, and one
check's id/title/code. Deploys as a normal release; a store on the new version stops seeing
`graph.dangling_links` in `doctor --json` (replaced by `graph.ambiguous_links`, narrower scope) and stops
seeing `ambiguous`-reason findings in `ctxr lint`. No `contexture.yaml` schema change, no `ctxr migrate`
step. Rollback is a normal revert, no data to restore.
