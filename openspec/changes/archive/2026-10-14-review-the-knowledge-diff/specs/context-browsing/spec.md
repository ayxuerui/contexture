## ADDED Requirements

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
