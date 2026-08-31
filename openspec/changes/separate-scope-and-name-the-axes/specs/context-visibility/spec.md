## ADDED Requirements

### Requirement: The visibility field's enforcement extends to contexture-computed retrieval and no further
The visibility field SHALL be enforced by the pre-filter defined in this capability, on every retrieval leg contexture itself computes. No specification SHALL assert that the visibility field withholds a note's content from a party that reads the store's files by other means — direct content matching, a text editor, or any process reading the repository — because contexture has no mechanism that could enforce that. Documentation generated for agents SHALL state this boundary, and the store's leak-scan check SHALL remain the reporting mechanism for content that would be exposed by an unfiltered read.

#### Scenario: A filtered leg withholds the note
- **WHEN** a retrieval operation contexture computes is invoked as a context that cannot see a note's resolved visibility
- **THEN** the note is excluded by the pre-filter, before that operation ranks, traverses, or otherwise processes results

#### Scenario: An unfiltered read is out of scope and is documented as such
- **WHEN** an agent performs direct content matching over the store's files without invoking contexture
- **THEN** no visibility filtering applies to that read, and the store's generated agent documentation states that the catalog and the graph are the visibility-enforced legs

### Requirement: The visibility pre-filter and the scope selector compose as one filter
Where a retrieval operation accepts both a requesting context and a scope selector, a note SHALL be considered only when the visibility field admits it for that context and the scope selector admits it, and both SHALL be applied before that operation ranks, traverses, or otherwise processes results. Neither filter SHALL be applied only to the final output, and no operation SHALL apply one without the other being available to it.

#### Scenario: Both filters apply before traversal
- **WHEN** a graph traversal is invoked as `ctx-a` naming scope `scope-a`, and a note is in `scope-a` but carries a resolved visibility `ctx-a` cannot see
- **THEN** the note contributes no edges to the traversal and appears in no result

#### Scenario: In scope but invisible stays excluded
- **WHEN** the same traversal encounters a note that is in `scope-a` and visible to `ctx-a`, adjacent to one that is in `scope-a` but not visible to `ctx-a`
- **THEN** the visible note is returned and the invisible one is absent entirely, not merely ranked lower
