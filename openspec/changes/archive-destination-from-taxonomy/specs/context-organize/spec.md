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

## ADDED Requirements

### Requirement: An operator-set archive destination survives migration unchanged
A migration that changes the shipped default archive destination SHALL rename the configuration key for every store, and SHALL change the key's value only for a store whose value still matches the previous shipped default. A store whose destination was set to any other value SHALL retain that value verbatim.

#### Scenario: A default-valued destination adopts the taxonomy's own
- **WHEN** a store still declares the previous shipped default and its taxonomy profile declares an archive destination
- **THEN** migration adopts the profile's destination, and relocates the existing archive directory when one exists and the destination directory does not

#### Scenario: A customized destination is only renamed, never revalued
- **WHEN** a store declares an archive destination other than the previous shipped default
- **THEN** migration renames the key and leaves the value unchanged

#### Scenario: A profile declaring no destination keeps the fallback
- **WHEN** a store's taxonomy profile declares no archive destination, or its taxonomy is custom
- **THEN** migration renames the key and the value stays at the shipped fallback
