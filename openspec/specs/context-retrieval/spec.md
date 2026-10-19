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
contexture SHALL define one fixed relation vocabulary, identical in every store and not configurable. A wikilink inside a section whose heading text — trimmed, trailing colon removed, compared case-insensitively — equals a vocabulary name SHALL be recorded as an edge of that type; the section ends at the next heading of the same or a higher level. Every other wikilink SHALL be recorded as an untyped link, which is what a heading outside the vocabulary yields.

Each name SHALL carry a definition stating when to use it and how it differs from its neighbours, because a name alone does not tell an agent which of two adjacent relations a link belongs under. This requirement is the only place the vocabulary and its definitions are enumerated; no other requirement may name a relation.

- **Upstream** — the thinking this note is built on: prior ideas, sources, and decisions that had to exist first. If removing the linked note would leave this one unfounded, it is upstream.
- **Downstream** — what follows from this note: what it enables, informs, or raises. The inverse of Upstream.
- **Similar** — a note this one resembles in structure, pattern, or topic, where neither depends on the other. Use it when the observation is that the two rhyme, not that one caused the other.
- **Opposing** — a note that contradicts this one, or that holds under conditions where this one fails. The tension is the content; record it rather than resolving it by dropping a side.

Edges SHALL remain directed and recorded only from the note that carries the link: naming a note Upstream SHALL NOT cause the reciprocal Downstream edge to be recorded on it, and every shipped artifact that explains the vocabulary SHALL say so, since an agent that assumes reciprocity will leave half the graph unwritten.

Every shipped artifact that names the vocabulary SHALL render the definitions from the same source as the names — at minimum the generated entry document, the skill that groups link proposals by relation, and the note template carrying the sections — so a definition cannot drift from the name it explains.

#### Scenario: A link under a vocabulary heading is typed
- **WHEN** a note has a section headed with a vocabulary name followed by `[[Other]]` before the next heading
- **THEN** the edge to `Other` has that name as its type

#### Scenario: A link after the section closes is untyped
- **WHEN** the same note has a `## Notes` heading after that section followed by `[[Third]]`
- **THEN** the edge to `Third` has the untyped link type

#### Scenario: Empty vocabulary changes nothing
- **WHEN** a store carries a note whose only headings are outside the vocabulary
- **THEN** every edge it yields is untyped, exactly as before this capability existed

#### Scenario: Typed edges need no configuration
- **WHEN** a store initialized on the default configuration builds its graph over a note using a vocabulary heading
- **THEN** the edge is typed, and no configuration key had to be declared to make it so

#### Scenario: The vocabulary is not configurable
- **WHEN** a store's configuration declares a relation vocabulary key
- **THEN** that key is unrecognized and the store fails the configuration-integrity check naming it, rather than the declared names taking effect

### Requirement: Cluster and bridge queries
`ctxr graph query clusters` SHALL list every cluster with its note count; `ctxr graph query bridges [--top <n>]` SHALL list notes ordered by the number of distinct other clusters they link into, ties broken by path; `ctxr graph query neighbors` SHALL accept `--type <name>` to restrict traversal to edges of that type.

#### Scenario: A bridge is counted by clusters, not links
- **WHEN** note A links three times into one other cluster and note B links once into each of two other clusters
- **THEN** `bridges` ranks B above A

### Requirement: The graph delta between two commits is reported
`ctxr graph diff --since <ref> [--until <ref>]` SHALL report how the store's knowledge changed between two
commits: the head, which is the commit `--until` names and `HEAD` when it is absent, and the base, which is the
merge base of the `--since` ref and the head. Every form of the report SHALL name the full commit ids of the
base and the head, so the range can be re-run exactly from any checkout of the repository. Both sides SHALL be enumerated by
the same note-admission rule the graph build uses, read under the store's current configuration, so a path
that configuration excludes appears on neither side. The command SHALL require `--since` and refuse with a
usage error when it is absent, and SHALL refuse with an error naming the ref when either ref does not
resolve to a commit.

The report SHALL carry, each sorted by path and then by the remaining fields:

- **Notes** that were added, removed, modified, moved, or archived. A move is a rename git's rename detection
  reports between two admitted note paths. An archive is a rename from a path outside the configured archive
  destination to a path beneath it, reported with its old and new path, and never also counted as a move or a
  removal.
