## ADDED Requirements

### Requirement: The approval routes follow the configuration the server last loaded
The approval routes SHALL follow the configuration that `ctxr serve` last loaded (context-browsing: "The server
follows changes to the store's configuration"). When a loaded change adds a `change_approval` block, the server
SHALL build the approval surface from it. That includes resolving the forge credential and checking that its
login is the recording login. When a loaded change alters the block or `serve.base_url`, the server SHALL rebuild
the surface. When a loaded change removes the block, the approval routes SHALL answer `404`, and `POST` SHALL
answer `405`, exactly as for a store that never declared it.

After startup, an approval surface that cannot be built SHALL NOT stop the server. Reasons include an unreachable
forge, a credential that is refused, or a recording login that does not match. Instead every approval route SHALL
answer `503` with a body naming the problem and no secret. Every other route SHALL keep answering. The server
SHALL write one line to stderr naming the problem. A request that arrives while the surface answers `503` SHALL
try to build it again, at most once every thirty seconds, so that a forge that comes back, or a corrected
configuration, takes effect without a restart.

At startup, a recording login that does not match still stops the server before it binds (as "A decision is
recorded on the forge as a review attributed to the decider" requires).

#### Scenario: Approval turned on after startup
- **WHEN** a server started with no `change_approval` block, and the block is then added to its configuration
  file
- **THEN** the next `GET /approve/` with a verified decider's assertion answers `200`, with no restart

#### Scenario: A decider added after startup
- **WHEN** `b@example.com` is added to the deciders of a running server's configuration
- **THEN** the next request with `b@example.com`'s verified assertion is admitted, where it was answered `403`
  before the change

#### Scenario: Approval turned off after startup
- **WHEN** the `change_approval` block is removed from a running server's configuration file
- **THEN** `/approve/` answers `404`, and a `POST` to a decision route answers `405`

#### Scenario: A recording-login mismatch after startup degrades the approval routes only
- **WHEN** a loaded change sets `recording_login` to a login the server's credential does not authenticate as
- **THEN** every `/approve/` route answers `503` naming both logins, notes and published pages still answer
  `200`, and the server keeps running

#### Scenario: A recovered forge is picked up
- **WHEN** the approval surface answered `503` because the forge was unreachable, and the forge is reachable
  again more than thirty seconds later
- **THEN** the next approval request builds the surface and is answered normally
