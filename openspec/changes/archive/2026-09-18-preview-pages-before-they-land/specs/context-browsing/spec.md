## ADDED Requirements

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

## MODIFIED Requirements

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
