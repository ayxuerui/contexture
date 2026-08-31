## ADDED Requirements

### Requirement: The scope field's frontmatter key is configurable with a shipped default
The store's scope field key (the frontmatter key that names which bodies of knowledge a note belongs to) SHALL be read from `contexture.yaml` (`fields.scope`), with a shipped default value. No specification other than this one SHALL assert the literal key name; all other requirements SHALL refer to "the scope field."

#### Scenario: Default key in a freshly initialized store
- **WHEN** `ctxr init` runs with no `fields.scope` override
- **THEN** the generated `contexture.yaml` records the shipped default key, and every command that resolves scope reads that key from notes

#### Scenario: Renaming the scope field key
- **WHEN** an operator changes `fields.scope` in `contexture.yaml` and runs the corresponding migration
- **THEN** every note's frontmatter is rewritten to the new key and every command continues to resolve scope correctly, with no other configuration or code change required

### Requirement: The disclosure field's frontmatter key is configurable with a shipped default
The store's disclosure field key (the frontmatter key that names which audiences a note may be disclosed to) SHALL be read from `contexture.yaml` (`fields.disclosure`), with a shipped default value. No specification other than this one SHALL assert the literal key name; all other requirements SHALL refer to "the disclosure field."

#### Scenario: Default key in a freshly initialized store
- **WHEN** `ctxr init` runs with no `fields.disclosure` override
- **THEN** the generated `contexture.yaml` records the shipped default key, and `ctxr check` reads that key when evaluating the explicit-tag rung

#### Scenario: Renaming the disclosure field key
- **WHEN** an operator changes `fields.disclosure` in `contexture.yaml` and runs the corresponding migration
- **THEN** every note's frontmatter is rewritten to the new key and disclosure evaluation continues to consult the tag correctly, with no other configuration or code change required

### Requirement: A frontmatter key retired by a migration is not reused for a different meaning at the same schema version
When a migration renames a frontmatter key, no other field SHALL adopt the retired key at a schema version a store can still be running. A store recorded at a schema version older than the one that retired the key SHALL be refused by the schema-version gate before any command reads notes, so a retired key can never be read under its new meaning.

#### Scenario: A store predating the rename is refused before notes are read
- **WHEN** a command runs against a store whose recorded schema version predates a migration that retired a frontmatter key now reused for a different field
- **THEN** the command exits non-zero naming the version mismatch and performs no store operation, so no note is interpreted under the wrong meaning
