## Purpose

Governs how store content — retrievable notes, the catalog, the graph's human-readable document, and
published pages — is addressed by URL, rendered for a browser, and cross-linked, for a human reading
their own store on their own machine. This capability is deliberately scoped to that single-operator,
loopback-only posture: it defines no requester concept and enforces no per-requester filtering, which
is what makes serving possible without first building a filtered per-requester materialization (see
`context-projection`, proposed separately). A future networked, requester-scoped serving mode is out of
scope here and would need its own capability built on that materialization, not an extension of this
one's loopback assumption.

## ADDED Requirements

### Requirement: The server binds only to the loopback interface
`ctxr serve` SHALL bind its HTTP listener to the loopback interface only, and SHALL provide no
configuration flag or config key capable of widening that bind address. This is the entire security
boundary this capability provides; no requirement in this capability SHALL be read as providing
protection against a requester who can already reach the bound address.

#### Scenario: The listening address is loopback
- **WHEN** `ctxr serve` starts
- **THEN** the address it reports and binds to is a loopback address, and no command-line option or
  configuration value changes that address

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
