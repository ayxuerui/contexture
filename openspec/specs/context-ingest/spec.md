# context-ingest Specification

## Purpose

Governs how new material enters the store without becoming a duplicate: capture stages raw material with no identity commitments, and ingest is the point where source identity and content-addressed deduplication apply.

## Requirements

### Requirement: Two-stage content-addressed dedupe
`contexture source check` SHALL evaluate, in order: (1) whether an identity record already exists with the same source-id; (2) if not, whether an identity record already exists with the same canonicalized-content hash under a different source-id. The set of identity records SHALL be every capture in the capture tier plus every note carrying source-identity fields assigned before identity moved to the capture, so that excluding the capture tier from retrieval does not narrow dedupe. If the candidate being checked has not yet been assigned identity by ingest (carries neither a source-hash nor an ingested date), it SHALL be excluded from that set: a record that has not been ingested is never a match for itself, at either stage. A candidate that has already been assigned identity SHALL remain in the set, so that checking an already-ingested record against its own identity correctly reports it as already ingested. It SHALL report one of a documented set of verdicts, and SHALL NOT proceed automatically past a stage where more than one record matches.

#### Scenario: Same source, already ingested
- **WHEN** `source check` is run against material whose source-id already exists on an identity record in the store
- **THEN** it reports the already-ingested verdict and performs no write

#### Scenario: Same content, different source
- **WHEN** `source check` finds no source-id match but finds exactly one identity record with a matching content hash under a different source-id
- **THEN** it reports a verdict indicating an alternate-source match, for the caller to decide whether to merge

#### Scenario: Multiple matches stop, they do not guess
- **WHEN** `source check` finds more than one existing identity record matching at either stage
- **THEN** it reports a verdict indicating multiple matches and exits non-zero, taking no write action and applying no heuristic to pick among them

#### Scenario: A note ingested before the capture tier still dedupes
- **WHEN** `source check` is run against material whose source-id was recorded on a note by an ingest that predates the capture tier
- **THEN** that note is found as an identity record and the verdict names it, exactly as a retained capture would be

#### Scenario: A not-yet-ingested capture carrying its own identity is not a match for itself
- **WHEN** `source check` is run against a capture that already carries the source-id it is being checked against, carries neither a source-hash nor an ingested date, and no other identity record carries that source-id or the candidate's content hash
- **THEN** the verdict is `new` — the candidate is excluded from its own comparison set because it has not been assigned identity by ingest, so it matches nothing

#### Scenario: An already-ingested capture still matches itself
- **WHEN** `source check` is run against a capture that carries a source-hash or an ingested date, checked against its own source-id, and no other identity record carries that source-id
- **THEN** the verdict is `already_ingested`, naming the candidate itself — a record that has been assigned identity is not excluded from its own comparison set

#### Scenario: Self-exclusion does not hide a real prior record
- **WHEN** `source check` is run against a not-yet-ingested capture carrying its own source-id while a *different* identity record also carries that source-id
- **THEN** the verdict names that other record, not the candidate, and reports already-ingested or drift on that record's hash — excluding the candidate never suppresses a genuine match

### Requirement: Canonicalization is a single shared primitive
The transformation from a capture's raw body to its canonicalized form (used to compute the content hash) SHALL exist in exactly one place in the codebase and SHALL be invoked, not reimplemented, by every component that needs a content hash (dedupe, catalog gloss-rot detection). Hashing a capture that is not markdown SHALL be a documented variant of that same primitive, over the file's bytes, and SHALL NOT be a second implementation.

#### Scenario: Two components produce the same hash for the same content
- **WHEN** `source check` and `catalog check --stale` each compute a content hash for the same note body
- **THEN** the two hashes are identical, because both call the same canonicalization implementation

#### Scenario: A binary capture is hashed over its bytes
- **WHEN** a content hash is computed for a capture that is not markdown
- **THEN** it is computed over the file's bytes by the shared primitive's binary variant, with no frontmatter stripping and no text canonicalization applied