- **Links** added and removed, each with its source note, its target note and its edge type. Before
  comparison, every base-side path SHALL be carried through the reported moves and archives, so that moving a
  note whose links still resolve reports no link change.
- **Dangling links** introduced and resolved, each with its source note, its unresolved target and the reason
  it does not resolve.
- **Notes whose inbound links changed**, each with the source notes gained and lost, and whether the note
  carries a rollup region on the head side.
- **Rollups touched**: notes whose rollup region (the region `ctxr rollup write` writes) was added, removed or
  changed between the two sides.
- **Sources cited**: for each added or modified note, the entries of the provenance field defined by the
  context-ingest specification that it carries on the head side but not on the base side.
- **Counts** of each of the above.

The command SHALL report facts only. It SHALL carry no severity, score, ranking or recommendation, SHALL emit
no finding, SHALL exit successfully whenever both sides could be read, and SHALL gate nothing.

#### Scenario: An added note and its links are reported
- **WHEN** the head adds `ctx-a/new.md` linking `[[existing]]` and `[[missing]]`, where `existing` resolves and
  `missing` does not
- **THEN** the report lists `ctx-a/new.md` as added, one added link from it to the existing note, and one
  introduced dangling link to `missing` with reason not found

#### Scenario: A moved note keeps its links
- **WHEN** the head renames `ctx-a/old.md` to `ctx-b/old.md` with its content unchanged, and other notes link
  to it by its unchanged stem
- **THEN** the report lists one move from `ctx-a/old.md` to `ctx-b/old.md` and no added or removed link

#### Scenario: An archived note is reported as archived
- **WHEN** the head moves `ctx-a/done.md` to its path beneath the configured archive destination
- **THEN** the report lists it once, as archived, with both paths, and not as a move or a removal

#### Scenario: A link moved between relation sections changes type
- **WHEN** a note's link to `other` moves from under one relation-vocabulary heading to under another
- **THEN** the report lists one removed link of the first type and one added link of the second, both from
  that note to `other`

#### Scenario: A resolved dangling link is reported
- **WHEN** the base has a note linking `[[later]]` that does not resolve, and the head adds a note whose stem
  is `later`
- **THEN** the report lists that dangling link as resolved and the corresponding link as added

#### Scenario: A rewritten rollup is reported
- **WHEN** the head changes the text inside a note's rollup region
- **THEN** the report lists that note under rollups touched

#### Scenario: A newly cited source is reported
- **WHEN** a modified note's provenance field gains one entry between the two sides
- **THEN** the report lists that note with exactly that entry under sources cited

#### Scenario: An excluded path appears on neither side
- **WHEN** the change adds a markdown file under a path the configuration excludes from retrieval
- **THEN** the report does not list it, and no link from or to it appears

#### Scenario: The report names both commits in full
- **WHEN** `ctxr graph diff --since <ref>` runs in any of its output forms
- **THEN** the output names the full commit id of the base and of the head it compared

#### Scenario: An explicit range is re-run exactly
- **WHEN** `ctxr graph diff --since <base-id> --until <head-id>` runs with the two commit ids an earlier report
  named, from a different checkout of the same repository whose `HEAD` is elsewhere
- **THEN** it reports the same commits, counts and lists as the earlier report

#### Scenario: The base ref must be named
- **WHEN** `ctxr graph diff` runs without `--since`
- **THEN** it exits with the usage code and reports nothing

### Requirement: The graph delta is byte-stable and reads no checkout or cache
For a given base and head commit and an unchanged configuration, the report `ctxr graph diff` produces SHALL
be byte-identical across runs, in each of its output forms. It SHALL NOT depend on the wall
clock, on uncommitted or untracked files, on the per-checkout graph artifact, or on the git configuration of
the user running it. The command SHALL build the base-side graph from the base commit's tree, read through
git's object store. It SHALL NOT check out, stash or switch anything, and SHALL NOT create, modify or delete
any file in the store, including under the derived cache paths. A store whose root lies below the
repository's top level SHALL be handled the same as one at the top level, with every reported path relative
to the store root.

#### Scenario: Two runs agree byte for byte
- **WHEN** `ctxr graph diff --since <ref> --json` runs twice against the same commits at different wall-clock
  times
