## ADDED Requirements

### Requirement: The graph delta between two commits is reported
`ctxr graph diff --since <ref> [--until <ref>]` SHALL report how the store's knowledge changed between two
commits: the head, which is the commit `--until` names and `HEAD` when it is absent, and the base, which is the
merge base of the `--since` ref and the head. Every form of the report SHALL name the full commit ids of the
base and the head, so the range can be re-run exactly from any checkout of the repository. Both sides SHALL be enumerated by
the same note-admission rule the graph build uses, read under the store's current configuration, so a path
that configuration excludes appears on neither side. The command SHALL require `--since` and refuse with a
usage error when it is absent, and SHALL refuse with an error naming the ref when either ref does not
resolve to a commit.

The report SHALL carry, each sorted by path and then by the remaining fields:

- **Notes** that were added, removed, modified, moved, or archived. A move is a rename git's rename detection
  reports between two admitted note paths. An archive is a rename from a path outside the configured archive
  destination to a path beneath it, reported with its old and new path, and never also counted as a move or a
  removal.
- **Links** added and removed, each with its source note, its target note and its edge type. Before
  comparison, every base-side path SHALL be carried through the reported moves and archives, so that moving a
  note whose links still resolve reports no link change.
- **Dangling links** introduced and resolved, each with its source note, its unresolved target and the reason
  it does not resolve.
- **Notes whose inbound links changed**, each with the source notes gained and lost, and whether the note
  carries a rollup region on the head side.
- **Rollups touched**: notes whose rollup region (the region `ctxr rollup write` writes) was added, removed or
  changed between the two sides.
- **Sources cited**: for each added or modified note, the entries of the provenance field defined by the
  context-ingest specification that it carries on the head side but not on the base side.
- **Counts** of each of the above.

The command SHALL report facts only. It SHALL carry no severity, score, ranking or recommendation, SHALL emit
no finding, SHALL exit successfully whenever both sides could be read, and SHALL gate nothing.

#### Scenario: An added note and its links are reported
- **WHEN** the head adds `ctx-a/new.md` linking `[[existing]]` and `[[missing]]`, where `existing` resolves and
  `missing` does not
- **THEN** the report lists `ctx-a/new.md` as added, one added link from it to the existing note, and one
  introduced dangling link to `missing` with reason not found

#### Scenario: A moved note keeps its links
- **WHEN** the head renames `ctx-a/old.md` to `ctx-b/old.md` with its content unchanged, and other notes link
  to it by its unchanged stem
- **THEN** the report lists one move from `ctx-a/old.md` to `ctx-b/old.md` and no added or removed link

#### Scenario: An archived note is reported as archived
- **WHEN** the head moves `ctx-a/done.md` to its path beneath the configured archive destination
- **THEN** the report lists it once, as archived, with both paths, and not as a move or a removal

#### Scenario: A link moved between relation sections changes type
- **WHEN** a note's link to `other` moves from under one relation-vocabulary heading to under another
- **THEN** the report lists one removed link of the first type and one added link of the second, both from
  that note to `other`

#### Scenario: A resolved dangling link is reported
- **WHEN** the base has a note linking `[[later]]` that does not resolve, and the head adds a note whose stem
  is `later`
- **THEN** the report lists that dangling link as resolved and the corresponding link as added

#### Scenario: A rewritten rollup is reported
- **WHEN** the head changes the text inside a note's rollup region
- **THEN** the report lists that note under rollups touched

#### Scenario: A newly cited source is reported
- **WHEN** a modified note's provenance field gains one entry between the two sides
- **THEN** the report lists that note with exactly that entry under sources cited

#### Scenario: An excluded path appears on neither side
- **WHEN** the change adds a markdown file under a path the configuration excludes from retrieval
- **THEN** the report does not list it, and no link from or to it appears

#### Scenario: The report names both commits in full
- **WHEN** `ctxr graph diff --since <ref>` runs in any of its output forms
- **THEN** the output names the full commit id of the base and of the head it compared

#### Scenario: An explicit range is re-run exactly
- **WHEN** `ctxr graph diff --since <base-id> --until <head-id>` runs with the two commit ids an earlier report
  named, from a different checkout of the same repository whose `HEAD` is elsewhere
- **THEN** it reports the same commits, counts and lists as the earlier report

#### Scenario: The base ref must be named
- **WHEN** `ctxr graph diff` runs without `--since`
- **THEN** it exits with the usage code and reports nothing

