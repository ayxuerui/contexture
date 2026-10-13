## ADDED Requirements

### Requirement: The baseline conventions say how to explain something to the operator
The shipped baseline conventions, inlined into every store's entry document, SHALL carry an "Explaining"
section that applies whenever an agent explains something to the operator. The section SHALL name ASD-STE100
and state, as the adopted rules: one fact per sentence; at most 20 words in a sentence that instructs and at
most 25 in one that describes; active voice; one word for one thing; lists for three or more items; numbers
in place of vague words. It SHALL state the departures from the standard: the store's own names are kept as
written; each reason gets its own sentence starting `Why:`; quotes, command output and report tables are
copied unchanged. It SHALL state when to draw a diagram instead of prose, and its form: a fenced `mermaid`
block in notes, pull requests and answers, and inline SVG in published pages. A store's house conventions
MAY state a different rule, and the more specific rule applies.

#### Scenario: A fresh store's entry document carries the section
- **WHEN** a store is freshly initialized
- **THEN** its entry document's conventions carry the "Explaining" section, naming ASD-STE100, the 20-word
  and 25-word limits, active voice, one word for one thing, and lists for three or more items

#### Scenario: The departures are stated
- **WHEN** the rendered baseline conventions are read
- **THEN** the "Explaining" section states that the store's names are kept as written, that each reason gets
  a `Why:` sentence, and that quotes, command output and report tables are copied unchanged

#### Scenario: The section says when and how to draw a diagram
- **WHEN** the rendered baseline conventions are read
- **THEN** the "Explaining" section names structure, flow and sequence as reasons to draw a diagram, a
  fenced `mermaid` block for notes, pull requests and answers, and inline SVG for pages

#### Scenario: Update delivers the section to an existing store
- **WHEN** a store initialized before this change runs `ctxr update`
- **THEN** its entry document carries the "Explaining" section, with no configuration change required

#### Scenario: The section fits under the raised ceiling
- **WHEN** the entry-document ceiling test runs against a freshly initialized store
- **THEN** contexture's share of the entry document, including the section, is at or under 8,900 bytes
