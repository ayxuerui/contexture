## ADDED Requirements

### Requirement: A second opinion runs through the `ctxr` tool as it runs in a shell
The `ctxr` tool's allowlist SHALL include `second-opinion preflight`, `second-opinion critique` and `second-opinion poll`, run by the server's own CLI with the same argument vector, environment allowlist and exit codes as in a shell. The server SHALL add `--print` to `critique` and `poll`, so the answers are returned in the result, and SHALL refuse an `--out` argument before anything runs, so no output directory is left on the server.

#### Scenario: A critique written in chat is answered
- **WHEN** a member calls `ctxr` with `["second-opinion", "critique", "--plan-file", "@input"]` and the plan as `input`, on a server whose model CLIs answer
- **THEN** the result carries exit code `0` and each lettered critique's text, and neither the input file nor an output directory remains on the server afterwards

### Requirement: The `ctxr` tool takes `input` for a second opinion only
For the `second-opinion` commands the `ctxr` tool SHALL accept `input`: a literal `@input` argument SHALL be replaced by the path of a file holding it, written outside the checkout and removed when the run ends. Any other command called with `input` SHALL be refused before anything runs.

#### Scenario: Other read commands take no input
- **WHEN** a member calls `ctxr` with `["lint"]` and an `input`
- **THEN** the call is refused and nothing runs

### Requirement: A second opinion has its own time bound and runs one at a time
The `second-opinion` commands SHALL run within their own declared time bound, longer than the other commands' and shorter than the clients' tool limit. The server SHALL pass a per-CLI `--timeout` within that bound when none is given, and SHALL refuse a larger one before anything runs. While one second opinion runs on a server, another call SHALL be refused before anything runs, naming the reason.

#### Scenario: A slow model is a partial result, not a lost one
- **WHEN** one of the three model CLIs does not answer within the per-CLI timeout the server passes
- **THEN** the call returns within the command's time bound with the failed-check code, the other two critiques, and that CLI named as failed

#### Scenario: A larger timeout is refused
- **WHEN** a member calls `ctxr` with `["second-opinion", "critique", "--timeout", "600", "--plan-file", "@input"]`
- **THEN** the call is refused naming the largest timeout the server allows, and nothing runs

#### Scenario: A second run waits its turn
- **WHEN** a member calls `ctxr` with a `second-opinion critique` while another is running on the same server
- **THEN** the call is refused as busy and no model CLI is started for it

### Requirement: The server runs a second opinion only when it is confined
The server SHALL add `--require-confinement` to every `second-opinion` command it runs, so where its runs cannot be confined the command ends, naming the reason, before any model CLI starts.

#### Scenario: An unconfined server does not run a second opinion
- **WHEN** a member calls `ctxr` with a `second-opinion critique` on a server whose `setpriv` has no Landlock support
- **THEN** the result carries the failed-check code and the reason, and no model CLI is started
