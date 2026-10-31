## ADDED Requirements

### Requirement: The server keeps its clone of the store current
`ctxr serve` SHALL start a store-update run as a separate process within one minute of starting, and then every
`serve.sync_minutes` minutes while it runs. The run SHALL be the landing run (`ctxr land --pending`) while the
configuration the server has loaded turns landing on (per change-approval), and `ctxr sync` otherwise, so a store that
does not approve changes through the server is still served as its default branch stands.

#### Scenario: A store without change approval is served as its default branch stands
- **WHEN** a store declares no `change_approval`, a change is merged on the forge, and the server has been running for longer than `serve.sync_minutes`
- **THEN** the server's clone has been fast-forwarded to the merged commit by a `ctxr sync` run, and the merged change is served

#### Scenario: A store that lands through the server syncs through landing
- **WHEN** the loaded configuration declares `change_approval` with no `land` key
- **THEN** each store-update run is a landing run, and no separate `ctxr sync` run starts

### Requirement: Store-update runs never overlap and never change how requests are answered
The server SHALL NOT run two store-update runs at once; a run due while one is in progress SHALL start after it ends.
A run's output SHALL go to the server's stderr with a prefix naming the run, never to its stdout, and no run, and no
failure of a run, SHALL change how any request is answered.

#### Scenario: A run's failure leaves browsing alone
- **WHEN** a `ctxr sync` run exits non-zero because the forge cannot be reached
- **THEN** the server's stderr carries the run's output, and every route answers as before

### Requirement: The store-update interval is configured in whole minutes
`serve.sync_minutes` SHALL accept a positive whole number of minutes. Absent, it SHALL mean 5, today's landing
interval. Loading a configuration whose value is not a positive whole number SHALL fail, naming the key.

#### Scenario: The interval follows the configuration
- **WHEN** the configuration sets `serve.sync_minutes: 2`
- **THEN** store-update runs start every two minutes

#### Scenario: A malformed interval is refused
- **WHEN** the configuration sets `serve.sync_minutes: 0`
- **THEN** loading the configuration fails, naming `serve.sync_minutes`
