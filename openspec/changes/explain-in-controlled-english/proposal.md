## Why

Agents now do most of a store's legwork, and the operator's work has moved to understanding what they did:
reading an answer, a pull request, a page, a research finding. All of that is explanation, written for one
reader, and agents write it the way they write everything else: long sentences, parenthetical asides,
passive voice, and a different word for the same thing in each paragraph. The reader reads it twice to
find the one fact that matters.

ASD-STE100 Simplified Technical English is a controlled-language standard written for aircraft
maintenance documentation, where a misread sentence is expensive. Language models already know it, so
asking for it costs a paragraph of instruction. The full standard is too strict for this use: its approved
dictionary of about 900 words fights a store's own vocabulary, and it drops the reasons a reader needs.
Its style rules — one fact per sentence, short sentences, active voice, one word for one thing, lists for
sequences — carry most of the benefit. This change adopts those rules, "about 80% of the way to STE", for
every explanation an agent writes for the operator.

## What Changes

- A new owned skill, `ctxr-explanation`, carries the rule set (and, through `render-diagrams-in-notes`,
  when a diagram fits): when it applies, the rules adopted from
  ASD-STE100, the rules left out, a before-and-after example, and what is copied rather than rewritten.
- It applies whenever an agent explains something to the operator: an answer in conversation, the prose of
  a pull request (title, body, commit message), the prose of a published page, and research findings
  reported to the operator.
- It does not apply, in this change, to records (notes) or instructions (skills, the entry document).
  design.md D5 and D6 say whether and how each should follow, and in what order.
- The baseline conventions gain one line, rendered into every entry document, that routes any explanation
  to the skill. Most explaining happens in conversation, outside any skill, so only an every-turn rule
  reaches it.
- `ctxr-submit`, `ctxr-publish` and `ctxr-research` each name the skill at the step where they write for
  the operator. `ctxr-publish` states how it combines with the vendored `eli5` skill: `eli5` sets the
  level, `ctxr-explanation` sets the sentence shape.
- The adopted rules: one instruction or one fact per sentence; at most 20 words in a sentence that
  instructs and 25 in one that describes; active voice naming the actor; one word for one thing; the
  store's own names kept exactly as written; three or more items or any sequence as a list; numbers
  instead of vague quantities; articles kept; at most six sentences in a paragraph; a reason in its own
  sentence labelled `Why:`, exempt from the length limit.
- Left out: the approved-word dictionary, the limits on verb tenses and `-ing` forms, and the separate rules
  for warnings and cautions.

## Non-goals

- **Records and instructions.** Argued in design.md D5 and D6, each with its own later change.
- **A mechanical check.** No `ctxr` command counts words or flags passive voice (D3).
- **A configuration key.** The skill ships to every store (D4).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `harness-portability`: ADDED requirements for the owned skill, the baseline routing line, and the three
  skills that name it. No existing requirement is modified, so this change does not collide with
  `review-the-knowledge-diff` (which modifies the submit requirement) or `render-diagrams-in-notes` (which
  adds a baseline requirement).

## Impact

- `templates/skills/ctxr-explanation.md` (new) and its seed in `src/core/skills.ts`.
- `templates/conventions/baseline-conventions.md`: one line, about 170 bytes, under the 8,500-byte ceiling
  on contexture's share of the entry document (7,978 bytes used on 2026-10-13).
- `templates/skills/ctxr-submit.md`, `ctxr-publish.md`, `ctxr-research.md`: one sentence each.
- `test/unit/skills.test.ts` and the baseline tests. No CLI command, configuration schema or migration.
  Stores receive it on their next `ctxr update`.
