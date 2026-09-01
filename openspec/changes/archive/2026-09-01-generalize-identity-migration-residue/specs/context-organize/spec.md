## ADDED Requirements

### Requirement: The store mission document is stale on elapsed time, not backlinks
When a store's configuration declares `organize.mission_path` and the note at that path exists, `ctxr rollup stale` SHALL report it as stale when it records no rollup timestamp, or when the elapsed time since its recorded rollup timestamp exceeds `organize.rollup_stale_days` — independent of any note's backlinks, since a store-wide mission document has no natural set of backlinking notes to compare against. This rule SHALL apply only to the note at the configured mission path; every other entity note's staleness continues to be computed by the existing backlink-based rule.

#### Scenario: An unwritten mission document is stale
- **WHEN** `organize.mission_path` is configured, the note exists, and it records no rollup timestamp
- **THEN** `ctxr rollup stale` lists it as stale

#### Scenario: An aged mission document is stale
- **WHEN** the mission document's recorded rollup timestamp is older than `organize.rollup_stale_days` before the current time
- **THEN** `ctxr rollup stale` lists it as stale, regardless of whether any other note in the store was recently modified

#### Scenario: A freshly rolled-up mission document is not stale
- **WHEN** the mission document's recorded rollup timestamp is within `organize.rollup_stale_days` of the current time
- **THEN** `ctxr rollup stale` does not list it

#### Scenario: No mission path means no new candidate
- **WHEN** a store declares no `organize.mission_path`
- **THEN** `ctxr rollup stale`'s candidate set and results are identical to before this requirement existed
