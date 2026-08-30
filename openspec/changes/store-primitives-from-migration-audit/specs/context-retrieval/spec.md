## Purpose

Extends the context-retrieval capability (see `bootstrap-contexture-core`): graph edges can carry a relation type from a configured vocabulary.

## ADDED Requirements

### Requirement: Relations can be typed
A note MAY declare typed relations in a frontmatter block naming a target and a type. `ctxr graph build` SHALL record the type on the edge, merging with untyped wikilinks to the same target, and `ctxr graph query` SHALL accept `--type <name>` to restrict results to edges of that type. The relation vocabulary SHALL come from configuration, defaulting to a single unnamed group; a type outside the vocabulary SHALL be a lint warning, not a build failure.

#### Scenario: A typed edge is queryable
- **WHEN** a note declares a relation of type `supports` to another note and the graph is built
- **THEN** `graph query --type supports` from that note returns the target and the graph artifact records the type on the edge

#### Scenario: Untyped links are unaffected
- **WHEN** a note links to another only by wikilink
- **THEN** the edge is recorded without a type and appears in unfiltered queries exactly as before
