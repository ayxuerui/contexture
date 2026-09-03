## REMOVED Requirements

### Requirement: Archive is a single tracked rename
**Reason**: The requirement asserted that archiving preserves the note's *resolved visibility*, a property that no longer exists once the `context-visibility` capability is retired. The underlying guarantee — archiving moves a note and changes nothing about its content — is broader and is restated below.
**Migration**: None for callers. `ctxr archive` behaves identically; only the property being asserted about it changes, from "visibility is preserved" to the stronger "frontmatter is preserved."

## ADDED Requirements

### Requirement: Archive is a single tracked rename that leaves the note untouched
Archiving a note SHALL relocate it via the single tracked rename defined in the context-store capability, SHALL leave the note's frontmatter and body byte-identical, and SHALL report every other note in the store whose link would now point at the moved path.

#### Scenario: The note's bytes are unchanged by archiving
- **WHEN** a note carrying frontmatter is archived
- **THEN** the archived note's frontmatter and body are byte-identical to what they were before the move

#### Scenario: Inbound links are reported, not silently broken
- **WHEN** a note being archived has one or more other notes linking to it
- **THEN** `contexture archive` lists each linking note in its output, so the operator can update them if needed
