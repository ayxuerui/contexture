## ADDED Requirements

### Requirement: A folder archives whole
`ctxr archive` SHALL accept a folder as well as a note. A folder SHALL move, under its own name, into the configured archive destination as one tracked rename, preserving every note's bytes and the folder's internal structure. The command SHALL report every note outside the folder that links to a note inside it. It SHALL refuse a folder that is not tracked, and one whose destination already exists, writing nothing.

#### Scenario: A project folder retires whole
- **WHEN** `ctxr archive projects/Bet` runs on a tracked folder holding two notes, one of which a note outside it links to, with the archive destination `archive/`
- **THEN** the folder is at `archive/Bet` after one tracked rename, both notes unchanged, and the outside note is reported as linking into it

#### Scenario: An existing destination is refused
- **WHEN** `archive/Bet` already exists and `ctxr archive projects/Bet` runs
- **THEN** it exits non-zero naming the destination, and nothing moves
