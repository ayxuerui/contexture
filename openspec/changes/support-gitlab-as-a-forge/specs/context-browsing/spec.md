## MODIFIED Requirements

### Requirement: Only read-only HTTP methods are served
`ctxr serve` SHALL respond to `GET` and `HEAD` requests only, with three exceptions. When the store declares
change approval, a `POST` to the decision route that `change-approval` defines SHALL reach that route's
handler, which writes to the forge and writes nothing under the store root. When the store declares the MCP
surface that `remote-access` defines, a `POST` to `/mcp`, `/token`, `/register` or `/authorize`, and an
`OPTIONS` to `/token`, `/register` or the metadata documents, SHALL reach that surface's handler. That handler
writes nothing under the store root except its own derived read checkout and, for `capture`, the session
worktree it starts. When the server's environment provides a webhook secret, a `POST` to the webhook route of
the store's forge (`/hooks/github` or `/hooks/gitlab`, as the webhook requirements define) SHALL reach the webhook handler, which writes nothing under the store root except fetched refs in its own namespace. Every other combination of method and path SHALL receive a `405` response and SHALL NOT
reach any route handler capable of reading or writing store content. A `GET` request MAY cause the response to
record a display preference (such as a chosen theme) as client-side state belonging to the requester's own
browser; doing so SHALL NOT create, modify, or delete any file under the store root, and SHALL NOT be read as
reading or writing store content.

#### Scenario: A non-read method is refused before it reaches a handler
- **WHEN** a `POST`, `PUT`, `PATCH`, or `DELETE` request is sent to any path the server would otherwise
  serve, other than a `POST` to the decision route of a store that declares change approval, to the MCP routes of a
  store that declares the MCP surface, or to the webhook route of the store's forge on a server with a webhook secret
- **THEN** the response is `405`, and no store content is read or written as a result of that request

#### Scenario: A GET that records a display preference writes no store content
- **WHEN** a `GET` request selects a display preference this capability offers, such as a theme
- **THEN** the response records that choice only as state belonging to the requester's own browser, and
  no file under the store root is created, modified, or deleted

#### Scenario: The decision route admits POST only when change approval is declared
- **WHEN** a `POST` is sent to the decision route of a store that does not declare change approval
- **THEN** the response is `405`

#### Scenario: The MCP routes admit POST only when the MCP surface is declared
- **WHEN** a `POST` is sent to `/mcp` of a store that does not declare the MCP surface
- **THEN** the response is `405`, and no tool runs

#### Scenario: The webhook route admits POST only with a webhook secret
- **WHEN** a `POST` is sent to `/hooks/github` on a server whose environment provides no webhook secret
- **THEN** the response is `405`, and nothing is fetched

#### Scenario: A server exposes only its own forge's webhook route
- **WHEN** a `POST` is sent to `/hooks/github` on the server of a GitLab store whose environment provides a
  webhook secret
- **THEN** the response is `405`, and no handler runs

### Requirement: Only a signed forge delivery reaches the webhook
When the server's environment provides a webhook secret and the store is on GitHub, `POST /hooks/github` SHALL
accept GitHub push and pull-request deliveries whose `X-Hub-Signature-256` verifies against that secret, and
SHALL answer `401`, doing nothing, for any other. When the store is on GitLab, `POST /hooks/gitlab` SHALL accept
GitLab push and merge-request deliveries whose `X-Gitlab-Token` header equals that secret, compared in constant
time, and SHALL answer `401`, doing nothing, for any other. Without a secret, neither route SHALL exist. A
verified GitLab delivery SHALL be acted on exactly as the corresponding GitHub delivery is: only the event and
the branch are read from it.

#### Scenario: An unsigned delivery does nothing
- **WHEN** a `POST /hooks/github` arrives with a missing or wrong signature
- **THEN** the response is `401`, and no run starts and nothing is fetched

#### Scenario: Without a secret there is no webhook route
- **WHEN** the server's environment provides no webhook secret
- **THEN** `POST /hooks/github` is answered `405`, as any other non-read request

#### Scenario: A GitLab delivery with the wrong token does nothing
- **WHEN** a `POST /hooks/gitlab` arrives at a GitLab store's server with a missing or wrong `X-Gitlab-Token`
- **THEN** the response is `401`, and no run starts and nothing is fetched

#### Scenario: A verified GitLab push updates the server
- **WHEN** a GitLab push delivery for the default branch arrives with the right token
- **THEN** a store-update run starts, as for a verified GitHub push
