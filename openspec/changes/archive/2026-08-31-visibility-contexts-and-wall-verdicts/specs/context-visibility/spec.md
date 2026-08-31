## Purpose

Extends the context-visibility capability (see `bootstrap-contexture-core`) with a configurable mapping from a requesting context to the set of visibility values it may see. The frontmatter key carrying a note's visibility remains the visibility field defined by `context-store`; this capability never names that key directly.

## ADDED Requirements

### Requirement: Visibility matching consults a configured context mapping
`contexture.yaml` MAY declare, for any named context, the list of visibility values that context can see. Every operation that filters notes by a requesting context (via `--as <context>` or equivalent) SHALL treat a note as visible when the note's resolved visibility is a member of that context's configured list. A context with no configured list SHALL see exactly the notes whose resolved visibility equals the context's own name (the identity default), and an unknown context SHALL NOT see any note beyond that identity match — the mapping fails closed, never open.

#### Scenario: A shared value is visible to multiple configured contexts
- **WHEN** the store's configuration maps both `ctx-a` and `ctx-b` to lists containing the value `ctx-shared`, and a note's resolved visibility is `ctx-shared`
- **THEN** a graph traversal requested `--as ctx-a` and one requested `--as ctx-b` each include that note

#### Scenario: The identity default preserves existing behavior
- **WHEN** the store's configuration declares no mapping entry for `ctx-a`
- **THEN** `--as ctx-a` includes exactly the notes whose resolved visibility is `ctx-a`, identically to a store created before this mapping existed

#### Scenario: An unmapped value stays invisible
- **WHEN** `ctx-a`'s configured list is `[ctx-a, ctx-shared]` and a note's resolved visibility is `ctx-b`
- **THEN** `--as ctx-a` excludes that note from the traversal itself, per the pre-filter requirement