- **THEN** the two outputs are byte-identical

#### Scenario: Uncommitted work does not enter the report
- **WHEN** the working tree carries an uncommitted edit adding a link, and an untracked new note
- **THEN** neither appears in the report, which describes the head commit alone

#### Scenario: The command writes nothing
- **WHEN** `ctxr graph diff --since <ref>` runs in a store
- **THEN** `git status --porcelain` and the contents of the derived cache paths are the same after it as before
  it

#### Scenario: A stale or missing graph artifact changes nothing
- **WHEN** the per-checkout graph artifact is absent or was built before the latest commit
- **THEN** the report is the same as when the artifact is freshly built

### Requirement: The graph delta names where it can be reviewed
When the resolved store root is a session worktree, the report SHALL name the address of that worktree's review
view, carrying the head commit id the report was computed for so the view can tell when the branch has moved on:
the server-relative route always, and an absolute address against `serve.base_url` when it is declared,
keeping any path the base URL carries. When no base URL is declared, the report SHALL state that the address is
a bare route and SHALL NOT invent an origin. Outside a session worktree, and wherever the store configures
`serve.previews` as `none`, the report SHALL name no review address. The review address SHALL have no
after-landing form: the view is a convenience that exists only while the worktree does and the server is
reachable, and the report's own record of the change is what outlives it.

#### Scenario: A session worktree's report names its review route
- **WHEN** `ctxr graph diff --since <ref>` runs in a session worktree in a store declaring no `serve.base_url`
- **THEN** the report names the review route for that worktree, carrying the head commit id, and states that it
  is a bare route

#### Scenario: A base URL with a path prefix is kept
- **WHEN** the store declares `serve.base_url` as an address that carries a path prefix
- **THEN** the review address is that base URL, prefix included, followed by the review route

#### Scenario: Outside a worktree there is no review address
- **WHEN** the command runs in the store's own checkout rather than a session worktree
- **THEN** the report names no review address

#### Scenario: Previews configured off drop the review address
- **WHEN** `serve.previews` is `none` and the command runs in a session worktree
- **THEN** the report names no review address

### Requirement: The graph delta renders the pull request's knowledge-changes block
`ctxr graph diff --format markdown` SHALL write to standard output a markdown block, headed Knowledge changes,
that a pull request body can carry verbatim with no further editing. The block SHALL contain the full base and
head commit ids, the exact `ctxr graph diff --since <base-id> --until <head-id>` command that reproduces it, the
count of each kind the report carries, every dangling link introduced and every note archived, and, when the
report names a review address, that address with one line stating that it resolves only while the session's
worktree exists and the server can reach it. When the delta is empty, the block SHALL say that the range changes
no note rather than being empty. The block SHALL be built from the same delta as the other output forms and
SHALL carry no judgment that the report does not make.

`--format` SHALL accept `text` (the default) and `markdown`, and SHALL refuse any other value with a usage
error. `--format markdown` together with `--json` SHALL be refused with a usage error, since the block is the
whole output and has no envelope.

#### Scenario: The block names its range and how to reproduce it
- **WHEN** `ctxr graph diff --since <ref> --format markdown` runs
- **THEN** the output is a single markdown block that names the base and head commit ids in full and contains
  `ctxr graph diff --since <base-id> --until <head-id>` with those ids

#### Scenario: Running the reproducing command gives the same facts
- **WHEN** the command the block names is run in another checkout of the same repository with
  `--format markdown`
- **THEN** its commit ids, counts, dangling links and archived notes are identical to the original block's

#### Scenario: The block lists the silent losses in full
- **WHEN** the range introduces three dangling links and archives two notes
- **THEN** the block lists all three dangling links and both archived notes, and gives every other kind as a
  count

#### Scenario: An empty range says so
- **WHEN** the range changes no admitted note
- **THEN** the block states that the range changes no note, and still names both commit ids and the
  reproducing command

#### Scenario: The block has no envelope
- **WHEN** `ctxr graph diff --since <ref> --format markdown --json` runs
- **THEN** it exits with the usage code and writes no block

#### Scenario: An unknown format is refused
- **WHEN** `ctxr graph diff --since <ref> --format html` runs
- **THEN** it exits with the usage code, naming the accepted values
