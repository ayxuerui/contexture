## MODIFIED Requirements

### Requirement: Schema version is recorded and gated
`init` SHALL write a schema version into `contexture.yaml`. Every subsequent command SHALL read this version before operating, and SHALL refuse to operate — exiting non-zero and naming both the store's recorded version and the version the running release supports — whenever the two differ, in either direction, with exactly one exception: the store-update command SHALL open a store recorded at an older version when that version is at or above the release's migration floor, and SHALL bring it forward before doing anything else, as the schema-migration requirement describes. A store recorded at a newer version is refused by every command, the store-update command included, because the running release cannot know its shape. A store recorded at an older version is refused by every other command because the running release no longer reads that shape; when the store is at or above the migration floor, that refusal SHALL name the store-update command as the remedy, and when it is below the floor, the refusal SHALL state that this release cannot bring it forward.

#### Scenario: A newer store schema is refused by an older CLI
- **WHEN** a contexture CLI is run against a store whose recorded schema version is newer than the CLI's supported version — the store-update command included
- **THEN** the CLI exits non-zero, naming both versions, and performs no store operation

#### Scenario: An older store schema is refused by a newer CLI
- **WHEN** any command other than the store-update command is run against a store whose recorded schema version is older than the CLI's supported version
- **THEN** the CLI exits non-zero at configuration load, naming both versions — and naming the store-update command as the remedy when the store is at or above the migration floor — and performs no store operation, rather than loading the configuration onto superseded key spellings or reporting a shape-validation error against keys the release no longer declares

#### Scenario: A store with no recorded schema version is treated as unmigratable
- **WHEN** a command encounters a `contexture.yaml` with no schema version field at all, the store-update command included
- **THEN** the command exits non-zero, reporting that the store predates the schema-version requirement and is not supported by this release

### Requirement: A shipped default follows the release for a store that never overrode it
Where a store's configuration omits a key because it accepted the shipped default, a later release that changes that default SHALL take effect for the store on upgrade, with no edit to its configuration file. A value the store itself recorded SHALL never be changed by contexture. Two things write `contexture.yaml`: `ctxr init`, against a directory that does not yet hold one, and a schema migration run by the store-update command, which may move a recorded value only by renaming or restructuring the key that holds it, never by changing the value. Reconciling a store already at the supported schema version SHALL leave the file untouched.

#### Scenario: An accepted default follows the release
- **WHEN** a store's configuration omits a key and a later release changes that key's shipped default
- **THEN** the store resolves the new value on upgrade, with no edit to its configuration file

#### Scenario: A recorded choice is never moved silently
- **WHEN** a store's configuration declares a value that a later release's shipped default no longer matches
- **THEN** the store keeps its declared value, and no contexture command rewrites it — a schema migration included, which may move the key the value lives under but carries the value across unchanged

## REMOVED Requirements

### Requirement: contexture ships no migration mechanism
**Reason**: The premise no longer holds. The requirement assumed every store is brought forward by its operator by hand, on a machine where they control the CLI. A store operated from a container image that ships the CLI receives a newer release by image pull; from then on, every command is refused at configuration load, the store-update command included, and no ctxr-driven skill can run to repair it. The cost the removal was guarding against — a typed configuration schema that accepts superseded spellings so a migration can read them — is avoided by the replacement, which migrates the raw document before the typed schema reads it.
**Migration**: Replaced by "Schema migrations rewrite the raw configuration, through the store-update command only", below. A store already at the supported schema version is unaffected: the replacement's ladder starts empty at the current version and runs nothing against it.

## ADDED Requirements

### Requirement: Schema migrations rewrite the raw configuration, through the store-update command only
contexture SHALL ship an ordered set of schema migration steps, one for each schema version from its migration floor up to the version the release supports, each carrying a store's configuration from one version to the next. The steps SHALL operate on the configuration file's parsed document before it is validated against the typed configuration schema, so that the typed schema accepts exactly one spelling of every key and never a superseded one. The store-update command SHALL be the only command that runs them, and SHALL run every applicable step in version order, then write the result in place of `contexture.yaml` with its recorded schema version advanced, then continue with its reconcile. A step SHALL change only the keys it names and the schema version: every other key, value, comment and the order of keys SHALL be written back as it was read. If any step fails, or the migrated document fails validation against the typed schema, the command SHALL exit non-zero naming the step or the validation failure, and SHALL write no byte of the configuration file. A store recorded below the migration floor SHALL be refused by the store-update command, naming both versions and stating that this release cannot bring it forward.

