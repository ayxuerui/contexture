## MODIFIED Requirements

### Requirement: Entries carry gloss and resolved visibility
Each catalog entry SHALL record the note's resolved visibility and its resolved scope alongside its identity and gloss. `contexture catalog show --as <context>` SHALL omit entries whose resolved visibility the requesting context cannot see, and when a scope selector is also supplied SHALL additionally omit entries the selector does not admit. Both omissions SHALL remove the entry's gloss text along with the entry.

#### Scenario: An unfiltered catalog read is not the default
- **WHEN** `contexture catalog show --as ctx-a` is invoked
- **THEN** entries for notes whose resolved visibility `ctx-a` cannot see — including their gloss text — do not appear in the output

#### Scenario: A scope selector narrows the same read
- **WHEN** `contexture catalog show --as ctx-a` is invoked with a scope selector naming `scope-a`
- **THEN** the output contains only entries for notes `ctx-a` can see whose resolved scope the selector admits

#### Scenario: Entries record both axes
- **WHEN** `catalog build` writes an entry for a note whose scope resolved from a directory default
- **THEN** the entry records that resolved scope alongside the note's resolved visibility
