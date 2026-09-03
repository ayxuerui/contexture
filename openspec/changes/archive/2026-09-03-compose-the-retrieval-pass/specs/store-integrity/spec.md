## MODIFIED Requirements

### Requirement: `doctor` enumerates every check and fails on real invariants
`contexture doctor --json` SHALL enumerate every check it performs with a pass, fail, or skip result for each, and SHALL exit non-zero if any check's result is fail. Checks SHALL include, at minimum: derived-artifact staleness, catalog coverage (per context-catalog), ambiguous link resolution and identity collisions (per context-retrieval), schema version currency (per store-lifecycle), adapter compatibility (per adapters), git/hook health (per write-lifecycle), unrecognized top-level config keys, the entry document's inlined conventions section staying within its configured size budget (per harness-portability), and no path prefix being declared both excluded and demoted (per context-retrieval). A link that resolves to no note at all (as opposed to resolving ambiguously, to more than one) is reported by lint (per context-organize), not doctor, per the "Doctor is distinct from lint" requirement below.

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

#### Scenario: An oversized inlined conventions section fails its check
- **WHEN** the generated entry document's inlined conventions section exceeds the configured size budget
- **THEN** `doctor` fails the size check, naming the current size and the configured budget

#### Scenario: A path declared both excluded and demoted fails its check
- **WHEN** configuration lists the same path prefix in both the exclusion list and the demotion list
- **THEN** `doctor` fails that check, naming the path, rather than resolving the ambiguity by precedence
