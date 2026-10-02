## ADDED Requirements

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
