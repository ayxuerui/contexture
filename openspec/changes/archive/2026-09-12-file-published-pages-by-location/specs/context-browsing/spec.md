## MODIFIED Requirements

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
