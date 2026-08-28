## Purpose

Provides structural enumeration (a deterministic link graph), CLI-computed and CLI-queried, as the store's second retrieval leg alongside the catalog. Literal content matching is the store's third leg, but it is the agent's own tool applied directly to the store's files — this capability's job for that leg is to make the exclusion configuration and the existence of the catalog and graph discoverable, not to wrap or duplicate a tool agents already have.

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

### Requirement: Content matching is a direct agent leg, not a CLI command
Literal or entity-level content matching SHALL be performed by the agent directly against the store's files, using its own tooling. contexture SHALL NOT provide a CLI command that wraps or duplicates direct content matching. The store's exclusion configuration SHALL be declared once, in `contexture.yaml` (per the context-store capability), in a form an agent can read and apply to its own search without invoking contexture.

#### Scenario: No content-matching command exists
- **WHEN** the CLI's command surface is enumerated
- **THEN** no command performs content matching on the agent's behalf

#### Scenario: Exclusions are usable without invoking contexture
- **WHEN** an agent reads `contexture.yaml` before running its own content-matching search
- **THEN** the declared exclusion path list is present in that single file, in a form the agent can apply directly to its own search

### Requirement: Leg-routing guidance is documented
The store's procedure documentation SHALL state which retrieval leg to use for which kind of question, and SHALL make explicit that the catalog and the graph are artifacts contexture builds and maintains, to be consulted before falling back to direct content matching: structural questions (what connects to what) route to `graph query`; open conceptual questions route to the catalog first; known-literal or entity questions route to the agent's own direct content matching, scoped by the store's exclusion configuration and, where useful, narrowed first to a catalog section or graph neighborhood.

#### Scenario: Routing guidance names the CLI-maintained tools
- **WHEN** an agent reads the store's retrieval procedure documentation
- **THEN** it finds an explicit statement that the catalog and the graph are contexture-built-and-maintained artifacts to consult first, plus which leg answers a structural, a conceptual, and a literal question

### Requirement: Stable per-note retrieval record
The graph build and catalog build processes SHALL each be capable of emitting a per-note record containing at minimum the note's path-derived identity, its path, its resolved visibility, its catalog gloss (if any), and its canonicalized content hash, in a documented stable shape that a future search capability (deferred to v2, see design.md) could consume without re-deriving note identity.

#### Scenario: The per-note record is emitted
- **WHEN** `contexture graph build --emit-records` runs
- **THEN** it produces one record per retrievable note containing identity, path, resolved visibility, gloss, and content hash
