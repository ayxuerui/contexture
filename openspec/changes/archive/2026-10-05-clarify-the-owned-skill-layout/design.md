## Context

See `proposal.md`. The sentence at issue is in the first paragraph of *Contexture-owned skills are copied into the
store and refreshed by update* (`openspec/specs/harness-portability/spec.md`), written when every owned skill was
exactly one file. *Owned skills may carry supporting files* was added later, as its own requirement.

## Decisions

**D1 — Reword the layout clause rather than leave the two requirements to be read together.**

*The case for leaving it:*
- The later requirement already says a skill may carry files beside `SKILL.md`, and requirements are meant to be
  read as a set.
- Any edit to a MODIFIED requirement risks dropping a scenario at archive time; this one has only one, but the
  rule applies.

*Against:*
- A reader checking "what does a store carry for a skill" lands on the first requirement and stops. It names a
  layout the only skill with supporting files does not have.
- The edit is one clause, with the single scenario carried through unchanged, so the risk is checkable: the
  archive's scenario count must stay at 1.

*Flip condition:* none; if a third requirement later touches the layout again, fold the wording into one place then.

**D2 — Point at the other requirement by name, not restate it.** Restating what supporting files may be would
create a second place to keep in step. The clause says only that they are part of the layout and names the
requirement that governs them.

## Risks / Trade-offs

- A MODIFIED delta must carry the whole requirement. → The block here is the full text with the one clause changed,
  and the verification step compares the archived result against the delta.
