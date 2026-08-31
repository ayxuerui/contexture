# adapters Specification

## Purpose

Defines one contract governing every extension point where contexture's core behavior is augmented by pluggable, optional code — harness-specific file generation, identity injection, and forge (PR-hosting) integration — so core never assumes any particular plugin is installed. A fourth kind, for ranked/semantic search, is deferred to v2 (see design.md) and is out of scope here.

## Requirements

### Requirement: One contract for every adapter kind
An adapter, regardless of kind (harness generation, identity injection, forge), SHALL be discoverable via a declared registration mechanism, SHALL declare which capability interface(s) it implements and at which version, and SHALL be independently addable, removable, and upgradable without modifying core contexture code.

#### Scenario: Two adapter kinds share the same discovery mechanism
- **WHEN** a harness-generation adapter and a forge adapter are both registered in `contexture.yaml`
- **THEN** both are discovered and validated using the same underlying discovery mechanism, not two separate ones

### Requirement: Core never depends on an adapter being present
Every core command SHALL define and document its behavior when no adapter of a relevant kind is configured, and that behavior SHALL be a documented degradation, not a crash or a silent no-op.

#### Scenario: No forge adapter configured
- **WHEN** no forge adapter is configured
- **THEN** `contexture session submit` completes the commit-and-push portion of its work and reports that the operator must open a pull request manually, rather than failing the entire submission

### Requirement: Incompatible adapter versions are refused, not silently run
If a registered adapter declares a capability-interface version that the installed contexture version does not support, the command that would invoke it SHALL exit non-zero naming the adapter and the version mismatch, rather than invoking the adapter and risking undefined behavior.

#### Scenario: Version mismatch is caught before invocation
- **WHEN** a registered adapter's declared interface version is not one the current contexture release supports
- **THEN** the relevant command refuses to invoke that adapter and reports the specific version mismatch

### Requirement: Forge adapters read state and merge
A forge adapter at interface version 2 SHALL provide, in addition to availability and pull-request opening: a state query for a branch or number returning the pull request's number, url, state (open, merged, or closed), mergeability (mergeable, conflicting, or unknown), and head branch; and a merge operation taking a number and a method. The built-in GitHub adapter SHALL implement both. `adapters.compatibility` SHALL report a configured forge adapter whose interface version is below 2.

#### Scenario: State query maps the forge's vocabulary
- **WHEN** the forge reports a pull request as open with unknown mergeability
- **THEN** the adapter returns state open and mergeability unknown, and `session land` re-queries before stopping

#### Scenario: A stale forge adapter is reported
- **WHEN** a configured forge adapter declares interface version 1
- **THEN** `doctor` reports an `adapters.compatibility` finding naming it before any session command relies on it
