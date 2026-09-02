## ADDED Requirements

### Requirement: Every served page carries the same navigation in one fixed order
Every HTML response the server produces SHALL include a navigation region naming the four content
areas it serves — published pages, notes, the catalog, and the graph document — in that order. That
region SHALL be produced by the page shell every HTML route renders through, not assembled by
individual route handlers, so no HTML route can render a response without it.

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
publish path's immediate children as pages.

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
