## MODIFIED Requirements

### Requirement: Only read-only HTTP methods are served
`ctxr serve` SHALL respond to `GET` and `HEAD` requests only, with two exceptions. When the store declares
change approval, a `POST` to the decision route that `change-approval` defines SHALL reach that route's
handler, which writes to the forge and writes nothing under the store root. When the store declares the MCP
surface that `remote-access` defines, a `POST` to `/mcp`, `/token`, `/register` or `/authorize`, and an
`OPTIONS` to `/token`, `/register` or the metadata documents, SHALL reach that surface's handler. That handler
writes nothing under the store root except its own derived read checkout and, for `capture`, the session
worktree it starts. Every other combination of method and path SHALL receive a `405` response and SHALL NOT
reach any route handler capable of reading or writing store content. A `GET` request MAY cause the response to
record a display preference (such as a chosen theme) as client-side state belonging to the requester's own
browser; doing so SHALL NOT create, modify, or delete any file under the store root, and SHALL NOT be read as
reading or writing store content.

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

#### Scenario: The MCP routes admit POST only when the MCP surface is declared
- **WHEN** a `POST` is sent to `/mcp` of a store that does not declare the MCP surface
- **THEN** the response is `405`, and no tool runs
