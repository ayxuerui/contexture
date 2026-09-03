## ADDED Requirements

### Requirement: A change to a shipped default reaches a store that never overrode it
Where a store's configuration omits a key because it accepted the shipped default, a later release that changes that default SHALL take effect for the store on upgrade, without a migration. A migration SHALL be required only to move a value the store itself recorded. Existing stores SHALL be brought to this shape by a named migration that removes keys whose value already equals the shipped default, changing what no key resolves to.

#### Scenario: An accepted default follows the release
- **WHEN** a store's configuration omits a key and a later release changes that key's shipped default
- **THEN** the store resolves the new value on upgrade, with no migration run and no edit to its configuration file

#### Scenario: A recorded choice is never moved silently
- **WHEN** a store's configuration declares a value that a later release's shipped default no longer matches
- **THEN** the store keeps its declared value, and only a migration that names the change may alter it

#### Scenario: Pruning changes no resolved value
- **WHEN** the migration removes a key whose value equalled the shipped default
- **THEN** every command resolves that key to the same value it resolved to before the migration ran
