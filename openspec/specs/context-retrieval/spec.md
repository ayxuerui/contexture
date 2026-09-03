# context-retrieval Specification

## Purpose

Provides retrieval as one pass over the store rather than a menu of legs: an entry set is named positionally or relationally, the deterministic wikilink graph expands it, and the agent's own content matching widens it when the first two do not answer. The pass composes the catalog and the graph — CLI-computed, deterministic, offline — and returns identities, glosses, and the evidence for each result, never bodies and never a score. It ranks nothing: every result is ordered by an operator-declared tier, a count of graph edges, a frozen precedence over entry reasons, and finally by path.

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
The store's skill documentation SHALL state which retrieval leg to use for which kind of question, and SHALL make explicit that the catalog and the graph are artifacts contexture builds and maintains, to be consulted before falling back to direct content matching: structural questions (what connects to what) route to `graph query`; open conceptual questions route to the catalog first; known-literal or entity questions route to the agent's own direct content matching, scoped by the store's exclusion configuration and, where useful, narrowed first to a catalog section or graph neighborhood. That narrowing step SHALL name the command that computes it, so the documented pass and the shipped command surface cannot describe different stores.

#### Scenario: Routing guidance names the CLI-maintained tools
- **WHEN** an agent reads the store's retrieval skill documentation
- **THEN** it finds an explicit statement that the catalog and the graph are contexture-built-and-maintained artifacts to consult first, plus which leg answers a structural, a conceptual, and a literal question

#### Scenario: The narrowing step names the command that computes it
- **WHEN** an agent reads the documented instruction to narrow to a catalog section or graph neighborhood before matching content directly
- **THEN** that instruction names the command that produces the narrowed set, rather than describing a narrowing the agent must assemble from two other commands

### Requirement: The pass is computed from entry selectors, never from a query
The store SHALL provide a command that accepts one or more entry selectors — a catalog section, a path prefix, a note path, or an entity whose backlinks name its note set — and returns every retrievable note reachable from that entry set through the built graph within a requested hop depth, using the traversal options the graph's neighbor query already accepts. The command SHALL NOT accept a free-text query, SHALL NOT read note bodies to match against anything, and SHALL NOT emit any numeric measure of relevance; contexture therefore still provides no command that wraps or duplicates direct content matching. Every note within the requested depth SHALL be returned, subject only to the declared budget below.

#### Scenario: An entry set expands through the graph
- **WHEN** the command is invoked with a note path as its entry selector and a hop depth of two
- **THEN** it returns that note and every note reachable from it through the built graph within two hops

#### Scenario: A catalog section seeds every note it lists
- **WHEN** the command is invoked with a catalog section as its entry selector
- **THEN** every note that section lists is in the entry set, and expansion proceeds from all of them

#### Scenario: Multiple entry selectors compose as one deduplicated set
- **WHEN** the command is invoked with two entry selectors whose reachable sets overlap
- **THEN** each note appears exactly once, carrying the evidence for every way it was reached

#### Scenario: There is no free-text query argument
- **WHEN** the command's argument surface is enumerated
- **THEN** no argument accepts a free-text query, and no output field carries a score, weight, or other numeric relevance measure

#### Scenario: An entry selector matching nothing succeeds and returns nothing
- **WHEN** an entry selector resolves to no note
- **THEN** the command exits zero with an empty result rather than reporting an error

### Requirement: Results carry identities and evidence, never bodies or scores
Each note the pass returns SHALL carry its path, the catalog section it belongs to, its authored catalog gloss where one exists, its canonicalized content hash, its hop distance from the nearest entry, and a set of labels naming why it is present. Labels SHALL be of two kinds, declared in configuration-independent form: entry-reason labels, which record how the note was reached and participate in ordering, and qualifier labels, which describe the note and SHALL NOT affect ordering. A note whose catalog entry carries no authored gloss SHALL be labelled as such rather than given fabricated text. The pass SHALL NOT return note bodies or excerpts of them.

#### Scenario: A note reached two ways carries both labels
- **WHEN** a note is both listed by an entry section and reachable as a graph neighbour of another entry
- **THEN** it appears once carrying both entry-reason labels

#### Scenario: A note with no authored gloss is labelled, not described
- **WHEN** a returned note's catalog entry has an empty gloss
- **THEN** the result carries the empty gloss and a qualifier label recording its absence, and no descriptive text is generated for it

#### Scenario: Bodies are never returned
- **WHEN** the pass returns any result
- **THEN** it carries identity, section, gloss, hash, hop distance and labels, and no note body or excerpt of one

### Requirement: The pass emits one total order over structural facts
Results SHALL be ordered by, in this precedence: the note's retrieval tier, with non-demoted before demoted; then hop distance from the nearest entry, ascending; then the entry-reason label's rank in a precedence frozen by this specification; then the note's path. The order SHALL be total, SHALL be derived only from operator declarations and counts over the store's own structure, and SHALL involve no weight, coefficient, or tunable value. Two runs of the pass over an unchanged store SHALL produce byte-identical output.

#### Scenario: A demoted note is ordered after an otherwise identical one
- **WHEN** two results are equal in hop distance and entry reason and one lies under a demoted prefix
- **THEN** the demoted one is ordered after the other

#### Scenario: A nearer hop precedes a farther one
- **WHEN** two results differ only in hop distance
- **THEN** the nearer is ordered first

#### Scenario: Path breaks every remaining tie
- **WHEN** two results are equal in tier, hop distance and entry reason
- **THEN** they are ordered by path, so the order is total

