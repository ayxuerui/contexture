## REMOVED Requirements

### Requirement: `doctor` is machine-readable and fails on real invariants
**Reason**: The enumerated minimum check list named "notes with no resolvable explicit or directory-derived visibility (per context-visibility)", a check removed with that capability. The requirement is restated below without it; nothing else about `doctor` changes.
**Migration**: `ctxr doctor` no longer performs or reports the fail-closed-visibility invariant, and `ctxr lint` no longer reports its observation-severity twin. A store previously failing `doctor` only on that check now passes.

## ADDED Requirements

### Requirement: `doctor` enumerates every check and fails on real invariants
`contexture doctor --json` SHALL enumerate every check it performs with a pass, fail, or skip result for each, and SHALL exit non-zero if any check's result is fail. Checks SHALL include, at minimum: derived-artifact staleness, catalog coverage (per context-catalog), ambiguous link resolution and identity collisions (per context-retrieval), schema version currency (per store-lifecycle), adapter compatibility (per adapters), git/hook health (per write-lifecycle), and unrecognized top-level config keys. A link that resolves to no note at all (as opposed to resolving ambiguously, to more than one) is reported by lint (per context-organize), not doctor, per the "Doctor is distinct from lint" requirement below.

#### Scenario: Every check reports a result
- **WHEN** `contexture doctor --json` runs
- **THEN** its output lists every check it performed, each with a pass, fail, or skip result, not merely an aggregate status

#### Scenario: A single failing check fails the whole run
- **WHEN** exactly one of doctor's checks fails and all others pass
- **THEN** `doctor` exits non-zero

#### Scenario: An unresolvable link does not fail doctor
- **WHEN** the store's graph has a link that resolves to no note (not ambiguously — to none) and every other doctor check passes
- **THEN** `doctor` exits 0, since an unresolvable link is a lint-reported observation (per context-organize), never a doctor invariant

#### Scenario: An ambiguous link fails doctor
- **WHEN** the store's graph has a link whose target matches two or more notes' basenames
- **THEN** `doctor` fails, since resolution is broken and always mechanically fixable, unlike an unresolvable link
