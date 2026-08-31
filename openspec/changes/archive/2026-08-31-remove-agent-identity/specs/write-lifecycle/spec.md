## MODIFIED Requirements

### Requirement: Capture applies an approved proposal item by item
`ctxr session capture --proposal <file>` SHALL read a proposal of store notes, validate each item independently (path gate, frontmatter shape), write every valid item — creating a note, appending to an existing note without altering its prior content, writing the visibility field when a value is given — and report per item what was written, appended, refused with a reason, or skipped, computed from the writes performed. It SHALL exit non-zero when any item was refused and SHALL never scan or infer content beyond the proposal.

#### Scenario: One bad item does not block the rest
- **WHEN** a proposal has three notes and one path fails the gate
- **THEN** two notes are written, the third is reported refused with its reason, and the exit code is non-zero

#### Scenario: Append preserves prior content
- **WHEN** an item appends to an existing note
- **THEN** the note's prior bytes are unchanged and the new content follows them

#### Scenario: Visibility lands under the configured key
- **WHEN** an item supplies a visibility value
- **THEN** the created note carries it under the configured visibility field and `note resolve` reports the source as explicit
