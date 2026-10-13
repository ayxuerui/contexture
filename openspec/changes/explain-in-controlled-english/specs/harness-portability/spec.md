## ADDED Requirements

### Requirement: The explanation skill carries the controlled-English rules
contexture SHALL ship `ctxr-explanation` as a contexture-owned skill delivered by init and update. The
rendered skill SHALL state that it applies whenever an agent explains something to the operator — an answer
in conversation, a pull request's title, body and commit message, a published page's prose, and research
findings reported to the operator — and that notes, skills and the entry document are outside it. It SHALL
state these rules, adopted from ASD-STE100 Simplified Technical English applied partially: one instruction or
one fact per sentence; at most 20 words in a sentence that instructs and at most 25 in a sentence that
describes; active voice naming the actor; one word for one thing; the store's own names kept exactly as
written; three or more items or any sequence as a list; numbers in place of vague quantities; articles
kept; at most six sentences in a paragraph. It SHALL instruct putting a reason in its own sentence labelled
`Why:`, exempt from the length limit. It SHALL instruct copying quoted text, command output, code, and
report-derived tables and blocks unchanged. It SHALL state that the STE approved-word dictionary and its
verb-tense limits are not adopted. The enforcing mechanism is the test over the rendered skill set.

#### Scenario: The skill states where it applies
- **WHEN** the explanation skill is rendered for a store
- **THEN** it names conversation answers, pull requests, published pages and research findings as in
  scope, and notes, skills and the entry document as out of scope

#### Scenario: The adopted rules are stated with their limits
- **WHEN** the explanation skill is rendered for a store
- **THEN** it names ASD-STE100 and states the 20-word and 25-word sentence limits, the six-sentence
  paragraph limit, active voice, one word for one thing, and lists for three or more items

#### Scenario: The reason is labelled and survives
- **WHEN** an agent follows the skill to explain a decision
- **THEN** it is instructed to put each reason in its own sentence starting with `Why:`, which may exceed
  the length limit, rather than removing it

#### Scenario: Copied content is left unchanged
- **WHEN** an agent follows the skill and its text includes a table or block taken from a `ctxr` report
- **THEN** it is instructed to copy that content unchanged rather than rewrite it under the rules

#### Scenario: What is not adopted is stated
- **WHEN** the explanation skill is rendered for a store
- **THEN** it states that the STE approved-word dictionary and its verb-tense limits are not adopted, and
  that the store's own names count as technical names

#### Scenario: Update delivers the skill to an existing store
- **WHEN** a store initialized before this change runs `ctxr update`
- **THEN** the explanation skill is present at the configured skills path with the managed header

### Requirement: The baseline conventions route explanations to the explanation skill
The shipped baseline conventions, inlined into every store's entry document, SHALL state that when an agent
explains something to the operator — in conversation, a pull request or a page — or draws a diagram
anywhere, including in a note, it follows `ctxr-explanation`. The line SHALL NOT restate the rules the skill carries. A store's house conventions MAY
state a different rule, and the more specific rule applies.

#### Scenario: The entry document routes explanations
- **WHEN** a store is freshly initialized
- **THEN** its entry document's conventions name `ctxr-explanation` for explaining something to the
  operator and for drawing a diagram anywhere, and do not list the skill's sentence limits

#### Scenario: The routing line stays under the ceiling
- **WHEN** the entry-document ceiling test runs against a freshly initialized store
- **THEN** contexture's share of the entry document, including the routing line, is at or under the shipped
  ceiling

### Requirement: Skills that write for the operator name the explanation skill
The rendered `ctxr-submit`, `ctxr-publish` and `ctxr-research` skills SHALL each name `ctxr-explanation` at
the step where they write prose for the operator: the pull request's title, body and commit message; the
page's prose; the findings reported to the operator. `ctxr-publish` SHALL state that the explanation skill
sets the sentence shape while the explanation-focused vendored skill sets the level the reader is
addressed at, and that both apply. The enforcing mechanism is the test over the rendered skill set.

#### Scenario: Submit names the skill before the pull request is written
- **WHEN** the submit skill is rendered for a store
- **THEN** it names `ctxr-explanation` before the first occurrence of `gh pr create`

#### Scenario: Publish combines the two explanation skills
- **WHEN** the publish skill is rendered for a store
- **THEN** it names `ctxr-explanation` for the page's sentence shape alongside the vendored explanation
  skill for the reader's level

#### Scenario: Research names the skill where findings are reported
- **WHEN** the research skill is rendered for a store
- **THEN** it names `ctxr-explanation` at the step that reports findings to the operator
