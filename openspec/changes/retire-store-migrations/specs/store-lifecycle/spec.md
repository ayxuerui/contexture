## MODIFIED Requirements

### Requirement: Schema version is recorded and gated
`init` SHALL write a schema version into `contexture.yaml`. Every subsequent command SHALL read this version before operating, and SHALL refuse to operate — exiting non-zero and naming both the store's recorded version and the version the running release supports — whenever the two differ, in either direction. A store recorded at a newer version is refused because the running release cannot know its shape; a store recorded at an older version is refused because the running release no longer reads that shape and offers nothing that would bring it forward.

#### Scenario: A newer store schema is refused by an older CLI
- **WHEN** a contexture CLI is run against a store whose recorded schema version is newer than the CLI's supported version
- **THEN** the CLI exits non-zero, naming both versions, and performs no store operation

#### Scenario: An older store schema is refused by a newer CLI
- **WHEN** a contexture CLI is run against a store whose recorded schema version is older than the CLI's supported version
- **THEN** the CLI exits non-zero at configuration load, naming both versions, and performs no store operation — rather than loading the configuration onto superseded key spellings or reporting a shape-validation error against keys the release no longer declares

#### Scenario: A store with no recorded schema version is treated as unmigratable
- **WHEN** a command encounters a `contexture.yaml` with no schema version field at all
- **THEN** the command exits non-zero, reporting that the store predates the schema-version requirement and is not supported by this release

### Requirement: No component hardcodes a taxonomy or field name
No contexture command or library function SHALL contain a hardcoded taxonomy layer name or frontmatter field name; every such name SHALL be read from `contexture.yaml` at runtime, so that a taxonomy or field-name change is a configuration matter, never a code change.

#### Scenario: A renamed taxonomy layer requires no code change
- **WHEN** an operator renames a taxonomy layer in `contexture.yaml`
- **THEN** every command that references that layer continues to function correctly using the new name, with no contexture code modified

## ADDED Requirements

### Requirement: contexture ships no migration mechanism
contexture SHALL provide no command, and no configuration rewrite, that carries a store from one recorded schema version to another. A release that changes the store's shape SHALL bump the schema version it supports and SHALL document the one-time fixup in its release notes; bringing a store forward is the operator's action, and the schema-version gate is what makes an unmigrated store fail rather than half-work.

#### Scenario: No command claims to migrate a store
- **WHEN** the CLI's command surface is enumerated
- **THEN** no command applies a schema migration or rewrites `contexture.yaml` to a different schema version

#### Scenario: A store behind the supported version is refused, not rewritten
- **WHEN** a command runs against a store whose recorded schema version is older than the running release supports
- **THEN** the command exits non-zero and no byte of the store's configuration is written

### Requirement: `init` seeds the capture tier and its retrieval exclusion
`ctxr init` SHALL create the configured inbox directory and SHALL seed the configured capture root into the store's retrieval exclusions, so a freshly initialized store has somewhere to capture into and captures are not retrievable from the first commit. Both values SHALL be read from configuration; no component may hardcode either directory name.

#### Scenario: A fresh store can be captured into
- **WHEN** `ctxr init` completes in an empty directory
- **THEN** the configured inbox directory exists, and the configured capture root is present in the store's retrieval exclusions

#### Scenario: Re-running init changes nothing
- **WHEN** `ctxr init` is run again against a store whose inbox directory already exists and whose exclusions already name the capture root
- **THEN** it reports the store already initialized and writes no duplicate exclusion entry

### Requirement: A shipped default follows the release for a store that never overrode it
Where a store's configuration omits a key because it accepted the shipped default, a later release that changes that default SHALL take effect for the store on upgrade, with no edit to its configuration file. A value the store itself recorded SHALL never be changed by contexture: the only command that writes `contexture.yaml` is `ctxr init` against a directory that does not yet hold one, and reconciling an existing store SHALL leave the file untouched.

#### Scenario: An accepted default follows the release
- **WHEN** a store's configuration omits a key and a later release changes that key's shipped default
- **THEN** the store resolves the new value on upgrade, with no edit to its configuration file

#### Scenario: A recorded choice is never moved silently
- **WHEN** a store's configuration declares a value that a later release's shipped default no longer matches
- **THEN** the store keeps its declared value, and no contexture command rewrites it

## REMOVED Requirements

### Requirement: Migrations are named, dry-runnable, and resumable
**Reason**: contexture ships no migration mechanism. Every shipped migration and the command that ran them are removed; the schema-version gate refuses a store whose recorded version differs from the running release's, in either direction, so an unmigrated store fails loudly instead of being carried forward automatically.
**Migration**: None available or required. No store has ever been carried by this mechanism; a store recorded below the supported schema version must be brought forward by the operator following the fixup its release notes document, or reinitialized.

### Requirement: `init` creates the capture tier and excludes it from retrieval
**Reason**: The requirement's init behavior is unchanged and is restated by "`init` seeds the capture tier and its retrieval exclusion". Only its migration clause — that an existing store reaches the same state through a named migration preserving an operator-chosen inbox — is retired, along with the scenario that tested it.
**Migration**: None required for a store at the supported schema version; its capture tier is already seeded. A store below that version is refused at configuration load, as with any other shape change.

### Requirement: A change to a shipped default reaches a store that never overrode it
**Reason**: The default-propagation behavior is unchanged and is restated by "A shipped default follows the release for a store that never overrode it". Only the sentence requiring existing stores to be brought to that shape by a key-pruning migration, and the scenario that tested the pruning, are retired.
**Migration**: None required. Both propagation and the guarantee that a recorded value is never moved now rest on `ctxr init` being the sole writer of `contexture.yaml`, which needs no migration to hold.
