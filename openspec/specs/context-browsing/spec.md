# context-browsing Specification

## Purpose

Governs how store content — retrievable notes, the catalog, the graph's human-readable document, and
published pages — is addressed by URL, rendered for a browser, and cross-linked, for a human reading
their own store. This capability's routes define no requester concept and enforce no per-requester filtering,
which is what makes serving possible without first building a filtered per-requester materialization
(see `context-projection`, proposed separately) — a fact that holds regardless of which address the
server is bound to. It binds to loopback by default; an operator MAY widen that bind address explicitly
when they have arranged their own trusted front end (a firewall, a tunnel, a reverse proxy) to account
for the filtering this capability still does not do. A networked, requester-scoped serving mode with its
own filtering is out of scope here and would need its own capability built on that materialization, not
an extension of this one's default. The `/approve/` routes `ctxr serve` also answers are not this
capability's: `change-approval` governs them, and they verify who is asking — to decide who may record a
decision, not to filter what anyone may read.

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

### Requirement: Published pages held in a session worktree are previewable before they land
`ctxr serve` SHALL address the published pages held in each of the store's session worktrees under a
preview route distinct from the publish route, so a page can be read in a browser before it reaches the
store's default branch. The worktrees it enumerates SHALL be the directories under the store's
configured session worktrees path, named by configuration rather than by a hardcoded directory name,
and each SHALL be addressed under the preview route by its own directory name. Within a worktree, a
page SHALL be addressed at its path under that worktree's own configured publish path. A session
worktree holding no published page SHALL contribute no preview entry at all.

This route SHALL expose published pages and nothing else: no note, catalog section, graph document, or
configuration file held in a session worktree SHALL become addressable through it.

#### Scenario: A page that exists only in a session worktree is reachable
- **WHEN** a session worktree holds a published page that does not exist under the store root's own
  publish path
- **THEN** a `GET` request under the preview route naming that worktree and that page's path returns the
  page

#### Scenario: A preview is byte-identical to what the publish route will serve once it lands
- **WHEN** a `GET` request names a file under a published page's folder inside a session worktree
- **THEN** the response body is byte-identical to that file's contents on disk, with no markdown
  rendering, template wrapping, navigation region, or theme applied — the same treatment the publish
  route gives a page that has already landed

#### Scenario: A page is previewable regardless of how far toward landing it has got
- **WHEN** a session worktree holds a published page whose files are uncommitted, or committed but not
  pushed, or pushed and under review but not yet merged
- **THEN** the preview route serves that page identically in all three cases, and this capability
  consults no pull request, review, or remote state in order to decide

#### Scenario: A request cannot escape a session worktree's publish path
- **WHEN** a `GET` request's path, after resolution, would name a file outside the configured publish
  path of the session worktree it names
- **THEN** the response is `404`, and no file outside that publish path is read

#### Scenario: A request naming no known session worktree is refused
- **WHEN** a `GET` request under the preview route names a directory that is not one of the directories
  under the store's configured session worktrees path
- **THEN** the response is `404`, identical to a request for a path that does not exist

#### Scenario: A session worktree holding no published page contributes nothing
- **WHEN** a session worktree exists but holds no published page
- **THEN** it appears nowhere in the navigation, and the preview route answers `404` for every path
  naming it

#### Scenario: Store content other than published pages stays unreachable in a session worktree
- **WHEN** a `GET` request names a note, catalog section, graph document, or `contexture.yaml` held
  inside a session worktree, whether under the preview route or the note route
- **THEN** the response is `404` — this requirement widens what is addressable only to published pages,
  and the note enumeration continues to exclude session worktrees entirely

#### Scenario: Serving from inside a session worktree previews nothing further
- **WHEN** `ctxr serve` is started from inside a session worktree, so that worktree is itself the store
  root being served
- **THEN** that worktree's own published pages are served under the publish route as they are for any
  store root, and the preview area is empty rather than naming the worktree a second time

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
five content areas it serves — published pages, pages previewed from a session worktree, notes, the
catalog, and the graph document — in that order. That region SHALL be produced by the page shell every
HTML route renders through, not assembled by individual route handlers, so no HTML route can render a
response without it. The navigation SHALL be possible to show and hide without any client-side script,
in a way that behaves correctly whether the viewport is wide enough to show it alongside the content or
not.

#### Scenario: A note page carries the same navigation as the index
- **WHEN** a `GET` request renders a note
- **THEN** the response contains the same navigation region the index page contains, naming published
  pages, previewed pages, notes, the catalog, and the graph document in that order

#### Scenario: The index page's sections follow the navigation's order
- **WHEN** a `GET` request renders the index page
- **THEN** its content sections appear in the order the navigation names them: published pages first,
  then previewed pages, then notes, then the catalog, then the graph document

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
A folder group SHALL be labelled by the declared name of the configured taxonomy layer whose path
it matches, when one matches, and by its own directory segment otherwise. Groups SHALL be ordered
by their directory segment rather than by that label, so labelling a group changes what it is
called and never where it appears.

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

