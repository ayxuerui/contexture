## MODIFIED Requirements

### Requirement: `doctor` is machine-readable and fails on real invariants
`contexture doctor --json` SHALL enumerate every check it performs with a pass, fail, or skip result for each, and SHALL exit non-zero if any check's result is fail. Checks SHALL include, at minimum: derived-artifact staleness, catalog coverage (per context-catalog), dangling links and identity collisions (per context-retrieval), notes with no resolvable explicit or directory-derived visibility (per context-visibility), schema version currency (per store-lifecycle), adapter compatibility (per adapters), git/hook health (per write-lifecycle), unrecognized top-level config keys, and the entry document's inlined conventions section staying within its configured size budget (per harness-portability).

#### Scenario: Every check reports a result
- **WHEN** `contexture doctor --json` runs
- **THEN** its output lists every check it performed, each with a pass, fail, or skip result, not merely an aggregate status

#### Scenario: A single failing check fails the whole run
- **WHEN** exactly one of doctor's checks fails and all others pass
- **THEN** `doctor` exits non-zero

#### Scenario: An oversized inlined conventions section fails its check
- **WHEN** the generated entry document's inlined conventions section exceeds the configured size budget
- **THEN** `doctor` fails the size check, naming the current size and the configured budget
