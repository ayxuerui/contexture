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

### Requirement: A shipped taxonomy profile may declare its own archive destination
A shipped taxonomy profile SHALL be able to declare the archive destination that suits its layers, and `init` SHALL seed `organize.archive_destination` from the resolved profile's declaration. A profile that declares none, and a custom taxonomy definition, SHALL fall back to the shipped default. The declaration SHALL live with the profile definitions, so no other component learns a shipped layer name.

#### Scenario: A profile with a retirement layer seeds its own destination
- **WHEN** a store is initialized with a profile whose layers include a retirement layer and which declares an archive destination
- **THEN** the store's `organize.archive_destination` is that destination, not the shipped fallback

#### Scenario: A profile without one falls back
- **WHEN** a store is initialized with a profile that declares no archive destination, or with a custom taxonomy definition
- **THEN** the store's `organize.archive_destination` is the shipped fallback
