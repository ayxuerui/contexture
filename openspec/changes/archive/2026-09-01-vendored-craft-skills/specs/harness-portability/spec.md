## ADDED Requirements

### Requirement: Vendored third-party skills are delivered and refreshed like owned ones
contexture SHALL ship a set of third-party skills inside its published package and, at `ctxr init` and `ctxr update`, SHALL write each one a store declares into the store's skills directories. A vendored skill's own files SHALL be written byte-identical to the packaged copy — contexture SHALL NOT insert its managed-owner header, or any other contexture-authored content, into a file it did not author. Each vendored skill SHALL be accompanied by its upstream license file. This requirement is the only place the shipped vendored set is enumerated; no other requirement may name a vendored skill.

The shipped set SHALL be, at minimum, one skill covering visual design direction for generated interfaces: `frontend-design`, redistributed from its upstream under Apache-2.0.

#### Scenario: Init delivers the vendored set
- **WHEN** `ctxr init` completes on a store whose configuration lists a vendored skill
- **THEN** that skill's directory exists under the store's skills directory, containing its `SKILL.md` byte-identical to the packaged copy and its upstream license file

#### Scenario: The managed-owner header is never inserted into vendored content
- **WHEN** a vendored skill is written into a store
- **THEN** its `SKILL.md` contains no contexture-authored header and its first line is the start of the file's own frontmatter block

### Requirement: A vendored skill carries a provenance record that identifies it
Each vendored skill directory SHALL contain a machine-readable provenance record written by contexture, recording at minimum the upstream source, the pinned upstream revision, the license identifier, and a content hash of the delivered skill file. Contexture SHALL treat a skill directory as vendored — and therefore as one it manages — if and only if that record is present, so that a directory without one is operator-authored and never touched.

#### Scenario: The provenance record accompanies the skill
- **WHEN** a vendored skill is written into a store
- **THEN** its directory contains a provenance record naming the upstream source, the pinned revision, the license, and a content hash

#### Scenario: A directory with no provenance record is left alone
- **WHEN** `ctxr update` runs against a store containing an operator-authored skill directory that carries neither the managed-owner header nor a provenance record
- **THEN** that directory is not rewritten, not removed, and not reported as drifted

### Requirement: A locally modified vendored skill is preserved and reported, never overwritten
When the delivered file of a vendored skill no longer matches the content hash in its provenance record, `ctxr update` SHALL leave every file in that directory unchanged and SHALL report the divergence naming the skill. When the hash still matches and the packaged copy differs, update SHALL rewrite the skill to the packaged copy. When the hash matches and the packaged copy is identical, update SHALL write nothing.

#### Scenario: An operator's edit survives an update
- **WHEN** an operator edits a vendored skill's `SKILL.md` and `ctxr update` runs
- **THEN** the edited file is byte-identical afterwards and the command's output names that skill as locally modified

#### Scenario: An unmodified vendored skill is refreshed to the packaged version
- **WHEN** a store's vendored skill still matches its recorded hash and the installed contexture package carries a different version of it
- **THEN** `ctxr update` rewrites it to the packaged version and updates the provenance record

#### Scenario: A current vendored skill makes update a no-op
- **WHEN** `ctxr update` runs twice against a store whose vendored skills are current
- **THEN** the second run writes no bytes and reports nothing changed for them

### Requirement: A store declares which vendored skills it wants
Configuration SHALL carry a list of the vendored skills a store wants installed, defaulting to the shipped set when the key is absent so that a store predating this configuration parses and behaves as if it declared the default. An empty list SHALL mean "install none", and SHALL cause `ctxr update` to remove any vendored skill directory it previously wrote whose delivered file still matches its recorded hash.

#### Scenario: A store predating the configuration key gets the default
- **WHEN** a `contexture.yaml` written before this key existed is read
- **THEN** it resolves to the shipped vendored set, with no migration required

#### Scenario: An empty list opts out and removes what contexture installed
- **WHEN** a store's configuration declares an empty vendored list and `ctxr update` runs
- **THEN** every unmodified vendored skill directory contexture previously wrote is removed

#### Scenario: Opting out never deletes a locally modified skill
- **WHEN** a store opts out while one vendored skill has been locally modified
- **THEN** that directory is left on disk and reported, rather than removed

