## Purpose

Extends the adapters capability (see `bootstrap-contexture-core`): the forge adapter kind reads pull-request state and merges, at interface version 2.

## ADDED Requirements

### Requirement: Forge adapters read state and merge
A forge adapter at interface version 2 SHALL provide, in addition to availability and pull-request opening: a state query for a branch or number returning the pull request's number, url, state (open, merged, or closed), mergeability (mergeable, conflicting, or unknown), and head branch; and a merge operation taking a number and a method. The built-in GitHub adapter SHALL implement both. `adapters.compatibility` SHALL report a configured forge adapter whose interface version is below 2.

#### Scenario: State query maps the forge's vocabulary
- **WHEN** the forge reports a pull request as open with unknown mergeability
- **THEN** the adapter returns state open and mergeability unknown, and `session land` re-queries before stopping

#### Scenario: A stale forge adapter is reported
- **WHEN** a configured forge adapter declares interface version 1
- **THEN** `doctor` reports an `adapters.compatibility` finding naming it before any session command relies on it
