## ADDED Requirements

### Requirement: An omitted configuration key resolves to its shipped default
Where contexture ships a default for a configuration key, that default SHALL be declared on the configuration schema, so a `contexture.yaml` that omits the key parses successfully and every component reads the shipped value. A key SHALL NOT be both required by the schema and backed by a shipped default the schema does not apply, and a component SHALL NOT substitute its own fallback at the point of reading a key the schema could have defaulted — one key, one declared default, in one place.

#### Scenario: A config omitting a convention key still loads
- **WHEN** a `contexture.yaml` declares no inbox path
- **THEN** it loads successfully and every component reads the shipped inbox path, exactly as if the file had named it

#### Scenario: A declared value always wins
- **WHEN** a `contexture.yaml` declares a value for a key that also has a shipped default
- **THEN** the declared value is what every component reads, and no operation rewrites it toward the default

### Requirement: Configuration keys that cannot carry a shipped default do not get one
A key whose correct value is a fact about the individual store, or is derived from another configured key, SHALL remain required rather than carry a shipped default. This covers the branch a store's repository actually uses, the taxonomy it selected, and any value resolved through the taxonomy — a constant default for these would be a guess presented as a convention, and for a taxonomy-derived value it would silently contradict the store's own declared layers.

A key whose absence is itself meaningful — where not declaring it means the store has not opted into a mechanism, rather than that the store accepts a default — SHALL likewise carry no schema default, and SHALL remain optional rather than becoming required. Defaulting such a key would enable a mechanism for every store that predates it.

#### Scenario: The default branch is not guessed
- **WHEN** a store's configuration is loaded
- **THEN** the repository's default branch is read from the configuration, never defaulted to a shipped branch name

#### Scenario: A taxonomy-derived destination is not flattened to a constant
- **WHEN** a store's taxonomy declares a retirement layer and its configuration omits the archive destination
- **THEN** loading reports the missing key rather than resolving it to the taxonomy-agnostic fallback, which would send archived notes somewhere the store's own taxonomy contradicts

#### Scenario: An opt-in mechanism stays off when its key is absent
- **WHEN** a store's configuration declares no path for an opt-in mechanism
- **THEN** that mechanism stays off, and no shipped constant is substituted to switch it on

### Requirement: A written configuration records decisions, not resolved values
When contexture writes `contexture.yaml` — at init, and on every migration write-back — it SHALL omit any key whose value equals that key's shipped default, and SHALL write every key whose value differs or that carries no default. A reader SHALL therefore be able to take the file's contents as the set of choices the store has made.

#### Scenario: A generated config omits what it agrees with
- **WHEN** `ctxr init` completes with every convention accepted
- **THEN** the written `contexture.yaml` names the store's taxonomy, its default branch and its other required facts, and does not restate a single value equal to a shipped default

#### Scenario: A migration's write-back does not re-materialize defaults
- **WHEN** any migration rewrites `contexture.yaml`
- **THEN** the rewritten file still omits every value equal to a shipped default, so the omission survives future migrations rather than being undone by the next one

#### Scenario: A deviation stays visible
- **WHEN** a store configures a value that differs from the shipped default and a later write-back occurs
- **THEN** that key is written out, unchanged, because it is a decision rather than an echo

## MODIFIED Requirements

### Requirement: `contexture.yaml` is the single source of truth for store configuration
The store SHALL carry exactly one configuration file, `contexture.yaml`, at its root, and every contexture component SHALL read taxonomy (the set of top-level layers and their declared defaults), frontmatter field keys, and retrieval exclusion paths from this file rather than from a hardcoded value. A key the file omits SHALL resolve to its shipped default where one exists, which is a declaration in one place rather than a value hardcoded at a point of use; the file remains the only place a store states what it has chosen.

#### Scenario: Taxonomy is configured, not hardcoded
- **WHEN** `contexture.yaml` declares a set of top-level layers different from the shipped default profile
- **THEN** every command that enumerates or validates layers (placement, lint, doctor) operates against the configured set with no reference to the shipped default's layer names

#### Scenario: Exclusion paths come from config
- **WHEN** `contexture.yaml` lists a path prefix under retrieval exclusions
- **THEN** every retrieval leg (catalog, graph, content matching) treats notes under that prefix as non-retrievable, and no component maintains a second, independent exclusion list

#### Scenario: Omission is not a second source of truth
- **WHEN** a component needs a configuration value the file does not declare
- **THEN** it reads the resolved configuration, whose default was declared once on the schema, and does not consult a fallback of its own
