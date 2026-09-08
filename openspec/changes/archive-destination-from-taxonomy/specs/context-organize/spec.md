## MODIFIED Requirements

### Requirement: Archive is a single tracked rename
Archiving a note SHALL relocate it via the single tracked rename defined in the context-store capability, SHALL preserve the note's resolved visibility unchanged, and SHALL report every other note in the store whose link would now point at the moved path. The destination SHALL be read from `organize.archive_destination`, a single configured path, and the archive operation SHALL NOT inspect the store's taxonomy to determine it.

#### Scenario: Visibility is unchanged by archiving
- **WHEN** a note with an explicit visibility field is archived
- **THEN** the archived note's visibility field is unchanged

#### Scenario: Inbound links are reported, not silently broken
- **WHEN** a note being archived has one or more other notes linking to it
- **THEN** `contexture archive` lists each linking note in its output, so the operator can update them if needed

#### Scenario: The destination is taxonomy-independent
- **WHEN** a store declares a taxonomy with no retirement layer of any kind
- **THEN** archiving still succeeds, relocating the note to `organize.archive_destination`
