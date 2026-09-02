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
