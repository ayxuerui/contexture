# store-integrity Specification

## Purpose

Provides a single machine-readable system-health check that fails on real invariant violations — distinct from lint, which reports content-quality observations and never fails — so that automation can gate on store health without conflating "worth reviewing" with "broken."

## Requirements

### Requirement: `doctor` is machine-readable and fails on real invariants
`contexture doctor --json` SHALL enumerate every check it performs with a pass, fail, or skip result for each, and SHALL exit non-zero if any check's result is fail. Checks SHALL include, at minimum: derived-artifact staleness, catalog coverage (per context-catalog), dangling links and identity collisions (per context-retrieval), notes with no resolvable explicit or directory-derived visibility (per context-visibility), schema version currency (per store-lifecycle), adapter compatibility (per adapters), and git/hook health (per write-lifecycle).

#### Scenario: Every check reports a result
- **WHEN** `contexture doctor --json` runs
- **THEN** its output lists every check it performed, each with a pass, fail, or skip result, not merely an aggregate status

#### Scenario: A single failing check fails the whole run
- **WHEN** exactly one of doctor's checks fails and all others pass
- **THEN** `doctor` exits non-zero

### Requirement: Doctor is distinct from lint
`doctor` SHALL fail (non-zero exit) when it detects a violated invariant; `lint` (per context-organize) SHALL always exit 0. No single check SHALL be duplicated as both a lint finding and a doctor failure for the same underlying condition — each condition SHALL be classified once as either a health observation (lint) or an invariant (doctor).

#### Scenario: A doctor failure is never reclassified as a mere lint finding
- **WHEN** a condition doctor treats as a failing check (for example, catalog coverage) is evaluated
- **THEN** it does not also appear in lint's report, since a genuine invariant lives in exactly one of the two commands
