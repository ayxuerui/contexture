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
`405` response and SHALL NOT reach any route handler capable of reading or writing store content. A
`GET` request MAY cause the response to record a display preference (such as a chosen theme) as
client-side state belonging to the requester's own browser; doing so SHALL NOT create, modify, or
delete any file under the store root, and SHALL NOT be read as reading or writing store content.

#### Scenario: A non-read method is refused before it reaches a handler
- **WHEN** a `POST`, `PUT`, `PATCH`, or `DELETE` request is sent to any path the server would otherwise
  serve
- **THEN** the response is `405`, and no store content is read or written as a result of that request

#### Scenario: A GET that records a display preference writes no store content
- **WHEN** a `GET` request selects a display preference this capability offers, such as a theme
- **THEN** the response records that choice only as state belonging to the requester's own browser, and
  no file under the store root is created, modified, or deleted

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

#### Scenario: The browsing surface's navigation and display preferences do not reach a published page
- **WHEN** a published page is requested
- **THEN** the response carries none of the navigation region, theme, or navigation-visibility state
  this capability applies to pages it renders through the shell, and the absence of any of these in a
  published page's own response is not a defect

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

### Requirement: Every served page carries the same navigation in one fixed order
Every HTML response the server produces through the shell SHALL include a navigation region naming the
four content areas it serves — published pages, notes, the catalog, and the graph document — in that
order. That region SHALL be produced by the page shell every HTML route renders through, not assembled
by individual route handlers, so no HTML route can render a response without it. The navigation SHALL
be possible to show and hide without any client-side script, in a way that behaves correctly whether
the viewport is wide enough to show it alongside the content or not.

#### Scenario: A note page carries the same navigation as the index
- **WHEN** a `GET` request renders a note
- **THEN** the response contains the same navigation region the index page contains, naming published
  pages, notes, the catalog, and the graph document in that order

#### Scenario: The index page's sections follow the navigation's order
- **WHEN** a `GET` request renders the index page
- **THEN** its content sections appear in the order the navigation names them: published pages first,
  then notes, then the catalog, then the graph document

#### Scenario: A content area holding nothing is still named
- **WHEN** the store contains no published pages
- **THEN** the navigation still names the published-pages area and reports it as empty, rather than
  omitting the area

#### Scenario: The navigation can be shown and hidden without client-side script
- **WHEN** a reader activates the navigation's show/hide control in a browser with client-side
  scripting disabled
- **THEN** the navigation is revealed if it was hidden, or hidden if it was revealed

#### Scenario: A viewport too narrow to show the navigation alongside the content starts with it hidden
- **WHEN** a page is rendered at a viewport too narrow to show the navigation alongside the content
- **THEN** the navigation starts hidden, and the show/hide control reveals it without navigating away
  from the current page

#### Scenario: A collapsed navigation persists across navigation at a wide viewport
- **WHEN** a reader hides the navigation at a viewport wide enough to show it alongside the content,
  then navigates to a different page served through the shell
- **THEN** the navigation remains hidden on the new page, until the reader shows it again

### Requirement: The browsing surface's display theme is chosen without client-side script
`ctxr serve` SHALL offer a reader a choice of light, dark, or following the operating system's
preference, for every page it renders through the shell (the index, notes, the catalog, and the graph
document). The choice SHALL be made through an ordinary link, resolved by the server on each request,
and SHALL NOT require any client-side script to take effect. Once made, the choice SHALL persist across
navigation to another page served by this capability, by a mechanism the server itself reads on each
request rather than one a script keeps.

#### Scenario: A reader chooses a theme
- **WHEN** a reader activates the dark-theme link on any page this capability serves through the shell
- **THEN** that response, and every subsequent page served through the shell, renders in the dark
  palette until a different theme is chosen

#### Scenario: The choice persists across navigation
- **WHEN** a reader has chosen a theme and then navigates to a different page this capability serves
  through the shell
- **THEN** the new page renders in the previously chosen theme, with no further action from the reader

#### Scenario: The default follows the operating system
- **WHEN** a reader has made no theme choice
- **THEN** the page renders according to the requesting browser's own light/dark preference

#### Scenario: An unrecognized persisted value falls back to following the system
- **WHEN** a request carries a persisted theme value this capability does not recognize
- **THEN** the page renders as if no choice had been made, following the operating system preference,
  rather than failing the request

#### Scenario: Choosing a theme writes no store content
- **WHEN** a reader chooses any theme
- **THEN** no file under the store root is created, modified, or deleted as a result

#### Scenario: Choosing a theme works with scripting disabled
- **WHEN** a reader chooses a theme in a browser with client-side scripting disabled
- **THEN** the choice takes effect and persists exactly as it would with scripting enabled

### Requirement: Notes are navigable by their folder structure
The navigation SHALL present notes grouped by their store-relative directory path, nested to the full
depth those paths carry, rather than as a flat list of whole paths. The grouping SHALL be derived from
the same note enumeration the note route is keyed by, so a path that enumeration excludes is absent
from the navigation by construction rather than by a second exclusion check. A group SHALL be
collapsible and expandable without any client-side script.

#### Scenario: A note in a nested directory appears under that directory's groups
- **WHEN** the store contains a note at `folder-a/folder-b/example.md`
- **THEN** the navigation presents it inside a group for `folder-a` containing a group for `folder-b`,
  rather than as a single entry naming the whole path

#### Scenario: A note at the store root appears in no folder group
- **WHEN** the store contains a note directly at the store root
- **THEN** the navigation presents it as an entry at the top level of the notes area, not inside a
  folder group

#### Scenario: An excluded path appears in no group
- **WHEN** the store contains a path the note enumeration excludes
- **THEN** that path appears in no group in the navigation, by the same enumeration that keeps it out
  of the note route, and the navigation offers no link the note route would answer with `404`

#### Scenario: Groups collapse without client-side script
- **WHEN** the navigation is rendered in a browser with scripting disabled
- **THEN** a folder group can still be collapsed and expanded

### Requirement: Published pages are navigable by their folder structure
The navigation SHALL treat every directory under the store's configured publish path that contains an
index page as a published page, address it by its full path under the publish route, and group pages
by the directories containing them to the full depth those paths carry — rather than treating only the
publish path's immediate children as pages. A page entry SHALL be labelled by the name the page itself
declares, when it declares one, and by its directory segment otherwise.

#### Scenario: A nested published page is reachable at its full path
- **WHEN** the configured publish path contains an index page at `folder-a/folder-b/example-page/`
- **THEN** the navigation presents that page inside a group for `folder-a` containing a group for
  `folder-b`, linking to it at its full path under the publish route

#### Scenario: A page directly under the publish path still appears at the top level
- **WHEN** the configured publish path contains an index page in one of its immediate children
- **THEN** the navigation presents that page at the top level of the published-pages area, unchanged
  from a store whose publish path has no nesting

#### Scenario: A directory holding no index page is a group, not a page
- **WHEN** a directory under the configured publish path contains other directories or files but no
  index page of its own
- **THEN** the navigation presents it as a grouping directory rather than as a page entry linking to an
  index page that does not exist

#### Scenario: A page's declared name labels its navigation entry
- **WHEN** a published page's index page declares a name for itself
- **THEN** the navigation labels that page's entry with the declared name, not its directory segment

#### Scenario: A page that declares no name falls back to its directory segment
- **WHEN** a published page's index page declares no name for itself
- **THEN** the navigation labels that page's entry with its directory segment, exactly as a page whose
  index page declares no name renders today
