## MODIFIED Requirements

### Requirement: The server binds to loopback by default, widened only by explicit operator choice
`ctxr serve` SHALL bind its HTTP listener to the loopback interface by default, and SHALL bind to a
different address only when an explicit `--host <address>` option names one. No requirement in this
capability SHALL be read as providing protection against a requester who can reach whichever address the
server is actually bound to — the absence of per-requester filtering, rate limiting, and authentication
applies identically to every route this capability defines, no matter what address the server is bound to,
and widening the bind address is a decision entirely the operator's to make and account for. The `/approve/`
routes are not this capability's: `change-approval` governs them, and they verify an identity of their own.

#### Scenario: The default is loopback
- **WHEN** `ctxr serve` starts with no `--host` given
- **THEN** the address it reports and binds to is the loopback interface

#### Scenario: An explicit --host widens the bind address
- **WHEN** `ctxr serve --host <address>` names a bind address other than loopback
- **THEN** the server binds there instead, and reports that address as the one it bound to

#### Scenario: No filtering exists regardless of bind address
- **WHEN** `ctxr serve` is bound to any address, loopback or otherwise
- **THEN** every route this capability defines responds identically to any requester who can reach that
  address — no requirement in this capability distinguishes requesters by any means, and only the
  `change-approval` routes verify who is asking

### Requirement: Only read-only HTTP methods are served
`ctxr serve` SHALL respond to `GET` and `HEAD` requests only, with one exception: when the store declares
change approval, a `POST` to the decision route that `change-approval` defines SHALL reach that route's
handler, which writes to the forge and writes nothing under the store root. Every other combination of method
and path SHALL receive a `405` response and SHALL NOT reach any route handler capable of reading or writing
store content. A `GET` request MAY cause the response to record a display preference (such as a chosen theme)
as client-side state belonging to the requester's own browser; doing so SHALL NOT create, modify, or delete
any file under the store root, and SHALL NOT be read as reading or writing store content.

#### Scenario: A non-read method is refused before it reaches a handler
- **WHEN** a `POST`, `PUT`, `PATCH`, or `DELETE` request is sent to any path the server would otherwise
  serve, other than a `POST` to the decision route of a store that declares change approval
- **THEN** the response is `405`, and no store content is read or written as a result of that request

#### Scenario: A GET that records a display preference writes no store content
- **WHEN** a `GET` request selects a display preference this capability offers, such as a theme
- **THEN** the response records that choice only as state belonging to the requester's own browser, and
  no file under the store root is created, modified, or deleted

#### Scenario: The decision route admits POST only when change approval is declared
- **WHEN** a `POST` is sent to the decision route of a store that does not declare change approval
- **THEN** the response is `405`
