## MODIFIED Requirements

### Requirement: A second opinion runs through the `ctxr` tool as it runs in a shell
The `ctxr` tool's allowlist SHALL include `second-opinion preflight`, `second-opinion critique`, `second-opinion poll` and `second-opinion result`, run by the server's own CLI with the same argument vector, environment allowlist and exit codes as in a shell. The server SHALL refuse an `--out` argument before anything runs. The answers SHALL come back in the result of the call that finds the run finished, and nothing of the run SHALL remain on the server beyond the lifetime the CLI gives a detached run.

#### Scenario: A critique written in chat is answered
- **WHEN** a member calls `ctxr` with `["second-opinion", "critique", "--plan-file", "@input", "--detach"]` and the plan as `input`, then calls `ctxr` with `["second-opinion", "result", <run>]` until the run has finished, on a server whose model CLIs answer
- **THEN** the last result carries exit code `0` and each lettered critique's text, and no output directory named by the member exists on the server

### Requirement: A second opinion has its own time bound and runs one at a time
Every `ctxr` tool call for a `second-opinion` command SHALL return within its own declared bound, which SHALL be shorter than the shortest tool limit measured on a supported client, whatever the run's length. The server SHALL cap `result --wait` to fit that bound, SHALL pass a per-CLI `--timeout` within the CLI's own default when none is given, and SHALL refuse a larger one before anything runs. While a second opinion runs on a server, a call that would start another SHALL be refused before anything runs, naming the reason.

#### Scenario: A long run answers across calls
- **WHEN** a member starts a critique whose model CLIs take three minutes, then calls `result` for it repeatedly
- **THEN** every call returns within the bound, the calls before the run finishes report it as running, and the first call after it finishes carries the critiques

#### Scenario: A longer wait is cut to the bound
- **WHEN** a member calls `ctxr` with `["second-opinion", "result", <run>, "--wait", "600"]` for a run that is still running
- **THEN** the call returns within the bound, reporting the run as running

#### Scenario: A slow model is a partial result, not a lost one
- **WHEN** one model CLI does not answer within the per-CLI timeout the server passes
- **THEN** the run still ends, and the call that carries its result returns within the bound with that CLI named as failed and the critiques that did answer

#### Scenario: A larger timeout is refused
- **WHEN** a member calls `ctxr` with `["second-opinion", "critique", "--timeout", "1200", "--plan-file", "@input", "--detach"]`
- **THEN** the call is refused naming the largest timeout the server allows, and nothing runs

#### Scenario: A second run waits its turn
- **WHEN** a member calls `ctxr` with a `second-opinion critique` while another is running on the same server
- **THEN** the call is refused as busy and no model CLI is started for it

## ADDED Requirements

### Requirement: A detached second opinion on the server belongs to the member who started it
The server SHALL record the member who started each detached run, and `second-opinion result` SHALL refuse a run started by another member as if it did not exist. A busy refusal SHALL name the running run's id only to the member who started it.

#### Scenario: Another member cannot read a run
- **WHEN** member A starts a detached critique, and member B calls `ctxr` with `["second-opinion", "result", <A's run>]`
- **THEN** B's call is refused as naming no run, and none of A's plan or answers is returned

#### Scenario: The owner is told which run is busy
- **WHEN** member A calls `ctxr` with a detached critique while A's earlier detached critique is running
- **THEN** the refusal names A's earlier run id, so A can fetch it with `result`

### Requirement: A blocking second opinion through the server starts a run and waits a bounded time
A `critique` or `poll` through the `ctxr` tool without `--detach` SHALL start a detached run and wait for it within the tool's bound. A run that finishes in time SHALL return as `result` returns a finished run. A run that does not SHALL return its run id, stating that it is still running and that `second-opinion result` fetches it.

#### Scenario: A short plan answers in one call
- **WHEN** a member calls `ctxr` with `["second-opinion", "critique", "--plan-file", "@input"]` and the run finishes in thirty seconds
- **THEN** the one call carries the critiques and exit code `0`

#### Scenario: A long plan hands back its run id
- **WHEN** a member calls `ctxr` with `["second-opinion", "critique", "--plan-file", "@input"]` and the run takes three minutes
- **THEN** the call returns within the bound with the run id and a statement that it is still running, and a later `result` call for that id carries the critiques
