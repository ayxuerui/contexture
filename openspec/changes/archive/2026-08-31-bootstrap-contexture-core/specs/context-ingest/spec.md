## Purpose

Governs how new material enters the store without becoming a duplicate: capture stages raw material with no identity commitments, and ingest is the point where source identity and content-addressed deduplication apply.

## ADDED Requirements

### Requirement: Captured material carries no source identity until ingested
A file placed in the store's inbox by a capture operation SHALL NOT carry source-identity fields (source type, source id, source hash, ingested date). Source-identity fields SHALL be assigned only at ingest time, on the resulting note.

#### Scenario: An inbox file has no source identity
- **WHEN** a capture operation writes a file into the inbox
- **THEN** that file's frontmatter contains no source-identity fields

#### Scenario: Ingest assigns identity once
- **WHEN** `contexture ingest` processes an inbox file into a note
- **THEN** the resulting note's frontmatter carries source-type, source-id, source-hash, and an ingested date, and the original inbox file (which had none) is not itself mistaken for a duplicate of the note it produced

### Requirement: Two-stage content-addressed dedupe
`contexture source check` SHALL evaluate, in order: (1) whether a note already exists with the same source-id; (2) if not, whether a note already exists with the same canonicalized-content hash under a different source-id. It SHALL report one of a documented set of verdicts, and SHALL NOT proceed automatically past a stage where more than one existing note matches.

#### Scenario: Same source, already ingested
- **WHEN** `source check` is run against material whose source-id already exists on a note in the store
- **THEN** it reports the already-ingested verdict and performs no write

#### Scenario: Same content, different source
- **WHEN** `source check` finds no source-id match but finds exactly one note with a matching content hash under a different source-id
- **THEN** it reports a verdict indicating an alternate-source match, for the caller to decide whether to merge

#### Scenario: Multiple matches stop, they do not guess
- **WHEN** `source check` finds more than one existing note matching at either stage
- **THEN** it reports a verdict indicating multiple matches and exits non-zero, taking no write action and applying no heuristic to pick among them

### Requirement: Canonicalization is a single shared primitive
The transformation from a note's raw body to its canonicalized form (used to compute the content hash) SHALL exist in exactly one place in the codebase and SHALL be invoked, not reimplemented, by every component that needs a content hash (dedupe, catalog gloss-rot detection).

#### Scenario: Two components produce the same hash for the same content
- **WHEN** `source check` and `catalog check --stale` each compute a content hash for the same note body
- **THEN** the two hashes are identical, because both call the same canonicalization implementation

### Requirement: A source-hash is frozen at ingest time
A note's source-hash SHALL be computed once, at ingest, and SHALL NOT be recomputed from the note's current body on subsequent operations. Edits to the note after ingest SHALL NOT cause a re-ingest of the same source to be flagged as content drift against the frozen hash.

#### Scenario: Post-ingest edits do not trigger false drift
- **WHEN** a note is edited after ingest and the same original source material is ingested again
- **THEN** `source check` compares the new material's hash against the frozen source-hash recorded at the original ingest, not against the note's current, edited body

### Requirement: Successful ingest leaves the catalog complete
After `contexture ingest` completes successfully, `contexture catalog check` SHALL pass for the resulting note (it SHALL have a catalog entry).

#### Scenario: Catalog check is green after ingest
- **WHEN** `ingest` successfully produces a new note
- **THEN** running `catalog check` immediately afterward does not report that note as missing