### Requirement: A source-hash is frozen at ingest time
A capture's source-hash SHALL be computed once, at ingest, and SHALL NOT be recomputed from the capture's current bytes on subsequent operations. Edits to any note citing that capture SHALL NOT affect the frozen hash, and SHALL NOT cause a re-check of the same source material to be reported as content drift.

#### Scenario: Post-ingest edits do not trigger false drift
- **WHEN** a note citing a capture is rewritten after ingest and the same original source material is checked again
- **THEN** `source check` compares the material's hash against the hash frozen on the capture at ingest, and reports it already ingested rather than drifted

### Requirement: Successful ingest leaves the catalog complete
After `contexture ingest` completes successfully, `contexture catalog check` SHALL pass: the destination note SHALL have a catalog entry, and the retained capture SHALL have none, since it is not a note.

#### Scenario: Catalog check is green after ingest
- **WHEN** `ingest` successfully records a capture against a destination note
- **THEN** running `catalog check` immediately afterward reports neither the destination note as missing an entry nor the retained capture as one

### Requirement: Source check distinguishes drift from duplication
`ctxr source check` SHALL report `drift` when an identity record with the same source identity exists but its recorded hash differs from the candidate's, in addition to the existing `new` and `duplicate` verdicts.

#### Scenario: Same identity, changed content
- **WHEN** a capture records identity `src-1` with hash `h1` and the candidate has identity `src-1` with hash `h2`
- **THEN** the verdict is `drift` and the existing capture's path is reported

### Requirement: Source identity can be recorded and extended
`ctxr source stamp <capture>` SHALL write the source identity and hash onto a capture that lacks them; `ctxr source add-alt <capture>` SHALL append an alternative source identity to a capture so a later check against that identity reports `duplicate`. Both SHALL accept a note carrying identity fields assigned before identity moved to the capture, so a legacy record stays maintainable in place.

#### Scenario: An alternative source is recognized
- **WHEN** `source add-alt` records `src-2` on a capture ingested as `src-1`, and a candidate arrives with identity `src-2`
- **THEN** `source check` reports `duplicate` naming that capture

### Requirement: URL identities are canonicalized before comparison
When a source identity is a URL, `source check` SHALL compare canonical forms: lowercased scheme and host, fragment removed, configured tracking parameters removed, trailing slash collapsed.

#### Scenario: Tracking parameters do not defeat dedupe
- **WHEN** a capture was ingested from `https://Example.com/a/` and a candidate's identity is `https://example.com/a?utm_source=x#top`
- **THEN** the verdict is `duplicate`

### Requirement: The capture tier is retained and excluded from retrieval
Captures SHALL live under a configured capture root, within which a configured inbox path holds material that has not yet been ingested. The capture root SHALL be seeded into the store's retrieval exclusions, so no file beneath it is a note: it is returned by no retrieval leg, takes no catalog entry, and contributes no graph node. The capture root SHALL be tracked in version control and SHALL NOT be declared a derived path — a retained capture is provenance, not regenerable output.

#### Scenario: A capture is not a note
- **WHEN** a markdown file sits under the configured capture root
- **THEN** listing the store's notes does not return it, `catalog check` does not report it as missing an entry, and the graph contains no node for it

#### Scenario: The capture tier is tracked, not ignored
- **WHEN** a store is initialized
- **THEN** the configured capture root appears in neither the store's derived-path declaration nor any generated ignore region, so captures are committed with the notes that cite them

### Requirement: Ingest assigns the content hash and the ingested date
A capture MAY arrive already carrying its source type and source id — a capture pipeline commonly knows both at the moment it writes the file. A capture SHALL NOT carry a source hash or an ingested date before ingest; those two fields SHALL be assigned only at ingest, onto the capture itself. `ctxr ingest` SHALL refuse a capture that already carries either, writing nothing.

#### Scenario: A capture may arrive knowing its source
- **WHEN** a capture pipeline writes a file carrying a source type and a source id, and neither a source hash nor an ingested date
- **THEN** `ctxr ingest` accepts it and assigns the two missing fields

