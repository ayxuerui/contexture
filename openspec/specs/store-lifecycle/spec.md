# store-lifecycle Specification

## Purpose

Governs how a store is first created and how it evolves across contexture releases, so that neither creating a store nor upgrading the tool against an existing store is a manual, undocumented, or unrepeatable process.

## Requirements

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

### Requirement: contexture ships multiple named taxonomy profiles, with PARA as the default
`contexture init` SHALL offer more than one named, built-in taxonomy profile for the operator to select from, each with a short description of the kind of context store it suits and a structural shape distinct from the others. This is the only place in this specification set where a shipped profile's layer names are asserted; every other requirement continues to treat the taxonomy as whatever `contexture.yaml` declares, per this capability's and the context-store capability's no-hardcoding requirements. When the operator selects no profile and supplies no custom taxonomy definition, `init` SHALL write the PARA profile.

Shipped profiles SHALL include, at minimum:
- **PARA** (default) — layers Projects, Areas, Resources, Archives; suited to a personal or team knowledge base organized around ongoing responsibilities and active work.
- **Zettelkasten** — no top-level layers; suited to a store whose structure should emerge entirely from links between notes rather than from folders.
- **Diátaxis** — layers Tutorials, How-to guides, Reference, Explanation; suited to a store whose content is documentation.

#### Scenario: A fresh store gets PARA out of the box with no interaction
- **WHEN** `contexture init` runs non-interactively with no profile selected and no custom taxonomy supplied
- **THEN** the generated `contexture.yaml` declares the PARA profile's layers, with no further configuration required

#### Scenario: An operator selects a different shipped profile
- **WHEN** `contexture init` is given an explicit selection of the Zettelkasten or Diátaxis profile
- **THEN** the generated `contexture.yaml` declares that profile's layers instead (none, in Zettelkasten's case), and none of PARA's layer names are written

#### Scenario: A custom taxonomy definition overrides every shipped profile
- **WHEN** `contexture init` runs with an alternate taxonomy definition supplied
- **THEN** the generated `contexture.yaml` declares that taxonomy instead, and no shipped profile's layer names are written

### Requirement: `init` helps the operator choose a taxonomy profile
When `contexture init` runs interactively (a terminal capable of prompting) with no profile or custom taxonomy already specified, it SHALL present the shipped profiles together with their descriptions and prompt the operator to choose one before writing `contexture.yaml`, rather than silently applying the default. When `init` runs non-interactively (no terminal to prompt) with no selection made, it SHALL apply the PARA default without prompting or blocking.

#### Scenario: Interactive init prompts before writing a default
- **WHEN** `contexture init` runs in an interactive terminal with no profile or custom taxonomy specified
- **THEN** it presents each shipped profile's name and description and waits for a selection before writing `contexture.yaml`

#### Scenario: Non-interactive init never blocks waiting for input
- **WHEN** `contexture init` runs with no terminal available to prompt (for example, in a script or CI job) and no profile or custom taxonomy specified
- **THEN** it writes the PARA default immediately, without prompting or blocking

### Requirement: `init` creates the capture tier and excludes it from retrieval
`ctxr init` SHALL create the configured inbox directory and SHALL seed the configured capture root into the store's retrieval exclusions, so a freshly initialized store has somewhere to capture into and captures are not retrievable from the first commit. Both values SHALL be read from configuration; no component may hardcode either directory name. An existing store SHALL reach the same state through a named migration rather than through operator action, and that migration SHALL adopt the shipped inbox default only where the store's value still sat at the previous shipped default, preserving an operator-chosen value verbatim.

#### Scenario: A fresh store can be captured into
- **WHEN** `ctxr init` completes in an empty directory
- **THEN** the configured inbox directory exists, and the configured capture root is present in the store's retrieval exclusions

#### Scenario: Re-running init changes nothing
- **WHEN** `ctxr init` is run again against a store whose inbox directory already exists and whose exclusions already name the capture root
- **THEN** it reports the store already initialized and writes no duplicate exclusion entry

#### Scenario: An operator-chosen inbox survives migration
- **WHEN** a store whose inbox path was set to something other than the previous shipped default is migrated
- **THEN** its inbox path is left exactly as the operator set it, and only the capture root and the retrieval exclusion are added

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