### Requirement: Skills are written once, to the configured canonical directory
Contexture SHALL write every owned and vendored skill exactly once, into the store's configured skills path, which SHALL default for a newly initialized store to the ecosystem's cross-harness canonical location. The generated entry document SHALL index that path. A store that configures a different skills path SHALL have its skills written there instead, with no other behavior change.

#### Scenario: A new store gets the canonical location by default
- **WHEN** `ctxr init` runs with no skills-path override
- **THEN** the generated configuration names the cross-harness canonical skills location, and every owned and vendored skill is written there

#### Scenario: A store predating this default keeps its own path
- **WHEN** a store whose configuration already names a different skills path runs `ctxr update`
- **THEN** skills continue to be written to that configured path, with no relocation and no migration

### Requirement: A declared harness that reads elsewhere is bridged to the canonical directory
For each harness the operator declares whose adapter declares a skills directory different from the configured skills path, contexture SHALL make that directory resolve to the canonical one — preferring a directory symlink, and falling back to copying every skill into it when a symlink cannot be created. Contexture SHALL report which mechanism it used for each bridged harness. Bridging SHALL be idempotent: a directory that already resolves to the canonical location, whether directly or through a symlinked parent, SHALL be left unchanged.

#### Scenario: A branded harness directory is symlinked to the canonical one
- **WHEN** a store declares a harness whose adapter names a skills directory other than the configured skills path, on a platform where symlinks can be created
- **THEN** that directory is a symlink resolving to the configured skills path, no skill files are duplicated, and the command reports the harness as bridged by symlink

#### Scenario: Copying is used where a symlink cannot be created
- **WHEN** the same store is initialized where the platform or filesystem refuses symlink creation
- **THEN** every skill is copied into the harness's directory instead, the store is fully usable from that harness, and the command reports the harness as bridged by copy

#### Scenario: Bridging twice changes nothing
- **WHEN** `ctxr update` runs against a store whose declared harness directory already resolves to the canonical location
- **THEN** no bytes are written for that harness and nothing is reported as changed

#### Scenario: An undeclared harness is never bridged
- **WHEN** a harness is installed on the machine but not declared in the store's configuration
- **THEN** contexture creates no directory for it and does not inspect the machine to discover it

### Requirement: The operator declares which harnesses a store targets, at setup
`ctxr init` SHALL accept a non-interactive option naming the harnesses to configure, and SHALL prompt for them when run interactively without one, recording the selection in the store's configuration as declared adapters. Selecting none SHALL be permitted and SHALL leave the store with the canonical skills directory and no bridged harness. Contexture SHALL NOT infer the selection from what is installed on the machine.

#### Scenario: Harnesses are named non-interactively
- **WHEN** `ctxr init` runs with the harness option naming two harnesses
- **THEN** both are recorded as declared adapters in the generated configuration and both are bridged, with no prompt shown

#### Scenario: An interactive run prompts before writing
- **WHEN** `ctxr init` runs in an interactive terminal with no harness option
- **THEN** it presents the selectable harnesses and records the operator's choice before writing the configuration

#### Scenario: Selecting no harness is valid
- **WHEN** `ctxr init` runs selecting no harness
- **THEN** skills are written to the canonical skills directory, no harness directory is created, and the command exits successfully

### Requirement: A broken bridge is detected and repaired
When a declared harness's skills directory exists but neither resolves to the canonical directory nor contains the current skills — including the case where a checkout has materialized a symlink as a regular file — `ctxr doctor` SHALL report it as a broken bridge naming the harness, and `ctxr update` SHALL repair it by re-establishing the bridge, preferring a symlink and falling back to copying.

#### Scenario: A symlink materialized as a text file is reported and repaired
- **WHEN** a store is checked out where symlinks cannot be represented, leaving a declared harness's skills directory as a regular file containing a path
- **THEN** `ctxr doctor` reports a broken bridge naming that harness, and `ctxr update` replaces it with a working bridge

#### Scenario: A bridge pointing at the wrong location is repaired
- **WHEN** a declared harness's skills directory is a symlink resolving somewhere other than the configured skills path
- **THEN** `ctxr update` re-points it at the configured skills path and reports the repair
