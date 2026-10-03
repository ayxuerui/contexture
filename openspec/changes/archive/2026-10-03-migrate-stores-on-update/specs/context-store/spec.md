## MODIFIED Requirements

### Requirement: A written configuration records only the store's own decisions
When contexture writes `contexture.yaml` it SHALL omit any key whose value equals that key's shipped default, and SHALL write every key whose value differs or that carries no default. A reader SHALL therefore be able to take the file's contents as the set of choices the store has made. There are two writers. `ctxr init`, against a directory that does not yet hold a configuration, writes the file whole. A schema migration, run only by the store-update command against a store recorded at an older schema version, rewrites only the keys its steps name and the schema version, and adds no key whose value equals a shipped default. No other command rewrites the file, so a store's declared values cannot drift between releases.

#### Scenario: A generated config omits what it agrees with
- **WHEN** `ctxr init` completes with every convention accepted
- **THEN** the written `contexture.yaml` names the store's taxonomy, its default branch and its other required facts, and does not restate a single value equal to a shipped default

#### Scenario: A deviation stays visible
- **WHEN** a store configures a value that differs from the shipped default
- **THEN** that key is written out, unchanged, because it is a decision rather than an echo — a schema migration that renames the key carries the value across unchanged

#### Scenario: Reconciling an existing store writes no configuration
- **WHEN** a command that brings a store's generated files up to date runs against an already-initialized store recorded at the supported schema version
- **THEN** `contexture.yaml` is not written, and every key the store declared resolves to exactly what it resolved to before

#### Scenario: A migration writes nothing it was not asked to
- **WHEN** the store-update command migrates a store whose configuration omits a key because it accepted the shipped default
- **THEN** the written configuration still omits that key, and differs from the original only in the keys the applied steps name and the schema version
