## ADDED Requirements

### Requirement: The server lands what was approved
While the configuration `ctxr serve` has loaded declares `change_approval`, and its `land` key is absent or
`auto`, the server SHALL land approved changes by running `ctxr land --pending` for its store as a separate
process. It SHALL start a run after it accepts an Approve decision, and SHALL also start one at least every five
minutes while it runs. It SHALL NOT run two at once. A start requested while a run is in progress SHALL produce
exactly one further run after it ends. A run's output SHALL go to the server's stderr, and SHALL NOT go to its
stdout. No run, and no failure of a run, SHALL change how any request is answered, beyond what the run itself
records on the forge.

When `land` is `manual`, or the loaded configuration stops declaring `change_approval`, the server SHALL start no
further runs. When the server stops, it SHALL stop a run in progress.

`change_approval.land` SHALL accept only `auto` or `manual`. It SHALL carry no shipped default, and absent SHALL
mean `auto`.

#### Scenario: An approval lands without a scheduler
- **WHEN** a decider approves a mergeable session pull request on a running server whose configuration declares
  `change_approval` and no `land` key
- **THEN** the pull request is merged and its worktree removed, with no other process running `ctxr land`

#### Scenario: Runs never overlap
- **WHEN** three approvals are accepted while a landing run is in progress
- **THEN** exactly one further run starts after the current one ends, and at no time do two runs exist

#### Scenario: Manual landing is respected
- **WHEN** the configuration declares `change_approval` with `land: manual`, and a decider approves a change
- **THEN** the server starts no landing run, and the pull request stays open and approved

#### Scenario: A landing failure leaves browsing alone
- **WHEN** a landing run exits non-zero because a change is blocked by a conflict
- **THEN** the server's stderr carries the run's output, and every route answers as before

#### Scenario: The periodic sweep catches an approval made while the server was down
- **WHEN** a pull request was approved while the server was stopped, and the server is then started
- **THEN** a landing run starts within five minutes of startup and lands it