That every version from the floor up to the supported version has a step, and that the typed schema declares no key spelling a step renames away, are enforced by tests in the project's test suite that fail when either is violated — not by a convention a release author is expected to follow.

#### Scenario: A store within the floor is brought forward by update
- **WHEN** the store-update command runs against a store whose recorded schema version is older than the supported version and at or above the migration floor
- **THEN** every step from the store's version to the supported version runs in order, `contexture.yaml` is written with the supported schema version, and the command goes on to reconcile the store's generated files

#### Scenario: A step leaves everything it does not name untouched
- **WHEN** a step that renames one key runs against a configuration carrying comments, other keys, and keys in an operator-chosen order
- **THEN** the written file differs from the original only in that key's name and the schema version, and every comment, every other key and value, and the key order are unchanged

#### Scenario: A failed migration writes nothing
- **WHEN** a migration step fails, or the migrated configuration does not validate against the typed schema
- **THEN** the command exits non-zero naming the step or the validation failure, and `contexture.yaml` is byte-for-byte what it was before the command ran

#### Scenario: A store below the floor is refused by update too
- **WHEN** the store-update command runs against a store whose recorded schema version is below the migration floor
- **THEN** it exits non-zero naming both versions and stating that this release cannot bring the store forward, and writes nothing

#### Scenario: No other command migrates
- **WHEN** any command other than the store-update command runs against a store recorded at an older schema version
- **THEN** it is refused as the schema-version gate describes, and the configuration file is not written

#### Scenario: A missing step fails the test suite
- **WHEN** a release raises the supported schema version without adding a step from the previous version
- **THEN** the project's test suite fails, naming the version that has no step

### Requirement: The store-update command can work in a worktree of its own
The store-update command SHALL accept an option directing it to work in a new git worktree it creates itself rather than in the checkout it was invoked from. With that option it SHALL resolve the store's configuration — migrated in memory first, when the store's recorded version requires it — and create a worktree checked out from a freshly fetched default branch, on a branch whose name is derived only from the store's configured session branch prefix and the running release's version, so that two runs of the same release name the same branch. It SHALL then migrate and reconcile inside that worktree, and SHALL report the worktree path, the branch, the files it changed and, when a migration ran, the schema versions it migrated between. It SHALL NOT write any file in the checkout it was invoked from, and SHALL NOT commit, push or open a pull request; what happens to the branch afterwards is the caller's decision. The option SHALL NOT require a session to have been started, since a store refused at configuration load cannot start one.

When the run changes nothing, the command SHALL remove the worktree and branch it created and report that the store is already up to date. When the branch it would create already exists, locally or on the fetched remote, the command SHALL create nothing, change nothing, and report the existing branch with the success code, so that a caller running it repeatedly — at every container start, for example — neither fails nor duplicates work.

#### Scenario: A due update lands on its own branch
- **WHEN** the store-update command runs with the worktree option against a store whose generated files differ from what the running release renders
- **THEN** it creates a worktree off the freshly fetched default branch, on a branch named from the configured branch prefix and the running release's version, reconciles there, reports the worktree path, the branch and the changed files, and exits with the success code — with no commit made

#### Scenario: The invoking checkout is never written
- **WHEN** the store-update command runs with the worktree option from the store's canonical clone
- **THEN** no file in the canonical clone changes, whether or not the run migrated or re-rendered anything

#### Scenario: A store refused at load is brought forward in the worktree
- **WHEN** the store-update command runs with the worktree option against a store whose recorded schema version is older than the supported version and at or above the migration floor
- **THEN** the worktree's `contexture.yaml` carries the supported schema version, its generated files are reconciled, the report names both schema versions, and the invoking checkout's configuration is unchanged

#### Scenario: Nothing due leaves nothing behind
- **WHEN** the store-update command runs with the worktree option against a store already at the supported schema version whose generated files already match the running release
- **THEN** it removes the worktree and branch it created, reports that the store is already up to date, and exits with the success code

#### Scenario: An existing branch makes the run a no-op
- **WHEN** the store-update command runs with the worktree option and the branch it would create already exists locally or on the fetched remote
- **THEN** it creates no worktree, writes nothing, reports the existing branch, and exits with the success code