#### Scenario: Two runs agree byte for byte
- **WHEN** the pass runs twice against an unchanged store with identical arguments
- **THEN** the two outputs are byte-identical

### Requirement: The pass declares a budget and reports its truncation
The pass SHALL cap the number of notes it returns at a limit read from configuration with a shipped default and overridable per invocation, SHALL report each returned note's size and the count of notes the cap omitted, and SHALL NOT truncate silently. Truncation SHALL remove results from the end of the declared order and SHALL NOT reorder what remains.

#### Scenario: A capped result names what it omitted
- **WHEN** more notes are reachable within the requested depth than the cap admits
- **THEN** the output reports that it was truncated and how many notes it omitted

#### Scenario: An uncapped result reports no truncation
- **WHEN** every reachable note fits within the cap
- **THEN** the output reports no truncation and omits nothing

#### Scenario: The cap never reorders what remains
- **WHEN** the same invocation is run with a cap and without one
- **THEN** the capped output is a prefix of the uncapped one

### Requirement: Every leg contexture computes withholds what configuration excludes
No retrieval leg contexture itself computes SHALL return a note the store's exclusion configuration does not admit, as the store's note enumeration defines admission. Each leg SHALL name its enforcing mechanism: the catalog's coverage check fails `doctor` on an entry naming a path the store no longer admits; and the single loader through which every graph query and the pass read the persisted graph SHALL refuse a graph carrying a node the store no longer admits, exiting non-zero and naming both the node and the command that rebuilds the graph. Refusal SHALL be by pre-filtering at that loader, never by discarding results after they are produced. A persisted graph merely missing a note the store has since added SHALL NOT fail, since it withholds nothing. Direct content matching remains the agent's own leg and is out of scope for this requirement: the store's only obligation to it is to publish the exclusion list, as the content-matching requirement already provides.

#### Scenario: A query refuses a graph carrying a newly excluded note
- **WHEN** a path is added to the store's exclusion configuration after the graph was built, and a graph query or the pass is then invoked
- **THEN** it exits non-zero, naming the excluded node and the graph build command, and returns no results

#### Scenario: A rebuild restores the query
- **WHEN** the graph is rebuilt after that exclusion is declared
- **THEN** the same query exits zero and the excluded note is absent from its results

#### Scenario: A merely out-of-date graph still answers
- **WHEN** a note is added to the store and the graph has not been rebuilt
- **THEN** graph queries continue to answer, since a graph missing a note withholds nothing

#### Scenario: Content matching is named as out of scope, not silently covered
- **WHEN** this guarantee is read for what it covers
- **THEN** it names the legs contexture computes and states that direct content matching is the agent's own, served by the published exclusion list

### Requirement: Demotion is distinct from exclusion
Configuration MAY declare a path prefix demoted. A note under a demoted prefix SHALL remain retrievable — present in the catalog, present in the graph, and returned by every leg — but SHALL be ordered after all non-demoted results wherever a leg returns an ordered list. Exclusion, which removes a path from retrieval entirely, SHALL remain a separate declaration; no path SHALL be both, and a store declaring a path both ways SHALL fail `doctor` non-zero naming the path. The configured archive destination SHALL be demoted by default, named from configuration rather than as a literal path.

#### Scenario: A demoted note still surfaces, ordered last
- **WHEN** a leg returns a result set containing one note under a demoted prefix and one not
- **THEN** both are returned and the demoted note is ordered after the other

#### Scenario: Demotion is not exclusion
- **WHEN** a note under a demoted prefix would satisfy a catalog coverage check
- **THEN** it has a catalog entry and the coverage check passes, exactly as for a non-demoted note

#### Scenario: A path declared both ways fails doctor
- **WHEN** configuration lists the same path prefix as both excluded and demoted
- **THEN** `ctxr doctor` reports a failing check naming that path

#### Scenario: The configured archive destination is demoted by default
- **WHEN** a store is initialized and its taxonomy resolves an archive destination
- **THEN** that destination is demoted without further declaration, and the declaration names it from configuration rather than as a fixed path

### Requirement: No retrieval output depends on the wall clock
No retrieval leg's results, ordering, or rendered output SHALL vary with the current time. Ordering SHALL NOT consider a note's modification time, age, or any decay derived from either. A question about staleness SHALL be answered by the organize capability, which reports it rather than ordering by it.

#### Scenario: The same store retrieved at two different times agrees
- **WHEN** the pass runs against an unchanged store at two different wall-clock times
- **THEN** the two outputs are byte-identical

#### Scenario: A recently modified note is not ordered ahead of an older one
- **WHEN** two results differ only in when their notes were last modified
- **THEN** their relative order is unchanged by that difference

### Requirement: Stable per-note retrieval record
The graph build and catalog build processes SHALL each be capable of emitting a per-note record containing at minimum the note's path-derived identity, its path, its catalog gloss (if any), and its canonicalized content hash, in a documented stable shape that a future search capability (deferred to v2, see design.md) could consume without re-deriving note identity.

#### Scenario: The per-note record is emitted
- **WHEN** `contexture graph build --emit-records` runs
- **THEN** it produces one record per retrievable note containing identity, path, gloss, and content hash

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
`ctxr graph query clusters` SHALL list every cluster with its note count; `ctxr graph query bridges [--top <n>]` SHALL list notes ordered by the number of distinct other clusters they link into, ties broken by path; `ctxr graph query neighbors` SHALL accept `--type <name>` to restrict traversal to edges of that type.

#### Scenario: A bridge is counted by clusters, not links
- **WHEN** note A links three times into one other cluster and note B links once into each of two other clusters
- **THEN** `bridges` ranks B above A