#### Scenario: An already-ingested capture is refused
- **WHEN** `ctxr ingest` is run against a capture that already carries a source hash
- **THEN** it exits non-zero naming the capture, and no file is moved or rewritten

### Requirement: Ingest retains the capture and cites it from a note
`ctxr ingest <capture> --into <note>` SHALL stamp the four identity fields onto the capture, move the capture out of the configured inbox path into the capture tier's directory for the month of ingest, and record the capture's resulting path in the destination note's source list. The destination note MAY already exist; ingest SHALL NOT require that the material become a new note. The capture SHALL survive ingest as a retained file.

#### Scenario: Expanding an existing note records provenance
- **WHEN** material is folded into a note that already exists and `ingest` names that note as the destination
- **THEN** the capture is retained under the dated directory with its identity stamped, and the existing note's source list gains the capture's path

#### Scenario: The capture leaves the inbox
- **WHEN** `ingest` completes successfully
- **THEN** the capture no longer sits under the configured inbox path, and the uningested-material observation defined by context-organize no longer reports it

### Requirement: A note may cite many captures
A note's source list SHALL hold more than one capture path. Recording a further capture against a note SHALL NOT overwrite, reorder, or invalidate a capture the note already cites.

#### Scenario: Three sources, one note
- **WHEN** three captures are ingested naming the same destination note
- **THEN** the note cites all three capture paths, and a source check against any one of the three reports it already ingested

### Requirement: A binary capture records its identity in a sidecar
A capture that is not markdown cannot carry frontmatter, and SHALL therefore record its identity in a markdown sidecar retained beside it in the same directory, naming the file it describes. The sidecar's source hash SHALL be computed over that file's bytes.

#### Scenario: A binary capture is dedupable
- **WHEN** a PDF is captured, ingested with a sidecar, and the same PDF is later offered again
- **THEN** `source check` reports it already ingested, naming the sidecar

### Requirement: A store may require a capture to carry the record it rests on
A store SHALL be able to declare, in its configuration, which section a capture of a given source type must contain for that capture to stand as provenance — a mapping from source type to section name. `ctxr ingest` SHALL refuse a capture whose source type carries a declaration when the named section is absent, exiting with the check exit code and performing no write: no identity stamped, no move out of the inbox, no note updated, no derived artifact rebuilt. `ctxr lint` SHALL report the same condition over material still in the inbox as an observation, without changing its own exit code.

The mapping SHALL be undeclared by default, and a source type with no entry SHALL be unconstrained — a store that declares nothing ingests exactly as it does today. The section SHALL be matched against the markdown the capture presents: the capture file itself, or for material that is not markdown, the sidecar that names it.

This is a precondition on ingest, not a judgement about content. Whether the named section is complete, accurate, or faithful to the source is outside what any check can decide; only its presence is.

#### Scenario: A capture missing its declared section is refused, and nothing is written
- **WHEN** a store declares a required section for a source type and `ctxr ingest` is run against a capture of that type that does not contain it
- **THEN** the command exits with the check exit code, the capture remains in the inbox with no identity stamped, and the destination note and derived artifacts are unchanged

#### Scenario: A capture carrying its declared section ingests normally
- **WHEN** a store declares a required section for a source type and `ctxr ingest` is run against a capture of that type that contains it
- **THEN** ingest proceeds exactly as it would with no declaration in force

#### Scenario: An undeclared source type is unconstrained
- **WHEN** `ctxr ingest` is run against a capture whose source type the store has not declared a required section for
- **THEN** no section requirement applies, whether or not other source types carry declarations

#### Scenario: Lint reports the condition without blocking
- **WHEN** material in the inbox is of a source type with a declared section and does not contain it, and `ctxr lint` runs
- **THEN** lint reports it as an observation naming the capture and the missing section, and still exits zero

#### Scenario: Material that is not markdown is checked against its sidecar
- **WHEN** a capture that is not markdown travels with a sidecar naming it, its source type carries a declaration, and `ctxr ingest` is run against it
- **THEN** the required section is looked for in the sidecar, and the binary capture's own bytes are not searched
