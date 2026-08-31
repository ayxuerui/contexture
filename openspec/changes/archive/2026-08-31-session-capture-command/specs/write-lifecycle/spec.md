## Purpose

Extends the write-lifecycle capability (see `bootstrap-contexture-core`): one path gate enforced at commit time and at capture time, and a capture command that applies an approved proposal item by item.

## ADDED Requirements

### Requirement: The path gate
A markdown path being staged or captured SHALL be refused when its canonical location is outside the store or when reaching it traverses a symbolic link whose target is outside the store. When configuration declares writable paths, such a path SHALL additionally be refused unless it falls under a configured taxonomy layer, the inbox, a declared writable path, or a contexture-owned location; with no declaration every in-store path is accepted. The staged path check (run by `doctor --staged` from the pre-commit hook) and the capture command SHALL apply the same rule.

#### Scenario: A symlink escape is refused at commit time
- **WHEN** a staged markdown file's path resolves through a link to a directory outside the store
- **THEN** `doctor --staged` fails with a finding naming the path

#### Scenario: Undeclared writable paths accept any in-store note
- **WHEN** configuration declares no writable paths and a note is staged outside every layer
- **THEN** the path check passes

#### Scenario: Declared writable paths gate capture
- **WHEN** configuration declares writable paths and a proposal item targets a path under none of the sanctioned locations
- **THEN** `session capture` refuses that item, writes nothing for it, and still applies the other items

### Requirement: Capture applies an approved proposal item by item
`ctxr session capture --proposal <file>` SHALL read a proposal of store notes and identity deltas, validate each item independently (path gate, frontmatter shape, unique identity match), write every valid item — creating a note, appending to an existing note without altering its prior content, writing the visibility field when a value is given, applying identity deltas through the entry primitive — and report per item what was written, appended, refused with a reason, or skipped, computed from the writes performed. It SHALL exit non-zero when any item was refused and SHALL never scan or infer content beyond the proposal.

#### Scenario: One bad item does not block the rest
- **WHEN** a proposal has three notes and one path fails the gate
- **THEN** two notes are written, the third is reported refused with its reason, and the exit code is non-zero

#### Scenario: Append preserves prior content
- **WHEN** an item appends to an existing note
- **THEN** the note's prior bytes are unchanged and the new content follows them

#### Scenario: Visibility lands under the configured key
- **WHEN** an item supplies a visibility value
- **THEN** the created note carries it under the configured visibility field and `note resolve` reports the source as explicit
