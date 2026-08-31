## Purpose

Establishes the cross-cutting behavioral contract — exit codes, structured output, and failure reporting — that every contexture command shares, so scripts, agents, and hooks can rely on consistent behavior regardless of which command they invoke.

## ADDED Requirements

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
