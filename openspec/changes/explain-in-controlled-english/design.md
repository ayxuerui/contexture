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

This change covers explanation. D6 and D7 decide the other two.

## The section

The text the baseline conventions will carry, as measured (543 bytes):

> ## Explaining
>
> When you explain something to the operator, write about 80% of the way to ASD-STE100: one fact per
> sentence, at most 20 words to instruct and 25 to describe, active voice, one word for one thing, lists for
> three or more items, numbers over vague words. Keep the store's names as written. Give each reason its own
> `Why:` sentence. Copy quotes, output and report tables unchanged.
>
> Draw a diagram when structure, flow or sequence would take a paragraph: fenced `mermaid` in notes, pull
> requests and answers; inline SVG in pages.

It names the standard and its rules tersely, because models already know STE: the tip this change follows
works by naming the standard, not by teaching it. It spells out only the departures a model would not infer:
the store's names are technical names, reasons stay (labelled), and copied material is not rewritten.

Before, a real `ctxr-submit` line:

> Validate: run `ctxr doctor` (store scope, not `--staged` — a session's job is to leave the whole store
> healthy, not merely pass one commit's gate). Fix a failure; never bypass it, and never proceed past it.

After, under the section:

> Run `ctxr doctor` on the full store. Do not use `--staged`. If `doctor` reports a failure, fix it. Do not
> continue until it passes. Why: a session must leave the whole store healthy, not only pass the check on
> one commit.

## Decisions

### D1: Scope is every explanation for the operator, not one surface

The tip is "ask your LLM to explain something in ASD-STE100". What makes a text an explanation is its reader
and purpose — the operator, understanding something now — not where it is written. Most explaining happens
in conversation, which no skill governs.

*Alternative: pull requests only.* The strongest case: the pull request is the one text written for the
merge decision, and it is short-lived. Against: it leaves conversation, pages and findings — most of the
explaining — unchanged. Flip: the rules visibly degrade conversation answers, in which case the section
narrows to written artifacts.

### D2: The rules live in the baseline conventions, not in a skill

The section is an every-turn rule: it applies to any answer in any session. The entry document is where
every-turn rules live, and a harness reads it on every session without deciding to.

*Alternative: an owned skill (`ctxr-explanation`) holding the full rule set, a before-and-after example and
the diagram guidance, with a one-line pointer in the entry document and a mention in the submit, publish and
research skills.* This was the earlier draft. The strongest case: a skill has room for examples and
per-surface detail, costs almost no entry-document bytes, and is tuned in one file. Against, raised by the
operator and by one of three reviewers in a critique: a pointer costs nearly as many bytes as the rules
themselves (about 195 against 543), the rule only works if the agent also loads the skill — an extra failure
point exactly where explaining is most frequent — and the three skill edits add regression surface for no
behavior the section does not already give. Flip: the rules need examples or per-surface detail that cannot
fit, or agents apply the terse form wrongly in a way a worked example would fix.

### D3: Raise contexture's entry-document ceiling from 8,500 to 8,900 bytes

The section does not fit under the current ceiling: 7,978 bytes are used, the section adds 545, and the
result is 8,523. The ceiling requirement allows an increase only in a change that argues it. The argument:

- The ceiling is a self-imposed budget, not a harness limit. The binding limit is the smallest harness read
  limit (24 KB), and `ctxr lint` observes a 20 KB target. A fresh store's `AGENTS.md` is 10,553 bytes; the
  operator's two stores are 12,486 and 10,815. 400 more bytes keeps every one of them under half the limit.
- The ceiling exists to stop procedure that belongs in a skill from creeping into the entry document. This
  section is not procedure: it is an every-turn rule, which is what the baseline is for (D2).
- 8,900 also leaves room for the planned records rule (D6, about 80 bytes) and some margin, so the next
  every-turn rule does not force another increase immediately.

*Alternative: trim the section to fit under 8,500.* Measured: removing 23 more bytes is possible (symbols for
"at most", dropping a word from the diagram line), and leaves 6 bytes of margin. The strongest case: the
ceiling has never been raised, and holding it keeps pressure on every byte. Against: it would block D6 and
anything after it, and the cuts make the rules harder to read for the reader they exist to help. Flip: the
records rule (D6) is dropped, and nothing else is queued for the baseline.

### D4: No mechanical check

*Alternative: a `ctxr` command that reports long sentences, passive constructions and vague quantities.*
The strongest case: models count words badly, so an unchecked limit is a suggestion; computing is the
CLI's job; and the trial's result would rest on numbers. Against: sentence splitting and voice detection are
heuristics whose false positives the agent would have to be told to ignore, and conversation answers never
pass through a command. Flip: written explanations (pull requests, pages) that routinely exceed the limits
by a wide margin.

### D5: Trial in a release; roll back if it does not work

The section ships to every store in a normal release. The trial is that release.

*Alternative: trial first in the operator's two stores, by pasting the rules into each store's house
conventions, and release only on a "keep".* All three reviewers in a critique raised this: a release puts an
unvalidated style change in every store before the trial decides. The strongest case: no other store pays for
a bad trial, and it needs no code at all. Against, the operator's decision: the change alters how text reads,
nothing a store depends on; a release that removes it undoes it everywhere on the next `ctxr update`; and a
house-conventions trial tests a copy that then has to be ported, not the shipped text. A store that disagrees
can override the section in its own house conventions today. Flip: another store reports that the section
hurt its reviews before the trial ends.

*Alternative: an opt-in configuration key.* A trial key would stay forever, and it would test only the
stores that set it. Rejected without a flip.

### D6: Records — yes, with a subset of the rules, in a later change

Notes are read again and again, by the operator and by agents, and retrieval has no ranker: content
matching is `rg`. Two rules pay off directly there. **One word for one thing** decides whether a search
finds the note: a store that writes "rollup" in one note and "summary note" in the next splits its own
retrieval. **One fact per bullet** makes a note extendable without rewriting, which the baseline already
asks for. Numbers instead of vague quantities and a named actor make a record checkable later.

The sentence and paragraph limits add little — notes are already bullets — and would fight quoted and
captured material, which stays verbatim as provenance.

So records should take that subset, appended to the existing "Writing notes" rule (about 80 bytes), after
this change's trial ends in "keep". *Against applying it at all:* a style rule on durable content reshapes
every store's text over years, and notes are partly the operator's own writing. That is why it waits. Flip
to "never": the trial ends in "revert".

### D7: Instructions — yes, gradually, never as a bulk rewrite

STE was written for procedures, and skills are procedures. Their failure mode — an agent that skips or
merges a step — is what one instruction per sentence prevents, and the operator also reads skills to audit
what agents are told. The cost is the reasoning: a skill's "because" clauses let an agent handle a case the
skill never listed. The `Why:` sentence keeps it.

Against a rewrite now: about 90 KB across 17 skills; the test suite asserts many exact phrases in them; and no
skill has been observed misread because of its prose. So: apply the rules to step lines whenever a skill is
next edited, recorded as an authoring rule in this repository's OpenSpec context. Flip to a bulk rewrite: a
recorded misreading of a skill step that a controlled rewrite would have prevented.

### Order

Explanation (this change) → records (D6) → instructions (D7, as skills are touched). Each waits on the
evidence from the one before.

## Risks / Trade-offs

- [Conversation answers read as terse] → D1's flip; the trial review covers answers.
- [A harness's own style instructions override the section in conversation] → The trial records, per
  harness, whether the section was followed, so "did not help" is not confused with "was not applied".
- [Copied blocks get "simplified"] → The section says to copy them unchanged.
- [The terse form is applied wrongly] → D2's flip: move to a skill with worked examples.

## Trial and exit criteria

The trial starts with the release that carries this change and runs about two weeks in the operator's
stores (pkm, readyrun-brain).

- **Before:** the last 5 pull request bodies and the last research findings in each store, already in git
  history, are the comparison set. No capture step is needed.
- **During:** for each harness the operator uses (Claude Code, Codex, Antigravity, Hermes), note whether
  explanations follow the section at all.
- **Spot checks:** sentence length against the 20/25 limits, and whether reasons appear as `Why:`
  sentences.
- **Decision:** keep (and queue D6), tune a rule, or revert in the next release.

## Migration Plan

None. The section arrives through `ctxr update`. Reverting removes it and may lower the ceiling back.

## Open Questions

- Should this repository's own pull requests follow the section during the trial?

## Related changes

`render-diagrams-in-notes` relies on the diagram sentence in this section for its guidance, and supplies the
rendering in `ctxr serve`. Diagrams are part of the same judgment — how to explain — and the section is
always loaded, so it also reaches agents writing notes.
