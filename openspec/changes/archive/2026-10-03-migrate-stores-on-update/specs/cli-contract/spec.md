## MODIFIED Requirements

### Requirement: The CLI reports its own version and how it was installed
The CLI SHALL report the version of the running executable both as a dedicated command and as a version flag, and both SHALL emit the same version through the standard output envelope on stdout — not as diagnostic narration on stderr, so that a caller can read the version by capturing stdout alone. The report SHALL also name the filesystem location the running executable resolves to, and SHALL classify that location as a global installation, a linked working copy, or undetermined, so that a caller can tell whether a package-manager upgrade instruction applies before offering one. For a global installation, the report SHALL additionally state whether the user running the command can write to the location a package-manager upgrade would install into, so that a caller can tell an installation it may upgrade from one managed by whatever placed it there — a container image, a system package, an administrator. Reporting the version SHALL NOT require a store.

#### Scenario: The version is readable from stdout alone
- **WHEN** the version command is invoked, with and without `--json`
- **THEN** the version appears on stdout in both modes, stderr carries no part of the answer, and the exit code is the success code

#### Scenario: The flag and the command agree
- **WHEN** the CLI is invoked with the version flag, and separately with the version command
- **THEN** both report the same version, and neither exits with the usage code

#### Scenario: The version is reported outside a store
- **WHEN** the version command is invoked from a directory that resolves to no store root
- **THEN** it reports the version and exits with the success code, rather than failing for want of a store

#### Scenario: A linked working copy is distinguished from a global install
- **WHEN** the running executable resolves into a working copy rather than a global installation
- **THEN** the report classifies the install as a linked working copy, so a caller can decline to instruct a package-manager upgrade

#### Scenario: A global install the user cannot write is distinguished
- **WHEN** the running executable resolves into a global installation whose install location the running user cannot write to
- **THEN** the report classifies the install as global and states that it is not writable by the running user, and the exit code is the success code — so a caller can decline to instruct a package-manager upgrade that would fail
