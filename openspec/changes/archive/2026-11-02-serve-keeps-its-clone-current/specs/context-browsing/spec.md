## MODIFIED Requirements

### Requirement: Only read-only HTTP methods are served
`ctxr serve` SHALL respond to `GET` and `HEAD` requests only, with three exceptions. When the store declares
change approval, a `POST` to the decision route that `change-approval` defines SHALL reach that route's
handler, which writes to the forge and writes nothing under the store root. When the store declares the MCP
surface that `remote-access` defines, a `POST` to `/mcp`, `/token`, `/register` or `/authorize`, and an
`OPTIONS` to `/token`, `/register` or the metadata documents, SHALL reach that surface's handler. That handler
writes nothing under the store root except its own derived read checkout and, for `capture`, the session
worktree it starts. When the server's environment provides a webhook secret, a `POST` to `/hooks/github` SHALL
reach the webhook handler, which writes nothing under the store root except fetched refs in its own namespace. Every other combination of method and path SHALL receive a `405` response and SHALL NOT
reach any route handler capable of reading or writing store content. A `GET` request MAY cause the response to
record a display preference (such as a chosen theme) as client-side state belonging to the requester's own
browser; doing so SHALL NOT create, modify, or delete any file under the store root, and SHALL NOT be read as
reading or writing store content.

#### Scenario: A non-read method is refused before it reaches a handler
- **WHEN** a `POST`, `PUT`, `PATCH`, or `DELETE` request is sent to any path the server would otherwise
  serve, other than a `POST` to the decision route of a store that declares change approval, to the MCP routes of a
  store that declares the MCP surface, or to `/hooks/github` on a server with a webhook secret
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

### Requirement: A pull request's pages are previewable from its pushed branch
`ctxr serve` SHALL address the published pages of each open pull request on its store under
`/preview/pull/<number>/`, rendered from the pull request's current head on the forge, so a page written in a session
in any container, including a session inside another store's mount, is previewable at the address of the store that
will publish it. Only published pages SHALL be addressable there, as for session worktrees.

#### Scenario: A page from a session in another container is previewable
- **WHEN** pull request 7 on the store was pushed from a session whose worktree is not on this server, and it adds a page
- **THEN** a `GET` under `/preview/pull/7/` naming that page returns it, byte-identical to what `/publish/` will serve once it lands

### Requirement: A pull request preview is fetched when it is opened
When a pull request preview is requested, the server SHALL ask the forge for the pull request's current head and, if
its clone lacks that commit, fetch it before answering, into a ref namespace of its own that leaves the clone's
branches and working tree untouched. It SHALL reuse the head it last read for at most 15 seconds. An unknown pull
request SHALL receive a `404`.

#### Scenario: A push is visible on the next open
- **WHEN** a commit changing a page is pushed to pull request 7's branch and its preview is opened more than 15 seconds after it was last opened
- **THEN** the preview shows the pushed change

### Requirement: Only a signed forge delivery reaches the webhook
When the server's environment provides a webhook secret, `POST /hooks/github` SHALL accept GitHub push and
pull-request deliveries whose `X-Hub-Signature-256` verifies against that secret, and SHALL answer `401`, doing
nothing, for any other. Without a secret, the route SHALL NOT exist.

#### Scenario: An unsigned delivery does nothing
- **WHEN** a `POST /hooks/github` arrives with a missing or wrong signature
- **THEN** the response is `401`, and no run starts and nothing is fetched

#### Scenario: Without a secret there is no webhook route
- **WHEN** the server's environment provides no webhook secret
- **THEN** `POST /hooks/github` is answered `405`, as any other non-read request

### Requirement: A verified push brings the server up to date at once
A verified push to the default branch SHALL start a store-update run at once, coalesced with any run in progress. A
verified push to another branch SHALL fetch that branch for its preview. The server SHALL use a delivery only as a
hint of which branch changed, and SHALL read every change from the forge itself.

#### Scenario: A merge is served without waiting for the timer
- **WHEN** a verified push delivery for the default branch arrives
- **THEN** a store-update run starts within seconds, without waiting for `serve.sync_minutes`

### Requirement: A merged pull request's preview points to the published page
A `GET` under `/preview/pull/<number>/` for a pull request that has merged SHALL redirect to the same page's address
under `/publish/`, so a shared preview link keeps working after the change lands. A pull request closed without
merging SHALL receive a `404`.

#### Scenario: A preview link opened after the merge reaches the published page
- **WHEN** pull request 7, which added a page, has merged, and its preview address for that page is opened
- **THEN** the response redirects to that page under `/publish/`
