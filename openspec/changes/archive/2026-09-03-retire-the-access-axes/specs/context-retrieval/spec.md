## MODIFIED Requirements

### Requirement: Stable per-note retrieval record
The graph build and catalog build processes SHALL each be capable of emitting a per-note record containing at minimum the note's path-derived identity, its path, its catalog gloss (if any), and its canonicalized content hash, in a documented stable shape that a future search capability (deferred to v2, see design.md) could consume without re-deriving note identity.

#### Scenario: The per-note record is emitted
- **WHEN** `contexture graph build --emit-records` runs
- **THEN** it produces one record per retrievable note containing identity, path, gloss, and content hash

### Requirement: Cluster and bridge queries
`ctxr graph query clusters` SHALL list every cluster with its note count; `ctxr graph query bridges [--top <n>]` SHALL list notes ordered by the number of distinct other clusters they link into, ties broken by path; `ctxr graph query neighbors` SHALL accept `--type <name>` to restrict traversal to edges of that type.

#### Scenario: A bridge is counted by clusters, not links
- **WHEN** note A links three times into one other cluster and note B links once into each of two other clusters
- **THEN** `bridges` ranks B above A
