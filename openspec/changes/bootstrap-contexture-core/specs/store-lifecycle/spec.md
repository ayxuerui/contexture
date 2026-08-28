## Purpose

Governs how a store is first created and how it evolves across contexture releases, so that neither creating a store nor upgrading the tool against an existing store is a manual, undocumented, or unrepeatable process.

## ADDED Requirements

### Requirement: `init` is idempotent
Running `contexture init` against a directory that is already an initialized store SHALL NOT overwrite existing configuration or content, and SHALL exit 0, reporting that the store is already initialized.

#### Scenario: Re-running init on an existing store is a no-op
- **WHEN** `contexture init` is run a second time against an already-initialized store with no flags requesting reinitialization
- **THEN** no existing file is modified, and the command exits 0

### Requirement: Schema version is recorded and gated
`init` SHALL write a schema version into `contexture.yaml`. Every subsequent command SHALL read this version before operating, and SHALL refuse to operate — exiting non-zero and naming the version mismatch — if the store's recorded schema version is newer than the version the running contexture release supports.

#### Scenario: A newer store schema is refused by an older CLI
- **WHEN** a contexture CLI is run against a store whose recorded schema version is newer than the CLI's supported version
- **THEN** the CLI exits non-zero, naming both versions, and performs no store operation

#### Scenario: A store with no recorded schema version is treated as unmigratable
- **WHEN** a command encounters a `contexture.yaml` with no schema version field at all
- **THEN** the command exits non-zero, reporting that the store predates the schema-version requirement and must be migrated with an explicit tool

### Requirement: Migrations are named, dry-runnable, and resumable
A change to the store's schema that existing stores must adopt SHALL ship as a named migration. `contexture migrate --dry-run` SHALL report the exact changes a migration would make without applying them. A migration that is interrupted partway SHALL be resumable without requiring a full restart or leaving the store in an inconsistent, undocumented intermediate state.

#### Scenario: Dry run reports exact deltas
- **WHEN** `contexture migrate --dry-run` is run against a store pinned at a schema version older than the CLI's current version
- **THEN** the output enumerates the specific changes (files touched, fields renamed or added) the migration would make, with no changes actually applied

#### Scenario: An interrupted migration can be resumed
- **WHEN** a migration is interrupted after partially completing
- **THEN** re-running `contexture migrate` on the same store continues from where it left off rather than failing or redoing already-applied changes

### Requirement: No component hardcodes a taxonomy or field name
No contexture command or library function SHALL contain a hardcoded taxonomy layer name or frontmatter field name; every such name SHALL be read from `contexture.yaml` at runtime, so that a taxonomy or field-name change is a configuration and migration matter, never a code change.

#### Scenario: A renamed taxonomy layer requires no code change
- **WHEN** an operator renames a taxonomy layer in `contexture.yaml` and runs the corresponding migration
- **THEN** every command that references that layer continues to function correctly using the new name, with no contexture code modified
