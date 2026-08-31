# context-retrieval Specification

## Purpose

Provides structural enumeration — a deterministic wikilink graph, CLI-computed and CLI-queried, plus a human-readable render of the same build — as the store's second retrieval leg alongside the catalog. The graph enumerates structure and ranks nothing; a positional cluster on every node and typed edges from a configured relation vocabulary give the enumeration shape without any layer name or one deployment's taxonomy entering a requirement.

## Requirements

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

### Requirement: The graph build renders a human-readable document
`ctxr graph build` SHALL write, alongside the graph artifact and under the same derived cache path, a markdown document containing: counts (notes, links, typed links, clusters, bridges, orphans); hub notes per cluster as a table of the top-N notes by backlink count; cross-cluster bridges as the top-N notes by the number of distinct other clusters they link into; and orphans (zero backlinks) by cluster, excluding clusters an operator has declared exempt. N for hubs and bridges SHALL come from configuration with shipped defaults. The document SHALL be byte-identical across two builds of an unchanged store and SHALL carry no timestamp.

#### Scenario: Two builds, one document
- **WHEN** `graph build` runs twice with no note changed in between
- **THEN** the document's bytes are identical after both runs

#### Scenario: Hubs are grouped by cluster and capped
- **WHEN** a cluster has more notes with backlinks than the configured hub limit
- **THEN** its table lists exactly that many, ordered by backlink count descending, and a cluster with no backlinked notes has no table

#### Scenario: An exempt cluster stays out of the orphan list
- **WHEN** configuration declares a cluster exempt and a note in it has zero backlinks
- **THEN** the document's orphan section omits that note while `lint`'s orphan finding still reports it

### Requirement: Nodes carry a positional cluster
Every graph node SHALL carry a cluster derived from its path: the first configured-depth directory segments joined with `/` (default depth two), a shallower note using the segments it has, and a root note belonging to the root cluster. The rule SHALL NOT consult layer names.

#### Scenario: Depth-two cluster under a layered store
- **WHEN** a note lives at `<layer>/<location>/<sub>/note.md`
- **THEN** its cluster is `<layer>/<location>`

#### Scenario: Root note
- **WHEN** a note lives at the store root
- **THEN** its cluster is the root cluster and it never appears as a bridge

### Requirement: Relation sections yield typed edges
Configuration MAY declare a relation vocabulary as a list of names (default empty). A wikilink inside a section whose heading text — trimmed, trailing colon removed, compared case-insensitively — equals a vocabulary name SHALL be recorded as an edge of that type; the section ends at the next heading of the same or a higher level. Every other wikilink SHALL be recorded as an untyped link. With an empty vocabulary the build SHALL record no typed edges.

#### Scenario: A link under a vocabulary heading is typed
- **WHEN** the vocabulary contains `supports` and a note has `## Supports:` followed by `[[Other]]` before the next heading
- **THEN** the edge to `Other` has type `supports`

#### Scenario: A link after the section closes is untyped
- **WHEN** the same note has a `## Notes` heading after the `Supports` section followed by `[[Third]]`
- **THEN** the edge to `Third` has the untyped link type

#### Scenario: Empty vocabulary changes nothing
- **WHEN** no vocabulary is configured and a note has a `## Supports` section with links
- **THEN** every edge is untyped and the graph matches a build made before this capability existed

### Requirement: Cluster and bridge queries
`ctxr graph query clusters` SHALL list every cluster with its note count; `ctxr graph query bridges [--top <n>]` SHALL list notes ordered by the number of distinct other clusters they link into, ties broken by path; `ctxr graph query neighbors` SHALL accept `--type <name>` to restrict traversal to edges of that type. Each SHALL apply the `--as <context>` pre-filter before computing.

#### Scenario: A bridge is counted by clusters, not links
- **WHEN** note A links three times into one other cluster and note B links once into each of two other clusters
- **THEN** `bridges` ranks B above A

#### Scenario: Visibility filters bridges
- **WHEN** the only note that makes A a bridge is invisible to `ctx-a`
- **THEN** `graph query bridges --as ctx-a` does not list A on the strength of that link
