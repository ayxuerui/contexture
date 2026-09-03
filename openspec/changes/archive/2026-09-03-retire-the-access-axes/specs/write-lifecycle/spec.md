## REMOVED Requirements

### Requirement: Capture applies an approved proposal item by item
**Reason**: The requirement obliged `session capture` to write the visibility field when a proposal item supplied one, and its "Visibility lands under the configured key" scenario asserted `note resolve` would then report the source as explicit. Both the field and that command are removed with the `context-visibility` capability. The item-by-item application discipline is unchanged and is restated below.
**Migration**: A proposal item supplying a visibility value has that value ignored rather than refused — it is ordinary frontmatter the capture path does not stamp. Everything else about capture is unchanged.

## ADDED Requirements

### Requirement: Capture writes only what an approved proposal names
`ctxr session capture --proposal <file>` SHALL read a proposal of store notes, validate each item independently (path gate, frontmatter shape), write every valid item — creating a note, or appending to an existing note without altering its prior content — and report per item what was written, appended, refused with a reason, or skipped, computed from the writes performed. It SHALL exit non-zero when any item was refused and SHALL never scan or infer content beyond the proposal.

#### Scenario: One bad item does not block the rest
- **WHEN** a proposal has three notes and one path fails the gate
- **THEN** two notes are written, the third is reported refused with its reason, and the exit code is non-zero

#### Scenario: Append preserves prior content
- **WHEN** an item appends to an existing note
- **THEN** the note's prior bytes are unchanged and the new content follows them

## MODIFIED Requirements

### Requirement: Commits are validated before they are accepted
The store SHALL install a version-controlled pre-commit hook that runs a staged-changes validation (schema conformance, fence integrity, a secret-pattern scan, a path allowlist, and a diff-size ceiling) and refuses the commit if any check fails, naming the specific violation.

#### Scenario: A schema violation blocks the commit
- **WHEN** a staged note violates the store's frontmatter schema
- **THEN** the pre-commit hook refuses the commit and names the violation

#### Scenario: A clean commit proceeds
- **WHEN** all staged changes pass every pre-commit check
- **THEN** the commit proceeds normally
