## Context

See `proposal.md`. `missingRequiredSection` (`src/core/ingest/required-sections.ts`) collects every ATX heading in
the capture's body into a set, level-agnostic and case-sensitive (`capture-is-an-owned-skill` D6), and passes if the
declared name is in it. `ctxr ingest` calls it with `flags.sourceType`, the invocation's type, and then stamps that
same value over the capture's own `source-type`. #97 (open since 2026-09-16, now 119 commits behind) designed the
two strengthenings below against 0.13.0, before this implementation landed.

I measured the current behaviour before designing anything: five cases against a declared `circleback: Transcript`
on 0.20.1. Only "no section at all" is refused.

## Goals / Non-Goals

**Goals:** make the declared section a real guard against an empty or fake one; make the declaration impossible to
route around by naming a different type; keep the check shape-only.

**Non-Goals:** see `proposal.md`.

## Decisions

**D1 — A section counts only when something is under it, and headings in code fences are not headings.**

*The case for leaving presence as the whole test:* the existing requirement says, in so many words, "only its
presence is" decidable, and a stricter rule reads as the check moving toward judging content. A store can already
declare its own bar by what it names.

*Against:* an empty heading is not the record, and the declaration exists to stop a capture standing as provenance
without it. "Has something under it" is still derived from the bytes alone and still says nothing about
completeness, so the requirement's real line (shape, not fidelity) holds. The fence rule is the same observation:
a `## Transcript` inside a code block is a string in a document about markup, not a section of the capture. The
statement "only its presence is" is reworded, not dropped: what is decidable is that the section exists and holds
something.

*Definition used:* a section is the declared heading plus the lines up to the next heading of the same or a
shallower level, or the end of the file. It holds content if at least one of those lines is non-blank and is neither a
heading nor a fence's own opening or closing line. Lines inside a fenced code block count as content once the
heading is real, since a transcript pasted in a block is still a transcript. An empty code block does not, or a
bare pair of fences would satisfy the guard. Heading *detection* ignores fenced lines; content *counting* does not.

*Flip condition:* a source whose real record is legitimately only sub-headings with text under them. Sub-headings
with text count (their text lines are non-blank non-heading lines inside the section), so this should not arise.

**D2 — A disagreement between the capture's own source type and the invocation's is an error.**
Three rules were considered.

1. *The invocation wins (today's behaviour, made explicit).* Compatible: nothing that passes today starts failing.
   But the declaration is then consulted under whatever a caller types, and the capture's own claim is erased with
   no signal, so the rule can be bypassed by accident as easily as on purpose.
2. *The capture's own type wins when present.* Closes the bypass and trusts the pipeline that wrote the file and
   knew what it was. But then `--source-type` is silently ignored on exactly the files where a caller might be
   correcting a mistake, which is the same silent overwrite pointed the other way.
3. **A disagreement is refused, naming both. (Chosen.)** Nothing is silently replaced, the declaration cannot be
   avoided, and the caller who meant to override has an unambiguous message and an easy fix: edit the capture or
   fix the flag. It also matches how ingest already treats the other contradictions it can see, such as a capture
   that already carries a hash, by refusing and writing nothing.

*Cost of 3:* a pipeline that passes a flag different from its own frontmatter starts failing. I know of none, and
the failure names what to change, but it is a behaviour change, which is why this is a change and not a fix.

*Flip condition:* evidence that real pipelines routinely pass a flag different from what they wrote; then rule 1,
with the mismatch reported as a finding instead of a refusal.

**D3 — Scope the conflict rule to the source type only.** The declaration is keyed on the type, so the type is
what must be trustworthy. The id has the same overwrite (a store lost a prefixed id to a bare flag on 2026-09-23),
but it keys nothing, refusing it would affect more callers, and bundling it would make D2's cost larger without
strengthening the guard. Recorded here so it is a decision and not an omission.

**D4 — `lint` keeps its behaviour.** Material in the inbox has no invocation, so it is checked under its own
frontmatter type, with the stricter meaning of "section" from D1 because it calls the same function. The
type-disagreement refusal has no inbox analogue.

**D5 — No new configuration.** Both rules apply to every declaration. A switch to keep the old looseness would
preserve exactly the behaviour the change exists to remove.

## Risks / Trade-offs

- **A capture that passes today is refused tomorrow.** → Only when the declared section was empty or fenced, or the
  type disagreed. The refusal names which, and nothing is written, so the fix is an edit and a retry.
- **Fence detection must not misread a real heading.** → Heading detection tracks open and close fences with the
  same rule markdown uses (three or more backticks or tildes, closed by the same character); the test suite carries
  the nested and unclosed cases.
- **A section whose only content is deeper sub-headings with no text.** → Counted as empty, which is the intent.

## Migration Plan

No data migration; nothing already retained is re-checked. Ships in a release; stores pick up the capture guidance
wording on their next `ctxr update`.

## Open Questions

- Should the refusal for an empty section say "empty" or "absent"? Wording only; it does not affect the
  requirement or the tasks.
