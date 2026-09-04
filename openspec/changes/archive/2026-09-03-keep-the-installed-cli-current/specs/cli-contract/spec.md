## ADDED Requirements

### Requirement: The CLI reports its own version and how it was installed
The CLI SHALL report the version of the running executable both as a dedicated command and as a version flag, and both SHALL emit the same version through the standard output envelope on stdout — not as diagnostic narration on stderr, so that a caller can read the version by capturing stdout alone. The report SHALL also name the filesystem location the running executable resolves to, and SHALL classify that location as a global installation, a linked working copy, or undetermined, so that a caller can tell whether a package-manager upgrade instruction applies before offering one. Reporting the version SHALL NOT require a store.

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

### Requirement: An advisory about a newer release never changes the outcome of the command carrying it
The session-start command and the store-update command SHALL consult the release registry and, when a newer release than the installed one is published, SHALL report it as an informational finding in the envelope and as a human notice on stderr. The advisory SHALL NOT alter the command's exit code, its status, its data, or its stdout, and SHALL NOT prevent the command from completing its own work. When the check cannot be completed — the registry is unreachable, times out, answers with an error, answers unparseably, or the cache cannot be read or written — the command SHALL record a distinct informational finding stating that the check could not be completed, and SHALL otherwise behave exactly as if no check had been attempted. This path fails open, to completing the command with no advisory; a release check is never a reason for a session to fail.

#### Scenario: A stale CLI still starts a session successfully
- **WHEN** a session is started while a newer release is published
- **THEN** the session worktree is created, the command exits with the success code with an `ok` status, and the newer release is reported as an informational finding alongside a notice on stderr

#### Scenario: An unreachable registry does not fail the command
- **WHEN** a session is started, or the store is updated, and the registry cannot be reached, times out, returns an error, or returns an unparseable answer
- **THEN** the command completes its own work and exits with the success code, carrying an informational finding that the check could not be completed, and no advisory claiming either that a release is or is not available

#### Scenario: The advisory does not disturb machine-readable output
- **WHEN** a command carrying the advisory is invoked with `--json` while a newer release is published
- **THEN** stdout parses as exactly one JSON value, the advisory appears only in its findings, and the human notice appears on stderr

#### Scenario: The advisory is suppressible
- **WHEN** `update_check.enabled` is configured false, or the environment variable that suppresses the check is set for the invocation
- **THEN** no registry request is made, no advisory or check-failed finding is reported, and the command behaves exactly as it did before the advisory existed

### Requirement: An explicit release check reports its answer through the exit code
A dedicated check option on the version command SHALL resolve the latest published release and compare it against the installed one, distinguishing three outcomes by exit code: the success code when the installed version is current or ahead, the failed-check code when a newer release is published, and the usage code when the answer could not be determined. The undeterminable outcome SHALL name what could not be determined and SHALL NOT be reported as either "current" or "outdated". A version string the CLI cannot recognize SHALL be treated as undeterminable rather than compared by guesswork. Unlike the advisory, this check is the command's whole purpose, so it consults the registry directly rather than any cached answer.

#### Scenario: The three outcomes are distinguishable
- **WHEN** the explicit check runs against a registry reporting, in turn, the installed version, a newer version, and no usable answer
- **THEN** the three invocations exit with the success code, the failed-check code, and the usage code respectively, and each names its outcome

#### Scenario: An unrecognized version is undeterminable, never a guess
- **WHEN** either the installed or the published version is not a version string the CLI recognizes
- **THEN** the check exits with the usage code naming the version it could not interpret, and reports no comparison

### Requirement: The commit path and the offline path never consult the registry
Commands that run inside an installed git hook, and commands that guarantee offline behavior, SHALL NOT consult the release registry. Specifically, the store-check command and the store-initialization command SHALL make no network request on account of a release check, so that a commit never depends on registry availability and initializing a store stays deterministic and offline. No command SHALL consult the registry more than once per invocation.

#### Scenario: Checking a store makes no release request
- **WHEN** the store-check command runs, in either scope, while a newer release is published
- **THEN** it makes no request to the release registry, reports no advisory, and its exit code depends only on the checks it ran

#### Scenario: Initializing a store stays offline
- **WHEN** a store is initialized on a machine with no network access
- **THEN** initialization succeeds unchanged, with no release request attempted and no check-failed finding reported
