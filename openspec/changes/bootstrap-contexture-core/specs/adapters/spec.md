## Purpose

Defines one contract governing every extension point where contexture's core behavior is augmented by pluggable, optional code — search ranking, harness-specific file generation, identity injection, and forge (PR-hosting) integration — so core never assumes any particular plugin is installed.

## ADDED Requirements

### Requirement: One contract for every adapter kind
An adapter, regardless of kind (search, harness generation, identity injection, forge), SHALL be discoverable via a declared registration mechanism, SHALL declare which capability interface(s) it implements and at which version, and SHALL be independently addable, removable, and upgradable without modifying core contexture code.

#### Scenario: Two adapter kinds share the same discovery mechanism
- **WHEN** a search adapter and a forge adapter are both registered in `contexture.yaml`
- **THEN** both are discovered and validated using the same underlying discovery mechanism, not two separate ones

### Requirement: Core never depends on an adapter being present
Every core command SHALL define and document its behavior when no adapter of a relevant kind is configured, and that behavior SHALL be a documented degradation, not a crash or a silent no-op.

#### Scenario: No search adapter configured
- **WHEN** no search adapter is configured
- **THEN** `contexture search` uses the built-in content-matching leg and functions correctly; it does not fail merely because no ranked-search adapter is present

#### Scenario: No forge adapter configured
- **WHEN** no forge adapter is configured
- **THEN** `contexture session submit` completes the commit-and-push portion of its work and reports that the operator must open a pull request manually, rather than failing the entire submission

### Requirement: Incompatible adapter versions are refused, not silently run
If a registered adapter declares a capability-interface version that the installed contexture version does not support, the command that would invoke it SHALL exit non-zero naming the adapter and the version mismatch, rather than invoking the adapter and risking undefined behavior.

#### Scenario: Version mismatch is caught before invocation
- **WHEN** a registered adapter's declared interface version is not one the current contexture release supports
- **THEN** the relevant command refuses to invoke that adapter and reports the specific version mismatch
