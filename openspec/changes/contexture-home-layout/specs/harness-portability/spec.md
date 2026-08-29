## Purpose

Extends the harness-portability and adapters capabilities (see `bootstrap-contexture-core`): procedures stay canonical portable markdown, and harnesses with native skill discovery get generated wrappers pointing at them.

## ADDED Requirements

### Requirement: Harness-generation adapters may generate skill wrappers for procedures
A harness-generation adapter MAY declare skill generation: for each canonical procedure, `contexture adapters generate` SHALL produce one harness-native skill file containing only that harness's discovery metadata and a pointer to the canonical procedure file — never a copy of the procedure's content. Generated skill files SHALL be byte-stable across repeated runs with unchanged inputs, and removing the adapter from the store's configuration SHALL stop their generation without touching the canonical procedure files.

#### Scenario: A skill-discovering harness surfaces every procedure
- **WHEN** `adapters generate` runs for a harness whose adapter declares skill generation
- **THEN** each canonical procedure has a corresponding generated skill file in that harness's discovery location, whose body directs the agent to read and follow the canonical procedure file by path

#### Scenario: Generation is idempotent
- **WHEN** `adapters generate` runs twice in a row with no configuration or procedure changes
- **THEN** the second run rewrites no skill file (byte-identical output)

#### Scenario: The canonical file remains the single source
- **WHEN** a canonical procedure file is edited
- **THEN** the generated skill wrapper requires no regeneration to stay correct, because it points at the file rather than copying its content
