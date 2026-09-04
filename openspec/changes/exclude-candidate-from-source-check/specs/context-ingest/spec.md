## MODIFIED Requirements

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
