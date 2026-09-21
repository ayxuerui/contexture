## MODIFIED Requirements

### Requirement: `--json` output envelope
Every command that supports `--json` SHALL emit a single JSON value on stdout, structurally stable
across patch and minor versions, containing at minimum a status field and a machine-readable
representation of the command's findings. Human-readable diagnostic text SHALL NOT be interleaved with
the JSON on stdout. A command that does not exit after emitting its envelope — because it starts a
long-running process such as a local server — SHALL emit that single JSON value as soon as the
condition it reports on is reached (for a server, once its listener is ready to accept connections),
and SHALL NOT write anything further to stdout for the remainder of the process's life; any activity it
logs afterward SHALL go to stderr, if anywhere.

A usage error raised while parsing the command line — before any command has been selected to run —
SHALL emit the same envelope on stdout when `--json` was requested, carrying the setup/usage exit code,
the error status, and a finding that names what was rejected. The envelope SHALL identify the deepest
registered command the invocation reached, and SHALL NOT report an argument or an unrecognized word as
though it were a command. A request for help or for the version is not a usage error and is not
required to emit an envelope on this path.

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

#### Scenario: A rejected command line still answers in JSON
- **WHEN** an invocation carrying `--json` is rejected while its command line is being parsed, such as
  by naming an option that does not exist
- **THEN** stdout carries one envelope reporting the setup/usage exit code and the error status, with a
  finding naming what was rejected

#### Scenario: The envelope names the command that was asked for
- **WHEN** a subcommand invocation carrying `--json` is rejected during parsing, and the invocation also
  carries an argument of its own
- **THEN** the envelope identifies the subcommand that was reached, and neither the argument nor an
  unrecognized word appears as the command

## ADDED Requirements

### Requirement: A usage error is reported once
A usage error SHALL be written to stderr exactly once per invocation, whether it was raised while
parsing the command line or by the command itself, so that a caller capturing stderr can tell one
failure from two. The human-readable report SHALL NOT be repeated on stdout, in either output mode.

#### Scenario: A rejected command line reports one message
- **WHEN** an invocation is rejected while its command line is being parsed
- **THEN** stderr carries the explanation exactly once, and the exit code is the setup/usage code

#### Scenario: Machine-readable mode does not duplicate the human report
- **WHEN** that same invocation carries `--json`
- **THEN** stdout carries only the envelope, and the human explanation appears only on stderr, still
  exactly once
