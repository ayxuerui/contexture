## Purpose

Provides structural enumeration (a deterministic link graph) and literal content matching as the store's other two retrieval legs, alongside the catalog, with node identity and failure reporting designed to hold at scale.

## ADDED Requirements

### Requirement: Graph node identity is path-derived
Each node in the built graph SHALL be identified by the note's path relative to the store root, not by its filename stem alone. Two notes with the same filename in different directories SHALL produce two distinct nodes.

#### Scenario: Same filename in two directories does not collide
- **WHEN** two notes with identical filenames exist under different directories
- **THEN** `contexture graph build` produces two distinct nodes, each identified by its full relative path

### Requirement: Dangling links are reported; identity collisions are fatal
`contexture graph build` SHALL report every link target that resolves to no known node, without failing the build. It SHALL exit non-zero and refuse to write the graph artifact if two notes would otherwise resolve to the same node identity.

#### Scenario: A dangling link is reported but does not block the build
- **WHEN** a note contains a link to a target that matches no note in the store
- **THEN** `graph build` completes, writes the graph artifact, and lists the dangling link in its output

#### Scenario: An identity collision blocks the build
- **WHEN** the resolved node identity for two different notes would be identical
- **THEN** `graph build` exits non-zero, names both conflicting paths, and does not write the graph artifact

### Requirement: Content matching applies exclusions and a triage limit
`contexture search <term>` SHALL apply the store's retrieval exclusion configuration before matching, and SHALL refuse (exiting non-zero with a documented message) rather than return results when the number of matching files exceeds a configured triage limit.

#### Scenario: Excluded paths never appear in search results
- **WHEN** a term also appears in a file under a configured exclusion path
- **THEN** that file does not appear in `search`'s results

#### Scenario: Over-broad search is refused, not silently truncated
- **WHEN** a search term matches more files than the configured triage limit
- **THEN** `search` exits non-zero, reports the match count and the limit, and instructs narrowing the query, rather than returning a truncated result set

### Requirement: Leg-routing guidance is documented
The store's procedure documentation SHALL state which retrieval leg to use for which kind of question: structural questions (what connects to what) route to the graph; known-literal or entity questions route to content matching; open conceptual questions route to the catalog first, then content matching scoped to the relevant catalog section.

#### Scenario: Routing guidance is discoverable
- **WHEN** an agent reads the store's retrieval procedure documentation
- **THEN** it finds an explicit statement of which leg to use for a structural question, a literal question, and a conceptual question

### Requirement: Stable per-note retrieval record
The graph build and catalog build processes SHALL each be capable of emitting a per-note record containing at minimum the note's path-derived identity, its path, its resolved visibility, its catalog gloss (if any), and its canonicalized content hash, in a documented stable shape usable as input to a future search adapter without re-deriving note identity.

#### Scenario: The per-note record is emitted
- **WHEN** `contexture graph build --emit-records` runs
- **THEN** it produces one record per retrievable note containing identity, path, resolved visibility, gloss, and content hash
