## Context

See proposal.md — Why. This is a spec sync, not a behavior change; the shape of the delta is set by
what the shipped code already does and by what the rest of `harness-portability` already says:

- `renderBaselineConventions` (`src/core/convention-doc.ts`) renders the baseline from the shipped
  template and the store's config; `renderBaselineBlock` (`src/core/agents-doc.ts`) places it as the
  first block of the conventions section with a provenance label naming the tool, not a path.
- `removeManagedBaselineFile` removes an earlier version's copy under either of its two historical
  names, guarded on the managed-owner marker, and is run by `reconcileStore` before the conventions
  section is rebuilt. `init` no longer writes the file.
- `checkAgentsMdDrift` checks the synthesized baseline block on its own and reports it under its label,
  which both `ctxr doctor` (`harness_portability.agents_md_convention_drifted`) and
  `ctxr verify --portable` surface.
- "Operator conventions are inlined into the entry document" governs scanned operator files;
  "The entry document's inlined content matches its sources" governs drift. Neither mentions the
  baseline file, and both hold of the shipped behavior as written.

## Goals / Non-Goals

**Goals:**

- The main spec stops asserting a file the tool deletes.
- Every clause of the removed requirement that still holds keeps a home, so the removal loses no
  guarantee by accident.
- The replacement is checkable against existing tests, with no behavior change.

**Non-Goals (design-level, beyond the proposal's):**

- No rewording of the two adjacent requirements above. Each is correct; touching them would only add
  MODIFIED blocks that must carry their full text and scenarios for no behavioral reason.

## Decisions

### D1 — Remove the file requirement; do not restore the file

**The strongest case for restoring it.** The spec is meant to be the authority, and the requirement
arrived through a reviewed change (`compose-store-guidance-documents`) while 9b81464 reversed it with no
OpenSpec delta at all. Treating the spec as the bug rewards exactly the process skip the spec exists to
prevent; the principled reading is that the code drifted and should be put back. The file also had
real uses. It made the baseline a standalone document an agent could open, grep, or cite by path without
parsing a generated section out of `AGENTS.md`, which fits the "operable with Read/Write/Grep alone"
premise. It made the tool-owned text diffable on its own, so a reviewer could see exactly what a release
changed in the baseline without it being interleaved with operator conventions. And shipped prose still
assumes it: `ctxr-session-capture` tells the agent to "read that file first".

**Why that loses.** Every one of those uses survives without the file. The baseline is still inlined in
full in `AGENTS.md`, under its own heading, so an agent with Read and Grep finds it there — the
entry-document requirement already says reading `AGENTS.md` alone is sufficient. A release's baseline
change still shows up as a self-contained hunk inside the fenced conventions section. What the file
added on top was cost, all of it recorded in 9b81464: the same bytes committed twice, a diff in both
places on every config change, a two-hop staleness chain, and the "edit this one, not that one" footgun
that fired on a real user. Restoring it now is also no longer free: every store that has run `ctxr
update` since 9b81464 has had the file deleted as a tracked change, so restoring would re-add a tracked
file to every store and need a third transition in the cleanup code. The process objection is real but
is answered by fixing the record — this change — not by reverting good behavior to match a stale
document. The "read that file first" prose is a defect in the skill, corrected here (task 3.1).

### D2 — ADD a new requirement rather than MODIFY "Operator conventions are inlined into the entry document"

**The strongest case for MODIFY.** One requirement would then own the whole conventions section, so a
reader finds the baseline and the operator files in one place and cannot miss either. Two requirements
describing one generated section risk drifting from each other, which is the very failure this change is
cleaning up.

**Why ADD wins.** The baseline is not an operator convention, and the existing requirement's name, its
"every convention file present", and its "provenance line naming its source path" are all true *only*
of scanned operator files. Folding the baseline in would mean either renaming the requirement (a RENAMED
plus a MODIFIED that must carry all three of its scenarios verbatim) or leaving a name that misdescribes
half its body — and names should read clearly where they are read. The new requirement is the direct
successor of the removed one: it is about the baseline, it carries the removed one's surviving clauses
and its three scenarios' intent, and it reads as a replacement in the archive. The drift risk is bounded
because the new requirement states the ordering ("ahead of every operator convention document") rather
than restating the operator-file rules, so the two cannot contradict each other. Because the names
differ, this is not a REMOVED+ADDED of one name, which OpenSpec refuses.

### D3 — Which clauses carry forward, and which do not

| Removed clause | Disposition |
|---|---|
| Rendered from the store's own config, never a profile's or a deployment's names | Carried, verbatim intent |
| `init` writes it; update rewrites it on template/config change | Carried as "renders into `AGENTS.md`", with the config-change scenario |
| Update leaves every other guidance file, including the operator's, untouched | Carried, with the managed-copy removal as the one stated exception and an operator-file-at-the-old-name scenario |
| Byte-stable when nothing changed | Carried, with the second-update scenario |
| Discovered by the same scan that inlines every convention document | **Retired.** The baseline is synthesized; its replacement is the "opens the section, provenance names contexture" clause |

Two clauses are new: drift attribution to the baseline by name (shipped in 9b81464, previously
unspecified because a file had a path to blame) and the managed-copy removal (the migration). Both are
observable and already tested, so specifying them adds no implementation work.

### D4 — Leave the template-selection requirement's "baseline conventions" mention alone

The other main-spec hit, in the template-selection requirement, says a directory's `README.md` is one
"the baseline conventions already direct an agent to read". That is a statement about the baseline's
content, which the inlined baseline's "Directory-scoped conventions" section still carries. It asserts no
file, so changing it would be churn.

## Risks / Trade-offs

- [The new requirement over-specifies the removal of earlier copies, which future cleanup might want to
  drop once no store carries one] → The requirement scopes it as an exception for copies "an earlier
  version wrote"; a later change can REMOVE that paragraph and its scenario when the cleanup code goes,
  with no effect on the rest.

## Migration Plan

None. The change edits only `openspec/`; archiving it replaces one requirement in
`openspec/specs/harness-portability/spec.md`. Rollback is reverting the archive commit.
