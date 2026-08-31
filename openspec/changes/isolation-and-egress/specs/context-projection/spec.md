## Purpose

Defines a projection: a derived, filtered copy of the store materialized for one named requesting context, containing only the notes that context may see. Because an excluded note is never written, a consumer indexing a projection cannot surface it however it ranks, traverses, or synthesizes — which is what makes the projection, rather than a per-note label, the boundary an external tool can be trusted against.

## ADDED Requirements

### Requirement: A projection contains only notes both axes admit
A projection built for a requesting context, and optionally a scope selector, SHALL contain exactly the notes that the visibility pre-filter admits for that context and that the scope selector admits, per the context-visibility capability. Exclusion SHALL happen before any content is written: an excluded note's body, gloss, frontmatter, path, and identity SHALL be absent from every file the projection produces.

#### Scenario: An excluded note leaves no trace
- **WHEN** a projection is built for `ctx-a` from a store containing a note whose resolved visibility `ctx-a` cannot see
- **THEN** no file anywhere in the projection contains that note's content, path, or identity

#### Scenario: A scope selector narrows the projection further
- **WHEN** a projection is built for `ctx-a` naming scope `scope-a`
- **THEN** it contains only notes `ctx-a` can see whose resolved scope the selector admits

#### Scenario: An unresolvable note is omitted
- **WHEN** a projection is built and a note's visibility cannot be resolved
- **THEN** the note is omitted rather than included, failing closed to the same default the visibility pre-filter uses

### Requirement: A projection is keyed by its requesting context and scope selector
A projection's location SHALL be determined by both the requesting context and the scope selector it was built for, such that two builds differing in either are written to distinct locations. No operation SHALL read a projection built for one requesting context or scope selector while serving another.

#### Scenario: Two contexts do not share a location
- **WHEN** a projection is built for `ctx-a` and then for `ctx-b` from the same store
- **THEN** the two are written to distinct locations, and reading `ctx-b`'s location never returns content built for `ctx-a`

#### Scenario: Two scope selectors do not share a location
- **WHEN** a projection is built for `ctx-a` naming `scope-a`, and again for `ctx-a` naming `scope-b`
- **THEN** the two are written to distinct locations

#### Scenario: A narrower build does not overwrite a broader one
- **WHEN** a projection is built for `ctx-a` with no scope selector, and then for `ctx-a` naming `scope-a`
- **THEN** both remain readable at their own locations, and neither is served in response to a request for the other

### Requirement: Content is secret-scanned before a projection is written
A projection build SHALL run the store's secret-pattern check over the content it is about to materialize, and SHALL exit non-zero naming the note and the matched pattern class without writing the projection if any note matches. The check SHALL be the same one the commit path runs, so a pattern added for one path is enforced on both.

#### Scenario: A match blocks the whole projection
- **WHEN** a note admitted into a projection matches the store's secret-pattern check
- **THEN** the command exits non-zero naming that note, and no projection files are written

#### Scenario: One check, two call sites
- **WHEN** a pattern is added to the store's secret-pattern configuration
- **THEN** both the commit path and the projection build refuse content matching it, with no second pattern list maintained anywhere

### Requirement: A projection is derived, and byte-stable across unchanged builds
A projection SHALL be written under a path declared derived in `contexture.yaml`, inheriting the write-lifecycle capability's guarantees for declared derived paths. Two builds of an unchanged store for the same requesting context and scope selector SHALL produce byte-identical output, and the projection SHALL carry no timestamp.

#### Scenario: Two builds, identical bytes
- **WHEN** a projection is built twice with no note changed in between
- **THEN** the output is byte-identical after both runs

#### Scenario: A projection never rides a review
- **WHEN** a session runs a projection build during its work and then submits
- **THEN** the resulting pull request contains no projection files
