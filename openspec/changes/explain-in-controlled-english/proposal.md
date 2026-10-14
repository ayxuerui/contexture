## Why

Agents now do most of a store's legwork, and the operator's work has moved to understanding what they did:
reading an answer, a pull request, a page, a research finding. All of that is explanation, written for one
reader, and agents write it the way they write everything else: long sentences, parenthetical asides,
passive voice, and a different word for the same thing in each paragraph. The reader reads it twice to
find the one fact that matters.

ASD-STE100 Simplified Technical English is a controlled-language standard written for aircraft
maintenance documentation, where a misread sentence is expensive. Language models already know it, so
naming it costs a few lines. The full standard is too strict for this use: its approved dictionary of about
900 words fights a store's own vocabulary, and it drops the reasons a reader needs. Its style rules — one
fact per sentence, short sentences, active voice, one word for one thing, lists for sequences — carry most of
the benefit. This change adopts those rules, "about 80% of the way to STE", for every explanation an agent
writes for the operator.

## What Changes

- The shipped baseline conventions, inlined into every store's `AGENTS.md`, gain a short "Explaining"
  section (543 bytes). It applies whenever an agent explains something to the operator — an answer in
  conversation, a pull request, a page, a research finding — and states:
  - the adopted rules: one fact per sentence; at most 20 words to instruct and 25 to describe; active voice;
    one word for one thing; lists for three or more items; numbers instead of vague words;
  - the departures from STE that keep it useful here: the store's own names stay as written, each reason gets
    its own sentence starting `Why:`, and quotes, command output and report tables are copied unchanged;
  - when to draw a diagram instead, and in what form (the guidance `render-diagrams-in-notes` relies on).
- contexture's ceiling on its own share of the entry document rises from 8,500 to 8,900 bytes. design.md D3
  argues the increase, as the ceiling requirement demands.
- No skill, no configuration key, no command. The rules reach every store with the release that carries
  them, and come out with a release if the trial says so.

## Non-goals

- **Records and instructions.** Notes follow later with a subset of the rules; skills adopt the rules when
  each is next edited. Argued in design.md D6 and D7.
- **A mechanical check.** No `ctxr` command counts words or flags passive voice (D4).
- **A configuration key or a staged rollout** (D5).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `harness-portability`: one ADDED requirement for the "Explaining" section of the baseline conventions. The
  ceiling requirement is not modified: it names "a shipped ceiling", not a number, and allows an increase
  argued in a change, which design.md D3 is.

## Impact

- `templates/conventions/baseline-conventions.md`: the new section.
- `test/integration/entry-document-ceiling.test.ts`: `CONTEXTURE_OWNED_CEILING_BYTES` from 8,500 to 8,900.
  Measured on 2026-10-13: 7,978 bytes before this change, 8,523 after.
- The baseline tests. No CLI code, schema or migration. Stores receive the section on their next
  `ctxr update`.
