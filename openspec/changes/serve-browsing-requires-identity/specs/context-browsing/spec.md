## MODIFIED Requirements

### Requirement: The server binds to loopback by default, widened only by explicit operator choice
`ctxr serve` SHALL bind its HTTP listener to the loopback interface by default, and SHALL bind to a
different address only when an explicit `--host <address>` option names one. No requirement in this
capability SHALL be read as providing per-requester filtering or rate limiting on whichever address the
server is actually bound to: every requester the server admits reads the same store, no matter what address
the server is bound to. In a store that declares no `change_approval`, no route this capability defines
authenticates anyone, and widening the bind address is a decision entirely the operator's to make and account
for. In a store that declares it, a widened bind admits only requests that carry the verified identity
assertion, as the requirement "A widened bind admits only verified requests when the store declares an
identity" states. The `/approve/` routes are not this capability's: `change-approval` governs them, and they
verify an identity of their own.

#### Scenario: The default is loopback
- **WHEN** `ctxr serve` starts with no `--host` given
- **THEN** the address it reports and binds to is the loopback interface

#### Scenario: An explicit --host widens the bind address
- **WHEN** `ctxr serve --host <address>` names a bind address other than loopback
- **THEN** the server binds there instead, and reports that address as the one it bound to

#### Scenario: No filtering exists regardless of bind address
- **WHEN** `ctxr serve` is bound to any address, loopback or otherwise
- **THEN** every route this capability defines responds identically to every requester it admits — no
  requirement in this capability filters what a requester reads by who they are, and in a store that declares
  no `change_approval` every requester who can reach that address is admitted

## ADDED Requirements

### Requirement: A widened bind admits only verified requests when the store declares an identity
When the loaded configuration declares `change_approval` and the server is bound to an address other than
loopback, `ctxr serve` SHALL require on every route the identity assertion `change-approval` defines, verified
by the same checks for each request. A request that fails SHALL receive `401` with `Cache-Control: no-store`,
and the server SHALL read nothing from the store to answer it. A verified assertion SHALL be sufficient: no
list of readers is consulted.

#### Scenario: A request around the access proxy reads nothing
- **WHEN** a store declares `change_approval`, `ctxr serve --host 0.0.0.0` is running, and `/notes/<note>` is
  requested with no identity assertion header
- **THEN** the response is `401` and carries no part of the note

#### Scenario: Every browsing route is covered
- **WHEN** the same server is asked for `/`, `/graph`, a `/catalog/` section, a `/publish/` file, a `/preview/`
  file, a review view and `/assets/style.css`, each with no assertion
- **THEN** each response is `401`

#### Scenario: A verified request browses as before
- **WHEN** `/notes/<note>` is requested with an assertion that verifies, from an email no `deciders` or `mcp`
  entry names
- **THEN** the response is `200` and carries the note

#### Scenario: A forged or foreign assertion is refused
- **WHEN** `/notes/<note>` is requested with an assertion signed by a key outside the configured key set, or
  one that verifies for another audience
- **THEN** the response is `401`

### Requirement: The identity check leaves loopback, undeclared stores and self-controlled routes alone
When the server is bound to loopback, or the loaded configuration declares no `change_approval`, the identity
check on browsing SHALL NOT apply. It SHALL NOT be added to the routes with a control of their own: the MCP
and OAuth paths `remote-access` defines, the webhook route (`/hooks/github` or `/hooks/gitlab`), `/approve/` and `/plugin/`. The check SHALL follow
the configuration the server last loaded, whether or not the approval surface could be built.

#### Scenario: A loopback bind asks for nothing
- **WHEN** a store declares `change_approval`, `ctxr serve` runs with no `--host`, and `/notes/<note>` is
  requested with no assertion
- **THEN** the response is `200` and carries the note

#### Scenario: A store without change approval is unchanged
- **WHEN** a store declares no `change_approval`, `ctxr serve --host 0.0.0.0` is running, and `/notes/<note>`
  is requested with no assertion
- **THEN** the response is `200` and carries the note

#### Scenario: The routes with their own control are not gated
- **WHEN** the widened server of a store that declares `change_approval`, with no `mcp` block and no webhook
  secret, is asked for `/.well-known/oauth-authorization-server` with no assertion, and receives a `POST` to
  the webhook route (`/hooks/github` or `/hooks/gitlab`)
- **THEN** the first response is that surface's own `404` and the second is `405`, neither the identity
  check's `401`

#### Scenario: Declaring the block turns the check on without a restart
- **WHEN** a widened server's configuration file gains a `change_approval` block
- **THEN** the next request for `/notes/<note>` with no assertion is answered `401`
