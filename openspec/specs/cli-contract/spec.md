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
Every command that supports `--json` SHALL emit a single JSON value on stdout, structurally stable across patch and minor versions, containing at minimum a status field and a machine-readable representation of the command's findings. Human-readable diagnostic text SHALL NOT be interleaved with the JSON on stdout.

#### Scenario: JSON output is parseable in isolation
- **WHEN** a command is invoked with `--json`
- **THEN** stdout, parsed as JSON, succeeds and yields the command's full result; any human-readable narration is written to stderr, if at all

#### Scenario: JSON shape is stable across a minor version bump
- **WHEN** a script written against one contexture minor version's `--json` output is run against a later minor version
- **THEN** the fields it depends on are still present with the same meaning

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
