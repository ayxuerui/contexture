## MODIFIED Requirements

### Requirement: Stable per-note retrieval record
The graph build and catalog build processes SHALL each be capable of emitting a per-note record containing at minimum the note's path-derived identity, its path, its resolved visibility, its resolved scope, its catalog gloss (if any), and its canonicalized content hash, in a documented stable shape that a future search capability (deferred to v2, see design.md) could consume without re-deriving note identity or re-resolving either axis.

#### Scenario: The per-note record is emitted
- **WHEN** `contexture graph build --emit-records` runs
- **THEN** it produces one record per retrievable note containing identity, path, resolved visibility, resolved scope, gloss, and content hash

#### Scenario: Resolved scope is carried, not re-derived
- **WHEN** a note's resolved scope comes from a directory default rather than an explicit field value
- **THEN** the emitted record carries the resolved list, so a consumer needs neither the note's frontmatter nor the store's configuration to know its scope

## ADDED Requirements

### Requirement: Filtered retrieval accepts a scope selector alongside the requesting context
Every retrieval operation that accepts a requesting context SHALL also accept an optional scope selector, and SHALL apply both as pre-filters per the context-visibility capability. An operation invoked with a scope selector naming a scope the store does not declare SHALL exit non-zero naming the unknown scope, rather than silently returning nothing or silently returning everything.

#### Scenario: Both selectors are accepted together
- **WHEN** a graph query is invoked with both a requesting context and a scope selector
- **THEN** the result contains only notes that context can see which are also in the named scope

#### Scenario: An unknown scope is named, not guessed
- **WHEN** a retrieval operation names a scope that appears in no note's resolved scope and in no configured scope declaration
- **THEN** the command exits non-zero naming that scope, and does not return an empty result as though the scope were valid
