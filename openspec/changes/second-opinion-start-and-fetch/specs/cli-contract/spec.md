## ADDED Requirements

### Requirement: `ctxr second-opinion --detach` starts a run and returns its id
With `--detach`, `ctxr second-opinion critique` and `ctxr second-opinion poll` SHALL make every refusal the same run would make without it, then start the run in the background and exit `0` at once, printing a run id. The run SHALL carry on after the command exits. `--detach` together with `--out` SHALL be a usage error, and `preflight` SHALL NOT accept `--detach`.

#### Scenario: A detached critique returns before any answer
- **WHEN** `ctxr second-opinion critique --detach --plan-file plan.md` is run where the model CLIs take two minutes to answer
- **THEN** it exits `0` within a few seconds, printing a run id, and the three model CLIs keep running

#### Scenario: A detached run is refused like a blocking one
- **WHEN** `ctxr second-opinion critique --detach --only claude --plan-file plan.md` is run
- **THEN** it exits with the usage code, prints no run id, and no model CLI is invoked

#### Scenario: Detach and out together are refused
- **WHEN** `ctxr second-opinion poll --detach --out answers --prompt-file q.md` is run
- **THEN** it exits with the usage code and no model CLI is invoked

### Requirement: `ctxr second-opinion result` fetches a run within a bounded wait
`ctxr second-opinion result <run>` SHALL wait up to `--wait` seconds (default 45) for the run to finish. A finished run SHALL be printed as `--print` prints it, with that run's exit code. An unfinished one SHALL be reported as running, with its elapsed time, and exit `0`. With `--json` the envelope SHALL carry the run's state, one of `running`, `finished` or `stopped`. Fetching a finished run again SHALL print the same answers.

#### Scenario: A finished run prints as a blocking run would
- **WHEN** `ctxr second-opinion result <run>` is called for a detached critique that finished with three valid critiques
- **THEN** stdout carries critiques A, B and C and then the letter table, and it exits `0`

#### Scenario: A partial run keeps its failed-check code
- **WHEN** `ctxr second-opinion result <run>` is called for a detached critique that finished with one valid critique of three
- **THEN** it exits with the failed-check code, as the same run without `--detach` would have

#### Scenario: An unfinished run says so within the wait
- **WHEN** `ctxr second-opinion result <run> --wait 5` is called while that run's model CLIs are still answering
- **THEN** it exits `0` within about five seconds, stating that the run is still running and how long it has run, with `state: running` under `--json`

#### Scenario: A lost response can be fetched again
- **WHEN** `ctxr second-opinion result <run>` is called twice for the same finished run
- **THEN** both calls print the same answers

### Requirement: A detached run that ends without finishing is reported as stopped
`ctxr second-opinion result` SHALL report a run whose process ended without recording a finish as `stopped` and exit with the failed-check code. It SHALL NOT report such a run as running. A run id that names no run, including one already removed, SHALL be a usage error.

#### Scenario: A killed run is not shown as running
- **WHEN** a detached run's process is killed and then `ctxr second-opinion result <run>` is called
- **THEN** it reports the run as stopped and exits with the failed-check code

#### Scenario: An unknown run id is a usage error
- **WHEN** `ctxr second-opinion result` is called with an id that names no run
- **THEN** it exits with the usage code naming the id

### Requirement: One detached second opinion runs at a time per machine user
While a detached run of the same machine user is running, `ctxr second-opinion critique --detach` and `poll --detach` SHALL exit with the failed-check code, before any model CLI starts, naming the running run's id so it can be fetched. A stopped run SHALL NOT block a new one.

#### Scenario: A second detached run names the first
- **WHEN** `ctxr second-opinion critique --detach --plan-file plan.md` is run while another detached run of the same user is running
- **THEN** it exits with the failed-check code, names the running run's id, and starts no model CLI

#### Scenario: A stopped run does not hold the machine
- **WHEN** a detached run's process was killed and a new `ctxr second-opinion critique --detach` is run
- **THEN** the new run starts and prints its own id

### Requirement: A detached run's files are private and removed an hour after it finishes
A detached run's plan or question, state and answers SHALL be kept in a folder readable only by the user who started it, outside any store checkout. The folder SHALL be removed one hour after the run finishes or is found stopped. Removal SHALL happen when a later `second-opinion` command starts.

#### Scenario: An old run is cleaned up
- **WHEN** a detached run finished more than one hour ago and `ctxr second-opinion critique --detach` is run
- **THEN** the old run's folder no longer exists, and `ctxr second-opinion result` for the old run's id exits with the usage code
