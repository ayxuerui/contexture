## ADDED Requirements

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

## MODIFIED Requirements

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
