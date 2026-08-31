## MODIFIED Requirements

### Requirement: Incompatible adapter versions are refused, not silently run
If a registered adapter declares a capability-interface version that the installed contexture version does not support, the command that would invoke it SHALL exit non-zero naming the adapter and the version mismatch, rather than invoking the adapter and risking undefined behavior. An adapter that is declared in configuration but resolves to nothing — no such adapter is registered, or the declared entry provides no implementation — SHALL be refused the same way, exiting non-zero and naming the declaration, rather than being treated as an absent adapter. Absence and breakage are distinct: an adapter kind that is simply not configured degrades as its own requirement specifies, while a declared adapter that cannot be resolved is an error.

#### Scenario: Version mismatch is caught before invocation
- **WHEN** a registered adapter's declared interface version is not one the current contexture release supports
- **THEN** the relevant command refuses to invoke that adapter and reports the specific version mismatch

#### Scenario: A declaration resolving to nothing is an error, not an absence
- **WHEN** `contexture.yaml` declares an adapter that resolves to no registered implementation
- **THEN** the command that would invoke it exits non-zero naming the declaration, rather than proceeding along the documented no-adapter degradation path

#### Scenario: An unconfigured kind still degrades
- **WHEN** no adapter of a given kind is declared at all
- **THEN** the relevant command follows that kind's documented degradation and does not fail