#### Scenario: A folder group matching a configured taxonomy layer shows that layer's declared name
- **WHEN** the store's configuration declares a taxonomy layer whose path is `ctx-a` and whose
  declared name differs from that path, and the store contains a note under `ctx-a/`
- **THEN** the navigation labels that group with the layer's declared name rather than with `ctx-a`

### Requirement: Published pages are navigable by their folder structure
The navigation SHALL treat every directory under the store's configured publish path that contains an
index page as a published page, address it by its full path under the publish route, and group pages
by the directories containing them to the full depth those paths carry — rather than treating only the
publish path's immediate children as pages. A page entry SHALL be labelled by the name the page itself
declares, when it declares one, and by its directory segment otherwise.
A folder group SHALL be labelled by the declared name of the configured taxonomy layer whose path
it matches, when one matches, and by its own directory segment otherwise. Groups SHALL be ordered
by their directory segment rather than by that label, so labelling a group changes what it is
called and never where it appears.

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

#### Scenario: A grouping directory matching a configured taxonomy layer shows that layer's declared name
- **WHEN** the store's configuration declares a taxonomy layer whose path is `ctx-a` and whose
  declared name differs from that path, and a published page is filed under `ctx-a/`
- **THEN** the navigation labels that grouping directory with the layer's declared name rather than
  with `ctx-a`

#### Scenario: A grouping directory matching no configured layer keeps its directory segment
- **WHEN** a published page is filed under a grouping directory whose path matches no configured
  taxonomy layer's path, including in a store whose configuration declares no layers at all
- **THEN** the navigation labels that grouping directory with its own directory segment, exactly as it
  renders in a store that declares no layer names

#### Scenario: Labelling a grouping directory does not move it
- **WHEN** two sibling grouping directories are labelled by declared names whose order differs from
  the order of their directory segments
- **THEN** the navigation presents them in their directory segments' order, unchanged from a store
  that declares no layer names

### Requirement: Previewable pages are navigable by worktree and folder
The navigation SHALL group previewable pages first by the session worktree holding them, and then by
the directories containing them within that worktree's publish path, nested to the full depth those
paths carry. A page entry SHALL be labelled by the name the page itself declares, when it declares one,
and by its directory segment otherwise — the same rule the published-pages area follows. A folder group
within a worktree SHALL be labelled by the declared name of the configured taxonomy layer whose path it
matches, when one matches, and by its own directory segment otherwise, so a folder is called the same
thing in this area as it is in the published-pages area.

#### Scenario: A previewable page appears under the worktree holding it
- **WHEN** a session worktree holds a published page at `ctx-a/example-page/`
- **THEN** the navigation presents that page inside a group naming that worktree, containing a group
  for `ctx-a`, linking to the page at its full path under the preview route

#### Scenario: A previewed page's declared name labels its entry
- **WHEN** a published page inside a session worktree declares a name for itself
- **THEN** the navigation labels that page's entry with the declared name, not its directory segment

#### Scenario: A folder reads the same in both page areas
- **WHEN** the store's configuration declares a taxonomy layer whose path is `ctx-a` and whose declared
  name differs from that path, and a published page is filed under `ctx-a/` inside a session worktree
- **THEN** the navigation labels that grouping directory with the layer's declared name, exactly as it
  labels the same folder in the published-pages area

#### Scenario: The preview area is named even when nothing is in flight
- **WHEN** the store has no session worktree holding a published page
- **THEN** the navigation still names the preview area and reports it as empty, rather than omitting the
  area

### Requirement: Each session worktree's knowledge changes can be viewed in a derived view
As a convenience while a session's worktree exists and the server is reachable, `ctxr serve` SHALL answer a
review route for each directory under the store's configured session worktrees
path, addressed by that directory's name — the same worktrees and the same naming the preview route uses. The
response SHALL render the graph delta that `ctxr graph diff` reports for that worktree, comparing its `HEAD`
against `origin/` followed by the configured default branch when the repository has that ref, and against the
configured default branch itself otherwise. The view's facts SHALL be exactly the facts that command reports
for the same two commits. Serving the view SHALL NOT fetch, check out, or write anything. The view is not the record of the change. The
knowledge-changes block in the pull request body is, and the view SHALL NOT be relied on once the worktree is
reclaimed.

