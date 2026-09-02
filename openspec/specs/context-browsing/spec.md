# context-browsing Specification

## Purpose

Governs how store content — retrievable notes, the catalog, the graph's human-readable document, and
published pages — is addressed by URL, rendered for a browser, and cross-linked, for a human reading
their own store. This capability defines no requester concept and enforces no per-requester filtering,
which is what makes serving possible without first building a filtered per-requester materialization
(see `context-projection`, proposed separately) — a fact that holds regardless of which address the
server is bound to. It binds to loopback by default; an operator MAY widen that bind address explicitly
when they have arranged their own trusted front end (a firewall, a tunnel, a reverse proxy) to account
for the filtering this capability still does not do. A networked, requester-scoped serving mode with its
own filtering is out of scope here and would need its own capability built on that materialization, not
an extension of this one's default.

## Requirements

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

### Requirement: Only read-only HTTP methods are served
`ctxr serve` SHALL respond to `GET` and `HEAD` requests only. Every other HTTP method SHALL receive a
`405` response and SHALL NOT reach any route handler capable of reading or writing store content.

#### Scenario: A non-read method is refused before it reaches a handler
- **WHEN** a `POST`, `PUT`, `PATCH`, or `DELETE` request is sent to any path the server would otherwise
  serve
- **THEN** the response is `405`, and no store content is read or written as a result of that request

### Requirement: The note route addresses exactly the store's enumerated notes
The notes route SHALL serve exactly the set of notes the store's own note enumeration produces, and
SHALL NOT expose any other path under the store root. A request for a path outside that enumeration
SHALL receive a `404`, indistinguishable in status from a request for a path that does not exist at
all.

#### Scenario: An enumerated note is served
- **WHEN** a `GET` request names the URL path corresponding to a note the store's enumeration includes
- **THEN** the response renders that note's content

#### Scenario: A tool-owned or excluded path is not addressable
- **WHEN** a `GET` request names a URL path corresponding to `contexture.yaml`, a path under the git
  directory, a session worktree, or any other path the store's enumeration excludes
- **THEN** the response is `404`, identical to a request for a path that does not exist

### Requirement: A note renders with its wikilinks resolved
A rendered note SHALL render each wikilink it contains as a hyperlink to that target's note route when
the target resolves to exactly one note, using the same resolution the store's graph build performs. A
wikilink that resolves to no note, or to more than one note sharing that stem, SHALL render as visibly
distinguished markup naming which of the two failure kinds occurred, and SHALL NOT render as a working
link to an arbitrary or incorrect target.

#### Scenario: A resolvable wikilink becomes a working link
- **WHEN** a note contains a wikilink whose target resolves to exactly one other note
- **THEN** the rendered page contains a hyperlink to that note's route

#### Scenario: An unresolvable wikilink is visibly marked, not silently dropped
- **WHEN** a note contains a wikilink whose target matches no note in the store
- **THEN** the rendered page shows that link target in visibly distinguished markup naming it
  unresolved, and does not render it as a hyperlink

#### Scenario: An ambiguous wikilink is visibly marked, not resolved by guessing
- **WHEN** a note contains a wikilink whose target matches more than one note's filename stem
- **THEN** the rendered page shows that link target in visibly distinguished markup naming it
  ambiguous, and does not render it as a hyperlink to either candidate

### Requirement: Published pages are served byte-verbatim
A request under the publish route SHALL return the requested published-page file exactly as it exists
under the store's configured publish path, with no markdown rendering, template wrapping, or content
transformation applied. A request for a path that would resolve outside the configured publish path
SHALL receive a `404` rather than any file outside it.

#### Scenario: A published page is served unchanged
- **WHEN** a `GET` request names a file under a published page's folder
- **THEN** the response body is byte-identical to that file's contents on disk

#### Scenario: A request cannot escape the publish path
- **WHEN** a `GET` request's path, after resolution, would name a file outside the store's configured
  publish path
- **THEN** the response is `404`, and no file outside the publish path is read

### Requirement: An unbuilt derived artifact reports how to build it
A request for a derived-document route (the catalog or the graph document) whose underlying artifact
has not yet been built SHALL receive a response naming the specific command that builds it, rather than
an ordinary `404` indistinguishable from a route that does not exist.

#### Scenario: The graph document route names its build command before the graph is built
- **WHEN** a `GET` request is made to the graph document route and `ctxr graph build` has never run
- **THEN** the response names `ctxr graph build` as the command that produces the missing document

### Requirement: The command reports its bound address through the standard envelope before serving
`ctxr serve` SHALL emit exactly one `--json` envelope, containing the bound URL, port, and store root,
once its listener is ready to accept connections, and before it begins serving requests. Every request
it subsequently handles SHALL be logged to stderr, if at all, and SHALL NOT write to stdout.

#### Scenario: The envelope is emitted once, at bind time
- **WHEN** `ctxr serve --json` starts
- **THEN** stdout receives exactly one JSON value, containing the bound URL, before any request is
  served

#### Scenario: Serving a request never writes to stdout
- **WHEN** `ctxr serve` has emitted its envelope and is now serving requests
- **THEN** no subsequent request handling writes anything to stdout
