# context-catalog Specification

## Purpose

Provides the store's primary conceptual-search mechanism in a retrieval design that ships no ranker: a sectioned catalog whose structure is generated and guaranteed complete, and whose one-line descriptions are authored and preserved across regeneration.

## Requirements

### Requirement: Catalog structure is derived; glosses are authored and preserved
`contexture catalog build` SHALL generate each retrievable note's catalog entry (its identity line and path) inside a marker-fenced region per the context-store generated-region mechanism, while preserving any human-authored one-line gloss already attached to that entry across rebuilds.

#### Scenario: A note gains an entry on next build with no gloss yet
- **WHEN** a new retrievable note exists that has never appeared in the catalog
- **THEN** `catalog build` adds an entry for it with an empty or placeholder gloss, never fabricating descriptive text

#### Scenario: An existing gloss survives a rebuild
- **WHEN** `catalog build` runs a second time against a note whose catalog entry already carries an authored gloss
- **THEN** the gloss text is unchanged after the rebuild

### Requirement: Coverage is a hard invariant
`contexture catalog check` SHALL exit non-zero, naming every retrievable note absent from the catalog, whenever any retrievable note (per the store's exclusion configuration) has no catalog entry. `contexture doctor` SHALL treat a non-zero `catalog check` as a failing check, not a warning.

#### Scenario: A missing note fails the check
- **WHEN** a retrievable note exists with no corresponding catalog entry
- **THEN** `catalog check` exits non-zero and names that note's path

#### Scenario: Full coverage passes
- **WHEN** every retrievable note has a catalog entry
- **THEN** `catalog check` exits 0

### Requirement: Catalog is sectioned and independently readable
The catalog SHALL be organized into sections corresponding to the store's configured taxonomy, such that a single section can be read or requested without loading the entire catalog.

#### Scenario: Reading one section
- **WHEN** `contexture catalog show --section <path-prefix>` is invoked
- **THEN** the output contains only entries whose note falls under that path prefix, not the full catalog

### Requirement: Entries carry gloss and resolved visibility
Each catalog entry SHALL record the note's resolved visibility alongside its identity and gloss, and `contexture catalog show --as <context>` SHALL omit entries whose resolved visibility the requesting context cannot see.

#### Scenario: An unfiltered catalog read is not the default
- **WHEN** `contexture catalog show --as ctx-a` is invoked
- **THEN** entries for notes whose resolved visibility `ctx-a` cannot see — including their gloss text — do not appear in the output

### Requirement: A size budget with defined behavior at the limit
Each catalog section SHALL have a configured maximum size in `contexture.yaml`. `contexture doctor` SHALL fail when a section exceeds its configured maximum, naming the section and instructing that it be split.

#### Scenario: An oversized section fails doctor
- **WHEN** a catalog section's rendered size exceeds its configured maximum
- **THEN** `contexture doctor` reports a failing check naming the section and its current size

### Requirement: Gloss-rot detection
`contexture catalog check --stale` SHALL report any catalog entry whose note's canonicalized content hash has changed since the entry's gloss was last confirmed, using the same content-hashing primitive defined in the context-ingest capability.

#### Scenario: A changed note is flagged for gloss review
- **WHEN** a note's content changes materially after its catalog gloss was last confirmed
- **THEN** `catalog check --stale` lists that note's entry as needing gloss review