### Requirement: The graph delta is byte-stable and reads no checkout or cache
For a given base and head commit and an unchanged configuration, the report `ctxr graph diff` produces SHALL
be byte-identical across runs, in each of its output forms. It SHALL NOT depend on the wall
clock, on uncommitted or untracked files, on the per-checkout graph artifact, or on the git configuration of
the user running it. The command SHALL build the base-side graph from the base commit's tree, read through
git's object store. It SHALL NOT check out, stash or switch anything, and SHALL NOT create, modify or delete
any file in the store, including under the derived cache paths. A store whose root lies below the
repository's top level SHALL be handled the same as one at the top level, with every reported path relative
to the store root.

#### Scenario: Two runs agree byte for byte
- **WHEN** `ctxr graph diff --since <ref> --json` runs twice against the same commits at different wall-clock
  times
- **THEN** the two outputs are byte-identical

#### Scenario: Uncommitted work does not enter the report
- **WHEN** the working tree carries an uncommitted edit adding a link, and an untracked new note
- **THEN** neither appears in the report, which describes the head commit alone

#### Scenario: The command writes nothing
- **WHEN** `ctxr graph diff --since <ref>` runs in a store
- **THEN** `git status --porcelain` and the contents of the derived cache paths are the same after it as before
  it

#### Scenario: A stale or missing graph artifact changes nothing
- **WHEN** the per-checkout graph artifact is absent or was built before the latest commit
- **THEN** the report is the same as when the artifact is freshly built

### Requirement: The graph delta names where it can be reviewed
When the resolved store root is a session worktree, the report SHALL name the address of that worktree's review
view, carrying the head commit id the report was computed for so the view can tell when the branch has moved on:
the server-relative route always, and an absolute address against `serve.base_url` when it is declared,
keeping any path the base URL carries. When no base URL is declared, the report SHALL state that the address is
a bare route and SHALL NOT invent an origin. Outside a session worktree, and wherever the store configures
`serve.previews` as `none`, the report SHALL name no review address. The review address SHALL have no
after-landing form: the view is a convenience that exists only while the worktree does and the server is
reachable, and the report's own record of the change is what outlives it.

#### Scenario: A session worktree's report names its review route
- **WHEN** `ctxr graph diff --since <ref>` runs in a session worktree in a store declaring no `serve.base_url`
- **THEN** the report names the review route for that worktree, carrying the head commit id, and states that it
  is a bare route

#### Scenario: A base URL with a path prefix is kept
- **WHEN** the store declares `serve.base_url` as an address that carries a path prefix
- **THEN** the review address is that base URL, prefix included, followed by the review route

#### Scenario: Outside a worktree there is no review address
- **WHEN** the command runs in the store's own checkout rather than a session worktree
- **THEN** the report names no review address

#### Scenario: Previews configured off drop the review address
- **WHEN** `serve.previews` is `none` and the command runs in a session worktree
- **THEN** the report names no review address

### Requirement: The graph delta renders the pull request's knowledge-changes block
`ctxr graph diff --format markdown` SHALL write to standard output a markdown block, headed Knowledge changes,
that a pull request body can carry verbatim with no further editing. The block SHALL contain the full base and
head commit ids, the exact `ctxr graph diff --since <base-id> --until <head-id>` command that reproduces it, the
count of each kind the report carries, every dangling link introduced and every note archived, and, when the
report names a review address, that address with one line stating that it resolves only while the session's
worktree exists and the server can reach it. When the delta is empty, the block SHALL say that the range changes
no note rather than being empty. The block SHALL be built from the same delta as the other output forms and
SHALL carry no judgment that the report does not make.

`--format` SHALL accept `text` (the default) and `markdown`, and SHALL refuse any other value with a usage
error. `--format markdown` together with `--json` SHALL be refused with a usage error, since the block is the
whole output and has no envelope.

#### Scenario: The block names its range and how to reproduce it
- **WHEN** `ctxr graph diff --since <ref> --format markdown` runs
- **THEN** the output is a single markdown block that names the base and head commit ids in full and contains
  `ctxr graph diff --since <base-id> --until <head-id>` with those ids

#### Scenario: Running the reproducing command gives the same facts
- **WHEN** the command the block names is run in another checkout of the same repository with
  `--format markdown`
- **THEN** its commit ids, counts, dangling links and archived notes are identical to the original block's

#### Scenario: The block lists the silent losses in full
- **WHEN** the range introduces three dangling links and archives two notes
- **THEN** the block lists all three dangling links and both archived notes, and gives every other kind as a
  count

#### Scenario: An empty range says so
- **WHEN** the range changes no admitted note
- **THEN** the block states that the range changes no note, and still names both commit ids and the
  reproducing command

#### Scenario: The block has no envelope
- **WHEN** `ctxr graph diff --since <ref> --format markdown --json` runs
- **THEN** it exits with the usage code and writes no block

#### Scenario: An unknown format is refused
- **WHEN** `ctxr graph diff --since <ref> --format html` runs
- **THEN** it exits with the usage code, naming the accepted values
