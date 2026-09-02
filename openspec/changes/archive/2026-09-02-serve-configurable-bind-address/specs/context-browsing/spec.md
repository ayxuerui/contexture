## MODIFIED Requirements

### Requirement: The server binds to loopback by default, widened only by explicit operator choice
`ctxr serve` SHALL bind its HTTP listener to the loopback interface by default, and SHALL bind to a
different address only when an explicit `--host <address>` option names one. No requirement in this
capability SHALL be read as providing protection against a requester who can reach whichever address the
server is actually bound to — the absence of per-requester filtering, rate limiting, and authentication
applies identically no matter what address the server is bound to, and widening the bind address is a
decision entirely the operator's to make and account for.

#### Scenario: The default is loopback
- **WHEN** `ctxr serve` starts with no `--host` given
- **THEN** the address it reports and binds to is the loopback interface

#### Scenario: An explicit --host widens the bind address
- **WHEN** `ctxr serve --host <address>` names a bind address other than loopback
- **THEN** the server binds there instead, and reports that address as the one it bound to

#### Scenario: No filtering exists regardless of bind address
- **WHEN** `ctxr serve` is bound to any address, loopback or otherwise
- **THEN** every route responds identically to any requester who can reach that address — no requirement
  in this capability distinguishes requesters by any means
