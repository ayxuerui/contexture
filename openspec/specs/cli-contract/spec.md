# cli-contract Specification

## Purpose

Establishes the cross-cutting behavioral contract — exit codes, structured output, and failure reporting — that every contexture command shares, so scripts, agents, and hooks can rely on consistent behavior regardless of which command they invoke.

## Requirements

### Requirement: Exit code taxonomy
Every contexture command SHALL use a documented, consistent exit code taxonomy: `0` for success; a code reserved for setup/usage errors (invalid arguments, no store root found); a distinct code reserved for a failed check or validation (the command ran correctly and determined a real problem exists). No command SHALL reuse `0` to mean "ran, but found a problem."

#### Scenario: A usage error and a failed check are distinguishable
- **WHEN** a command is invoked with a malformed argument, and separately, a command runs correctly but a check it performs fails
- **THEN** the two invocations exit with different non-zero codes, and each code's meaning is documented

#### Scenario: Success never masks a finding
- **WHEN** a command such as `doctor` or `catalog check` determines that a real invariant is violated
- **THEN** the command exits non-zero, even though the command itself executed without crashing

### Requirement: `--json` output envelope
Every command that supports `--json` SHALL emit a single JSON value on stdout, structurally stable
across patch and minor versions, containing at minimum a status field and a machine-readable
representation of the command's findings. Human-readable diagnostic text SHALL NOT be interleaved with
the JSON on stdout. A command that does not exit after emitting its envelope — because it starts a
long-running process such as a local server — SHALL emit that single JSON value as soon as the
condition it reports on is reached (for a server, once its listener is ready to accept connections),
and SHALL NOT write anything further to stdout for the remainder of the process's life; any activity it
logs afterward SHALL go to stderr, if anywhere.

#### Scenario: JSON output is parseable in isolation
- **WHEN** a command is invoked with `--json`
- **THEN** stdout, parsed as JSON, succeeds and yields the command's full result; any human-readable
  narration is written to stderr, if at all

#### Scenario: JSON shape is stable across a minor version bump
- **WHEN** a script written against one contexture minor version's `--json` output is run against a
  later minor version
- **THEN** the fields it depends on are still present with the same meaning

#### Scenario: A long-running command emits its envelope once, then stays silent on stdout
- **WHEN** a command that does not exit after starting (such as `ctxr serve --json`) reaches the
  condition it reports on
- **THEN** stdout receives exactly one JSON value at that moment, and no further writes to stdout occur
  for the rest of the process's life, regardless of how long it continues running

### Requirement: Fail-loud error contract
When a command cannot determine an input it needs (a store root, a required config value, a resolvable identity), it SHALL exit non-zero and name specifically what could not be determined. It SHALL NOT substitute a guessed or hardcoded fallback value in place of the missing input.

#### Scenario: Missing required config value is named
- **WHEN** a command needs a config value that `contexture.yaml` does not declare and for which no shipped default exists
- **THEN** the command exits non-zero and its error names the missing config key

### Requirement: The CLI is distributed and invoked as `ctxr`
The command-line interface SHALL be invoked as `ctxr` and SHALL be distributed under the npm package `ctxr-cli`, so that installing the package places the `ctxr` executable on the user's path. The package name carries the conventional `-cli` suffix because the registry's package-name similarity check refuses unscoped `ctxr`; the executable name is not subject to that check and stays short. The package manifest's executable map SHALL expose `ctxr` as the primary executable and `contexture` as a compatibility alias resolving to the same entry point. The CLI's own usage output SHALL name itself `ctxr`.

Throughout this project's specs, a command written as `contexture <command>` denotes invoking this executable with that subcommand. The executable's name and the package's name are bound here and nowhere else, so a future rename of either touches this requirement, not every scenario that names a command.

#### Scenario: The package installs the executable under both names
- **WHEN** the package is packed or installed
- **THEN** its name is `ctxr-cli`, and its executable map declares `ctxr` and `contexture` pointing at the same entry point

#### Scenario: Usage output names the executable
- **WHEN** the CLI is invoked with `--help`
- **THEN** the usage line names `ctxr`, and no usage line names `contexture` as the executable
### Requirement: Every shipped instruction to run a command names `ctxr`
Every surface the tool writes or ships that instructs a human or an agent to run a command — the generated sections of the canonical entry document, shipped skill seeds, generated harness-owned skill copies, installed git hooks and their diagnostic messages, and command error and check messages — SHALL name the executable as `ctxr`. No such surface SHALL instruct the reader to run `contexture <command>`.

#### Scenario: A freshly initialized store carries no stale invocation
- **WHEN** a store is initialized and its entry document, skill seeds, hooks, and skill copies are generated
- **THEN** every command invocation in those files names `ctxr`, and none names `contexture` as the executable

#### Scenario: An existing store's generated surfaces converge on regeneration
- **WHEN** `init` reconciles an already-initialized store whose generated regions and hooks were written by a release that named the executable `contexture`
- **THEN** the generated regions are rewritten to name `ctxr`, and the hook-health check reports the previously installed hooks as stale and rewrites them

### Requirement: Store-resident names are unaffected by the executable's name
Names that live inside a store or in the operator's environment rather than on the command line — the store configuration file, the tool-owned home directory, the environment variables the CLI reads, and generated-region markers — SHALL remain bound by their own capabilities and SHALL NOT change as a consequence of the executable's name. Generated skill names are the exception by design: an operator types them (as slash commands), so they follow the executable's name (`ctxr-<name>`), and the update command SHALL remove managed skill copies under a name the installed version no longer ships. An existing store SHALL require no migration as a result of the executable being renamed.

#### Scenario: An existing store opens unchanged under the renamed executable
- **WHEN** a store initialized by a release that named the executable `contexture` is opened by `ctxr`
- **THEN** its configuration file, home directory, markers, and environment variables are read under their existing names, and no migration is reported as pending

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
