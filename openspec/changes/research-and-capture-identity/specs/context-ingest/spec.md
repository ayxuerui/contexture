## ADDED Requirements

### Requirement: Ingest refuses a source id that does not name its source type
`ctxr ingest` SHALL refuse, before reading or writing anything, a `--source-id` that does not begin with the invocation's `--source-type` followed by a slash. The refusal SHALL name the id given and the prefixed form expected, so a bare identifier never lands on a capture in a form that defeats deduplication against correctly prefixed records.

#### Scenario: A bare id is refused
- **WHEN** `ctxr ingest` runs with `--source-type circleback --source-id KAjUF`
- **THEN** it exits non-zero naming `KAjUF` and the expected `circleback/` prefix, and the capture is unchanged

#### Scenario: An id under another type is refused
- **WHEN** `ctxr ingest` runs with `--source-type circleback --source-id web/KAjUF`
- **THEN** it is refused the same way

#### Scenario: A prefixed id is accepted
- **WHEN** `ctxr ingest` runs with `--source-type circleback --source-id circleback/KAjUF`
- **THEN** the capture is ingested with that id
