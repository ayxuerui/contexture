# cli-contract Specification

## Purpose

Establishes the cross-cutting behavioral contract — exit codes, structured output, and failure reporting — that every contexture command shares, so scripts, agents, and hooks can rely on consistent behavior regardless of which command they invoke.

## Requirements

### Requirement: The CLI is distributed and invoked as `ctxr`
The command-line interface SHALL be invoked as `ctxr` and SHALL be distributed under an npm package of the same name, so that the install name, the `npx` name, and the executable name are one string. The package manifest's executable map SHALL expose `ctxr` as the primary executable and `contexture` as a compatibility alias resolving to the same entry point. The CLI's own usage output SHALL name itself `ctxr`.

Throughout this project's specs, a command written as `contexture <command>` denotes invoking this executable with that subcommand. The executable's name is bound here and nowhere else, so a future rename touches this requirement, not every scenario that names a command.

#### Scenario: The package installs the executable under both names
- **WHEN** the package is packed or installed
- **THEN** its name is `ctxr`, and its executable map declares `ctxr` and `contexture` pointing at the same entry point

#### Scenario: Usage output names the executable
- **WHEN** the CLI is invoked with `--help`
- **THEN** the usage line names `ctxr`, and no usage line names `contexture` as the executable

### Requirement: Every shipped instruction to run a command names `ctxr`
Every surface the tool writes or ships that instructs a human or an agent to run a command — the generated sections of the canonical entry document, shipped procedure seeds, generated harness skill wrappers, installed git hooks and their diagnostic messages, and command error and check messages — SHALL name the executable as `ctxr`. No such surface SHALL instruct the reader to run `contexture <command>`.

#### Scenario: A freshly initialized store carries no stale invocation
- **WHEN** a store is initialized and its entry document, procedure seeds, hooks, and skill wrappers are generated
- **THEN** every command invocation in those files names `ctxr`, and none names `contexture` as the executable

#### Scenario: An existing store's generated surfaces converge on regeneration
- **WHEN** `init` reconciles an already-initialized store whose generated regions and hooks were written by a release that named the executable `contexture`
- **THEN** the generated regions are rewritten to name `ctxr`, and the hook-health check reports the previously installed hooks as stale and rewrites them

### Requirement: Store-resident names are unaffected by the executable's name
Names that live inside a store or in the operator's environment rather than on the command line — the store configuration file, the tool-owned home directory, the environment variables the CLI reads, generated-region markers, and generated skill directories — SHALL remain bound by their own capabilities and SHALL NOT change as a consequence of the executable's name. An existing store SHALL require no migration as a result of the executable being renamed.

#### Scenario: An existing store opens unchanged under the renamed executable
- **WHEN** a store initialized by a release that named the executable `contexture` is opened by `ctxr`
- **THEN** its configuration file, home directory, markers, and environment variables are read under their existing names, and no migration is reported as pending
