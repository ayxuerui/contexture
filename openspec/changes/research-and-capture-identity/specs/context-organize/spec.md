## MODIFIED Requirements

### Requirement: Archive is a single tracked rename that leaves the note untouched
Archiving a note SHALL relocate it via the single tracked rename defined in the context-store capability, SHALL leave the note's frontmatter and body byte-identical, and SHALL report every other note in the store whose link would now point at the moved path. The destination SHALL be the note's store-relative path placed beneath `organize.archive_destination`, a single configured path, so an archived note still shows where it lived and is restored by the reverse rename. The archive operation SHALL NOT inspect the store's taxonomy to determine the destination: the source path is kept as it is, whatever its folders are named. It SHALL refuse, writing nothing, when the destination already exists or the note is already beneath the archive destination.

#### Scenario: The note's bytes are unchanged by archiving
- **WHEN** a note carrying frontmatter is archived
- **THEN** the archived note's frontmatter and body are byte-identical to what they were before the move

#### Scenario: Inbound links are reported, not silently broken
- **WHEN** a note being archived has one or more other notes linking to it
- **THEN** `contexture archive` lists each linking note in its output, so the operator can update them if needed

#### Scenario: The destination is taxonomy-independent
- **WHEN** a store declares a taxonomy with no retirement layer of any kind
- **THEN** archiving still succeeds, relocating the note beneath `organize.archive_destination`

#### Scenario: The source path is kept beneath the destination
- **WHEN** `ctxr archive projects/Bet/Plan.md` runs with the archive destination `archive/`
- **THEN** the note is at `archive/projects/Bet/Plan.md` after one tracked rename

#### Scenario: A note already archived is refused
- **WHEN** `ctxr archive archive/projects/Plan.md` runs with the archive destination `archive/`
- **THEN** it exits non-zero naming the archive destination, and nothing moves

## ADDED Requirements

### Requirement: A folder archives whole
`ctxr archive` SHALL accept a folder as well as a note. A folder SHALL move, with its store-relative path kept beneath the configured archive destination, as one tracked rename, preserving every note's bytes and the folder's internal structure. The command SHALL report every note outside the folder that links to a note inside it. It SHALL refuse a folder that is not tracked, one already beneath the archive destination, and one whose destination already exists, writing nothing.

#### Scenario: A project folder retires whole
- **WHEN** `ctxr archive projects/Bet` runs on a tracked folder holding two notes, one of which a note outside it links to, with the archive destination `archive/`
- **THEN** the folder is at `archive/projects/Bet` after one tracked rename, both notes unchanged, and the outside note is reported as linking into it

#### Scenario: An existing destination is refused
- **WHEN** `archive/projects/Bet` already exists and `ctxr archive projects/Bet` runs
- **THEN** it exits non-zero naming the destination, and nothing moves
