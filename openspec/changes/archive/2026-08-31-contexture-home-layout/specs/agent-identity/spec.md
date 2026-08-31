## Purpose

Extends the agent-identity capability (see `bootstrap-contexture-core`): identity becomes reachable open-box through the canonical entry document, with adapters remaining the optimized delivery path.

## ADDED Requirements

### Requirement: The canonical entry document references identity
The generated portion of `AGENTS.md` SHALL include a section that names the store's identity files (at their configured location) and instructs an agent to load them at session start. The section SHALL reference the files by path, not inline their content, and SHALL be regenerated when the configured identity path changes.

#### Scenario: A harness with no adapter still discovers identity
- **WHEN** an agent harness with no identity-injection adapter reads only `AGENTS.md` at a store's root
- **THEN** it finds the identity files' paths and the instruction to load them at session start, without any harness-specific mechanism

#### Scenario: Identity content is not duplicated into the entry document
- **WHEN** the identity section of `AGENTS.md` is generated
- **THEN** it contains file references and the load instruction only — editing an identity file requires no regeneration of `AGENTS.md`
