## ADDED Requirements

### Requirement: A written configuration records only the store's own decisions
When contexture writes `contexture.yaml` it SHALL omit any key whose value equals that key's shipped default, and SHALL write every key whose value differs or that carries no default. A reader SHALL therefore be able to take the file's contents as the set of choices the store has made. `ctxr init`, against a directory that does not yet hold a configuration, is the only writer: no other command rewrites the file, so a store's declared values cannot drift between releases.

#### Scenario: A generated config omits what it agrees with
- **WHEN** `ctxr init` completes with every convention accepted
- **THEN** the written `contexture.yaml` names the store's taxonomy, its default branch and its other required facts, and does not restate a single value equal to a shipped default

#### Scenario: A deviation stays visible
- **WHEN** a store configures a value that differs from the shipped default
- **THEN** that key is written out, unchanged, because it is a decision rather than an echo

#### Scenario: Reconciling an existing store writes no configuration
- **WHEN** a command that brings a store's generated files up to date runs against an already-initialized store
- **THEN** `contexture.yaml` is not written, and every key the store declared resolves to exactly what it resolved to before

## REMOVED Requirements

### Requirement: A written configuration records decisions, not resolved values
**Reason**: The omit-what-equals-the-default behavior is unchanged and is restated by "A written configuration records only the store's own decisions". What is retired is the requirement's premise that migration write-back is a second writer of `contexture.yaml` — with no migration mechanism, `ctxr init` is the only one — and the scenario asserting that a migration's write-back does not re-materialize defaults.
**Migration**: None required. A configuration already written under the previous requirement satisfies the replacement unchanged; the guarantee narrows to a single writer rather than changing what gets written.
