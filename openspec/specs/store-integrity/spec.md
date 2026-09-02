# store-integrity Specification

## Purpose

Provides a single machine-readable system-health check that fails on real invariant violations — distinct from lint, which reports content-quality observations and never fails — so that automation can gate on store health without conflating "worth reviewing" with "broken."

## Requirements

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

### Requirement: Doctor is distinct from lint
`doctor` SHALL fail (non-zero exit) when it detects a violated invariant; `lint` (per context-organize) SHALL always exit 0. No single check SHALL be duplicated as both a lint finding and a doctor failure for the same underlying condition — each condition SHALL be classified once as either a health observation (lint) or an invariant (doctor).

#### Scenario: A doctor failure is never reclassified as a mere lint finding
- **WHEN** a condition doctor treats as a failing check (for example, catalog coverage) is evaluated
- **THEN** it does not also appear in lint's report, since a genuine invariant lives in exactly one of the two commands

### Requirement: A config key `StoreConfigSchema` doesn't recognize fails doctor by name
Because the store config schema is loose (`.passthrough()`, so a later package version's additive field never forces every existing store through a migration), a key the schema doesn't declare would otherwise pass config loading silently. `doctor` SHALL fail this gap closed: it SHALL compare the loaded config's top-level keys against the schema's declared shape and fail, naming every key that isn't declared — whether from a schema version this old, a typo, or a capability retired in a later release.

#### Scenario: A retired capability's config key survives an upgrade
- **WHEN** `contexture.yaml` still declares a top-level key from a capability a later contexture version removed (for example, `identity`, retired when identity/memory moved to the harness)
- **THEN** `contexture doctor` fails, naming that key, rather than loading it silently and passing

#### Scenario: A config with only recognized top-level keys passes
- **WHEN** every top-level key in `contexture.yaml` is one `StoreConfigSchema` currently declares
- **THEN** this check passes
