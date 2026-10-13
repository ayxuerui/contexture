## Context

ASD-STE100 (Simplified Technical English) has two parts. Part 1 is about 65 writing rules. Part 2 is a
dictionary of about 900 approved words, each with one meaning and one part of speech, plus a rule that a
domain's own technical names and verbs are allowed. "80% of the way" means: take the Part 1 rules that
carry readability, and leave the dictionary and the grammar restrictions.

What agents write in a store falls into three kinds, by reader:

| Kind | Examples | Reader | When it is read |
|---|---|---|---|
| Explanation | an answer, a pull request, a page's prose, research findings | the operator | now, once |
| Record | notes, rollups, the log | agents and the operator | later, many times, often by `rg` |
| Instruction | skills, the entry document | agents | every session |

This change covers explanation. D5 and D6 decide the other two.

## The rule set

The text `ctxr-explanation` will carry, modulo final wording under the test suite's guards:

> - Write one instruction or one fact in each sentence.
> - Use 20 words or fewer in a sentence that tells the reader to do something. Use 25 words or fewer in a
>   sentence that describes something.
> - Use the active voice and name who or what acted: "`ctxr doctor` found 2 dangling links", not "2
>   dangling links were found".
> - Use one word for one thing. If you call a note a "rollup", do not also call it a "summary note".
> - Keep the store's own names exactly as written: note titles, folders, commands, fields. They are
>   technical names, not words to simplify.
> - Put three or more items, or any sequence of steps, in a list.
> - Give numbers, not vague quantities: "4 notes", not "several notes".
> - Keep "the", "a" and "an". Do not remove words to make a sentence shorter.
> - Keep a paragraph to 6 sentences or fewer, on one subject.
> - Put a reason in its own sentence that starts with `Why:`. That sentence may be longer than 25 words
>   when splitting it would lose the meaning.
>
> Copy, do not rewrite: quoted text, command output, code, and every table or block a skill tells you to
> copy from a report. Do not use the STE approved-word dictionary or its limits on verb tenses.

Before, from a real `ctxr-submit` line:

> Validate: run `ctxr doctor` (store scope, not `--staged` — a session's job is to leave the whole store
> healthy, not merely pass one commit's gate). Fix a failure; never bypass it, and never proceed past it.

After:

> Run `ctxr doctor` on the full store. Do not use `--staged`. If `doctor` reports a failure, fix it. Do not
> continue until it passes. Why: a session must leave the whole store healthy, not only pass the check on
> one commit.

## Decisions

### D1: Scope is every explanation for the operator, not one surface

The tip this change follows is "ask your LLM to explain something in ASD-STE100". What makes a text an
explanation is its reader and purpose — the operator, understanding something now — not where it is
written. A rule scoped to pull requests alone would leave conversation, pages and research findings, which
are most of the explaining, untouched.

*Alternative: pull requests only, as a trial.* The strongest case: the pull request is the one text written
for the operator's merge decision, it is short-lived, and a bad trial costs a few awkward pull requests.
Against: it tests the rules on the narrowest slice of explanation and leaves the operator's most frequent
reading — answers in conversation — unchanged. Flip: the rules visibly degrade conversation answers
(robotic, over-split), in which case scope narrows to written artifacts.

### D2: The rules live in an owned skill; the entry document carries one routing line

Four places explain to the operator: conversation, `ctxr-submit`, `ctxr-publish`, `ctxr-research`. One file
holds the rules so they are tuned in one place. Conversation is reached by no skill, so one line in the
baseline conventions — inlined into every entry document, read every turn — routes any explanation to the
skill.

*Alternative: the whole rule set in the baseline conventions.* The strongest case: an always-loaded rule
needs no skill discovery, and a harness that loads skills unreliably would still apply it. Against: the
rule set is about 1 KB and contexture's share of the entry document has about 520 bytes left under its
8,500-byte ceiling, part of which `render-diagrams-in-notes` also asks for; raising the ceiling needs its
own argued change. Flip: evidence that agents follow the routing line but do not load the skill.

*Alternative: inline in each consuming skill.* Four copies drift. Rejected without a flip.

The name is a noun for the judgment, as `ctxr-research` is: there is no `ctxr explanation` command, and
`ctxr-explain` would read as one.

### D3: No mechanical check

*Alternative: a `ctxr` command that reports long sentences, passive constructions and vague quantities.*
The strongest case: models count words badly, so an unchecked limit is a suggestion; computing is the
CLI's job; and the trial's result would rest on numbers. Against: sentence splitting and voice detection are
heuristics whose false positives the skill would have to tell the agent to ignore, and conversation answers
never pass through a command. Flip: written explanations (pull requests, pages) that routinely exceed the
limits by a wide margin.

### D4: Every store gets it; no configuration key

*Alternative: an opt-in key with no shipped default.* The strongest case: other users of the npm package
get a style change they did not ask for. Against: it changes how text reads, nothing a store depends on;
reverting is one release; a trial key stays forever. A store's house conventions can already override the
baseline line. Flip: a report that the style hurt a store's reviews.

### D5: Records — yes, with a subset of the rules, in a later change

Notes are read again and again, by the operator and by agents, and retrieval has no ranker: content
matching is `rg`. Two STE rules pay off directly there. **One word for one thing** decides whether a search
finds the note: a store that writes "rollup" in one note and "summary note" in the next splits its own
retrieval. **One fact per bullet** makes a note extendable without rewriting, which the baseline already
asks for. Numbers instead of vague quantities and an active voice that names the actor make a record
checkable later.

The other rules add little: notes already use outliner bullets, which keeps sentences short, and the length
limits would fight quoted and captured material, which must stay verbatim as provenance.

So records should follow a subset — one word for one thing, one fact per bullet, numbers, a named actor —
added to the existing "Writing notes" bullet (about 80 bytes), not the full rule set.

*Against applying it at all:* notes are the operator's own writing as much as the agents', and a style rule
on durable content reshapes every store's text over time. That is why it is a separate change, after this
one has shown whether the rules read well. Flip to "never": the explanation trial reverts.

### D6: Instructions — yes, gradually, never as a bulk rewrite

STE was written for procedures, and skills are procedures. Their failure mode — an agent that skips or
merges a step — is what one-instruction-per-sentence prevents, and the operator also reads skills to audit
what agents are told.

The cost is the reasoning. A skill's "because" clauses are what let an agent handle a case the skill never
listed, and plain STE deletes them. The `Why:` label answers that: the step becomes controlled, the reason
stays, labelled.

Against a rewrite now: about 90 KB across 17 skills; the test suite asserts many exact phrases in them, so a
rewrite is a large, risky diff; and no skill has been observed misread because of its prose.

So: apply the rules to step lines (keeping reasons as `Why:` sentences) whenever a skill is next edited,
recorded as an authoring rule in this repository's OpenSpec context, not shipped to stores. The entry
document follows the same path. Flip to a bulk rewrite: a recorded misreading of a skill step that a
controlled rewrite would have prevented.

### Order

Explanation (this change) → records (D5, one bullet) → instructions (D6, as skills are touched). Each step
waits on the evidence from the one before.

## Risks / Trade-offs

- [Conversation answers read as terse] → D1's flip; the exit review covers answers as well as artifacts.
- [Copied blocks get "simplified"] → The skill says to copy report-derived content unchanged.
- [The harness's own style instructions conflict with the routing line] → The routing line is a store
  convention; where a harness instruction wins, explanations in that harness are unchanged, which the exit
  review would show.

## Trial and exit criteria

After about two weeks of use in the operator's stores (pkm, readyrun-brain), the operator compares
explanations — answers, pull requests, pages — with what came before, and decides: keep and move to D5,
keep as is, tune a rule (D5's `Why:` exemption is the likeliest), or revert.

## Migration Plan

None. The skill and the baseline line arrive through `ctxr update`. Reverting removes both.

## Open Questions

- Should this repository's own pull requests follow the rules during the trial?

## Related changes

`render-diagrams-in-notes` adds a "when a diagram fits" section to `ctxr-explanation`, because choosing a
diagram over sentences is the same judgment as choosing the sentences' shape: how to explain. That change
depends on this one landing first. Its guidance also covers diagrams in notes, which this change's
sentence rules do not reach, so the routing line names both: explaining something to the operator, and
drawing a diagram anywhere. That costs about 25 more bytes than routing explanations alone, and keeps one
copy of the diagram guidance instead of a second one in the baseline.
