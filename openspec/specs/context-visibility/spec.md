# context-visibility Specification

## Purpose

Governs which named context may retrieve a given note. The frontmatter key carrying this label is the visibility field defined by `context-store` (a provisional choice, not yet finalized); this capability never names that key directly and refers throughout to "the visibility field."

## Requirements

### Requirement: Visibility resolves in a fixed order
A note's visibility SHALL resolve in this order: (1) an explicit value in the note's visibility field; (2) a directory default declared in `contexture.yaml` for the note's path; (3) failing both, the configured default visibility context named in `contexture.yaml`. `contexture note resolve` SHALL report both the resolved value and which of the three steps produced it.

#### Scenario: Explicit value wins over a directory default
- **WHEN** a note under a directory whose configured default is `ctx-a` carries an explicit visibility field value of `ctx-b`
- **THEN** `contexture note resolve` reports `ctx-b` as the resolved visibility, with the resolution reason "explicit"

#### Scenario: No explicit value falls back to directory default
- **WHEN** a note has no visibility field and sits under a directory with a configured default of `ctx-a`
- **THEN** `contexture note resolve` reports `ctx-a`, with the resolution reason "directory default"

#### Scenario: Fail-closed when neither applies
- **WHEN** a note has no visibility field and sits under a directory with no configured default
- **THEN** `contexture note resolve` reports the configured default visibility context from `contexture.yaml`, with the resolution reason "fail-closed default"

### Requirement: Visibility is enforced as a pre-filter
Any retrieval operation that accepts a requesting context (via an `--as <context>` argument or equivalent) SHALL exclude notes whose resolved visibility the requesting context cannot see before that operation ranks, traverses, or otherwise processes results. The exclusion SHALL NOT be applied only to the final output after processing has already used the excluded note's content.

#### Scenario: An excluded note never influences a result
- **WHEN** a graph traversal requested `--as ctx-a` would otherwise pass through a note whose resolved visibility `ctx-a` cannot see
- **THEN** that note is excluded from the traversal itself — it contributes no edges and appears in no result — not merely omitted from the final list

#### Scenario: A one-hop excluded neighbor is omitted, not just deprioritized
- **WHEN** `contexture graph neighbors <note> --as ctx-a` is run and one of `<note>`'s direct neighbors has a resolved visibility that `ctx-a` cannot see
- **THEN** that neighbor is absent from the result entirely

### Requirement: Every note has a resolvable visibility value
`contexture lint` SHALL report every note for which visibility resolution reaches the fail-closed default step, so that an operator can identify notes relying on the fail-closed behavior rather than an explicit or directory-derived value.

#### Scenario: Fail-closed notes are surfaced
- **WHEN** `contexture lint` runs against a store containing a note with no visibility field and no applicable directory default
- **THEN** the lint report lists that note under a "relying on fail-closed default" finding

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
