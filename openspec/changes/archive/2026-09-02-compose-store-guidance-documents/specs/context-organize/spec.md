## ADDED Requirements

### Requirement: The mission document has a shipped default location and is seeded at init
`organize.mission_path` SHALL default to a path under the configured guidance directory, so every store carries a mission document without an operator opting in. `init` SHALL seed the file when it does not already exist. Staleness detection for the path named by `organize.mission_path` SHALL read that document directly rather than locating it through any retrieval-facing note listing, so its location under the guidance directory — which is excluded from that listing — does not prevent it from being found. Setting `organize.mission_path` to an empty value SHALL remove both the seeding behavior and the staleness rule for it.

#### Scenario: A fresh init seeds an unwritten mission document
- **WHEN** `contexture init` runs with no `organize.mission_path` override
- **THEN** the default mission path exists on disk, and `ctxr rollup stale` reports it stale, since it records no rollup timestamp

#### Scenario: The mission document is found regardless of retrieval exclusion
- **WHEN** the configured mission path falls under a directory excluded from the store's note listing
- **THEN** `ctxr rollup stale` and `ctxr rollup write` still locate and operate on it

#### Scenario: Unsetting the mission path removes the mechanism
- **WHEN** a store's configuration sets `organize.mission_path` to an empty value
- **THEN** `init` seeds no mission file, and `ctxr rollup stale` reports no mission-rule candidate