The view SHALL state the full base and head commit ids it was computed from. When the request carries a head
commit id (the form the report's review address takes) that differs from the worktree's current `HEAD`, the view
SHALL state that the branch has moved past the recorded head, naming both ids, and SHALL show the delta for the
current `HEAD`. This statement SHALL be produced by the server and SHALL require no client-side script.

The view SHALL be derived from the delta alone: no text an agent authored for the change — a pull request body,
a commit message, a file the change adds for the purpose — SHALL be read into it. It SHALL render through the
same shell as every other HTML route, carrying the navigation and the display theme. Its primary content SHALL
be lists and tables, and all of it SHALL be readable with client-side scripting disabled. It MAY add a diagram
of the link delta as a fenced `mermaid` block. Where the browsing surface does not draw such a block, its source
text SHALL be what the reader sees, and the lists and tables SHALL still carry every fact the diagram depicts.

The view SHALL expose paths, link targets, edge types, counts and the source entries the delta reports, and no
note body. A path SHALL link to the note route only when the note route answers for that path. A note that
exists only in the worktree SHALL be shown as unlinked text, so this route widens nothing the note route
serves.

A request naming a directory that is not one of the session worktrees SHALL receive `404`. A session worktree
whose delta is empty SHALL render a view saying that it has no knowledge changes, rather than `404`.

#### Scenario: A worktree's review view matches the command
- **WHEN** a session worktree's `HEAD` adds a note and archives another relative to the default branch, and its
  review route is requested
- **THEN** the view lists the added note and the archived note with both its paths, matching what
  `ctxr graph diff --since origin/<default>` reports in that worktree

#### Scenario: The view names the commits it compared
- **WHEN** a session worktree's review route is requested
- **THEN** the view states the full base and head commit ids it was computed from

#### Scenario: The view says when the branch has moved on
- **WHEN** the review address carrying head commit `h1` is requested after the worktree's branch gained a
  commit, so its `HEAD` is now `h2`
- **THEN** the view states that the branch has moved past `h1`, names `h1` and `h2`, and shows the delta for
  `h2`

#### Scenario: A recorded head that is current gives no notice
- **WHEN** the review address carries the head commit id that is still the worktree's `HEAD`
- **THEN** the view carries no moved-on notice

#### Scenario: The view reads nothing an agent wrote about the change
- **WHEN** the worktree's latest commit message and its open pull request body both describe changes the delta
  does not contain
- **THEN** the view shows only what the delta contains, and none of that text

#### Scenario: The view works with scripting disabled
- **WHEN** the review route is rendered in a browser with client-side scripting disabled
- **THEN** every reported fact is visible as list or table content, and the theme choice and navigation toggle
  work as on any other shell page

#### Scenario: The diagram degrades to its source
- **WHEN** the view carries a link-delta diagram and the browsing surface has no diagram renderer
- **THEN** the reader sees the fenced block's source text, and every edge the diagram depicts is also listed in
  the view's tables

#### Scenario: A note only in the worktree is not linked
- **WHEN** the delta lists a note added in the worktree that does not exist in the served checkout
- **THEN** its path appears as text with no link, and the note route still answers `404` for it

#### Scenario: An unknown worktree is refused
- **WHEN** the review route names a directory that is not under the configured session worktrees path
- **THEN** the response is `404`

#### Scenario: A worktree with no knowledge changes says so
- **WHEN** a session worktree's `HEAD` changes no admitted note relative to the default branch
- **THEN** the review route answers `200` with a view stating there are no knowledge changes

#### Scenario: Serving the view leaves the worktree untouched
- **WHEN** the review route is requested for a worktree with uncommitted work
- **THEN** that worktree's `git status --porcelain` output and its derived cache paths are unchanged
  afterward, and the uncommitted work does not appear in the view

### Requirement: A mermaid block in a rendered document is readable without script and drawn with it
Every document `ctxr serve` renders from markdown through the shell (a note, a catalog section, and the graph
document) SHALL render a fenced code block whose info string's first word is `mermaid` as a block marked as a
diagram, carrying the block's source text, HTML-escaped and otherwise unchanged. With client-side scripting disabled,
that source text SHALL be what the reader sees. With scripting enabled, the page SHALL replace the source with the drawn
diagram. A block the renderer cannot draw SHALL stay visible as its source text, marked as not drawn, and SHALL NOT be
removed or left empty. A fenced block in any other language SHALL render as an ordinary code block, exactly as it does
when no mermaid block is present. A page whose rendered body contains no mermaid block SHALL reference no diagram
script at all.

#### Scenario: With scripting disabled the diagram's source is readable
- **WHEN** a note containing a fenced `mermaid` block is requested by a browser with client-side scripting disabled
- **THEN** the page shows the block's source text, unchanged apart from HTML escaping, inside a block marked as a
  diagram

#### Scenario: With scripting enabled the diagram is drawn
- **WHEN** the same note is requested by a browser with client-side scripting enabled
- **THEN** the block's source is replaced by the drawn diagram

#### Scenario: Source text cannot inject markup
- **WHEN** a `mermaid` block's source contains `<script>` or any other HTML markup
- **THEN** the server's response carries that text HTML-escaped, and with scripting enabled the drawn diagram never
  renders that markup as markup and never loads or runs anything from it; the markup is shown as text or removed

#### Scenario: A block that cannot be drawn stays readable
- **WHEN** a `mermaid` block contains source the renderer cannot parse, and the page is viewed with scripting enabled
- **THEN** the block's source text remains visible, marked as not drawn, and every other diagram on the page is still
  drawn

#### Scenario: A fenced block in another language is unaffected
- **WHEN** a note contains a fenced block whose info string is `dot`, `d2`, `plantuml`, or any language other than
  `mermaid`
- **THEN** it renders as an ordinary code block, identical to how it rendered before this requirement existed

#### Scenario: A page with no diagram loads no renderer
- **WHEN** a note, catalog section, graph document, or the index page contains no `mermaid` block
- **THEN** its response references no diagram script

#### Scenario: The graph document and catalog draw diagrams the same way
- **WHEN** the graph document or a catalog section contains a fenced `mermaid` block
- **THEN** it is rendered by the same rule a note's block is, readable without script and drawn with it

#### Scenario: A published page carrying a mermaid block is still served byte-verbatim
- **WHEN** a published page's file, under the publish route or the preview route, contains the text of a `mermaid`
  block
- **THEN** the response body is byte-identical to that file on disk, with no diagram markup or script added

### Requirement: Script on a shell page is served by this server and only enhances
The only client-side script a page served through the shell references SHALL be served by this server itself, at a
route under its own asset path, from files belonging to the installed `ctxr` package and its installed dependencies.
It SHALL NOT be fetched from any external network address or content delivery network. No `src` or `href` attribute
the shell or the diagram rendering emits SHALL name an external network address, and drawing a diagram SHALL NOT cause
the browser to request anything from an address other than the server's own. Script SHALL only enhance a page: every
behavior another requirement in this capability says works without client-side script, including choosing a theme and
showing, hiding, and collapsing the navigation, SHALL keep working with scripting disabled on a page that carries a
diagram.

#### Scenario: The renderer is served from the installed package
- **WHEN** a `GET` request names the route the shell references for the diagram renderer
- **THEN** the response is `200` with a JavaScript content type, and its body is byte-identical to the renderer file
  in the installed dependency the `ctxr` package declares

#### Scenario: A page with a diagram names no external address
- **WHEN** a page containing a `mermaid` block is rendered through the shell
- **THEN** every `src` and `href` attribute the shell and the diagram markup emit names a path on this server, and none
  names an `http://` or `https://` address

#### Scenario: Drawing a diagram makes no outside request
- **WHEN** a page containing a `mermaid` block is loaded with scripting enabled
- **THEN** every request the browser makes while loading the page and drawing the diagram is addressed to the server
  that served the page

#### Scenario: Theme and navigation still work without script on a page with a diagram
- **WHEN** a reader, with client-side scripting disabled, chooses a theme or shows or hides the navigation on a page
  containing a `mermaid` block
- **THEN** the choice takes effect exactly as it does on a page with no diagram

#### Scenario: An asset request reads no store content
- **WHEN** a `GET` request names the diagram renderer or the diagram page script
- **THEN** the response is served without reading any file under the store root

### Requirement: A drawn diagram follows the display theme
A diagram drawn on a page served through the shell SHALL use colors that match the theme the page renders in: the
light palette when the light theme is chosen, the dark palette when the dark theme is chosen, and, when the theme
follows the operating system, the palette matching the requesting browser's light/dark preference. The theme SHALL be
resolved from the same choice the server already applied to the page, never from a second preference the script keeps.

#### Scenario: A chosen dark theme draws a dark diagram
- **WHEN** a reader has chosen the dark theme and opens a note containing a `mermaid` block with scripting enabled
- **THEN** the drawn diagram's text, lines, and fills use the dark palette, legible against the dark page background

#### Scenario: A chosen light theme draws a light diagram
- **WHEN** a reader has chosen the light theme and opens a note containing a `mermaid` block with scripting enabled,
  in a browser whose own preference is dark
- **THEN** the drawn diagram uses the light palette, matching the page rather than the browser preference

#### Scenario: Following the system draws in the system's palette
- **WHEN** a reader has made no theme choice, and opens a note containing a `mermaid` block with scripting enabled in a
  browser whose preference is dark
- **THEN** the drawn diagram uses the dark palette, as the rest of the page does

#### Scenario: A system preference change while the page is open redraws the diagram
- **WHEN** the theme follows the operating system and the browser's light/dark preference changes while a page with a
  drawn diagram is open
- **THEN** the diagram is redrawn in the palette matching the new preference, without the page being reloaded
