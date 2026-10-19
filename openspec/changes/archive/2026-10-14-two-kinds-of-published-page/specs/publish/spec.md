## ADDED Requirements

### Requirement: A page's lifespan is read from where it is filed
Every page under the store's configured publish path SHALL have exactly one lifespan, permanent or
disposable, determined by its location alone: a page SHALL be disposable when the first segment of
its folder's path beneath the configured publish path is the disposable segment, `disposable`, and
permanent otherwise. No field in a page's index file or sibling README SHALL declare or change its
lifespan. `ctxr publish new`, `ctxr publish check` and `ctxr publish urls` SHALL each report the
lifespan of every page they name, in both their human-readable and machine-readable output, alongside
their existing result; reporting it SHALL gate nothing and SHALL NOT change any of those commands'
exit codes.

#### Scenario: A page under the disposable segment is disposable
- **WHEN** `ctxr publish check` runs against a page whose folder is `disposable/2026-01-01-example`
  under the configured publish path
- **THEN** the reported lifespan is disposable

#### Scenario: A page anywhere else is permanent
- **WHEN** `ctxr publish check` runs against a page whose folder is `ctx-a/work/example-page` under
  the configured publish path
- **THEN** the reported lifespan is permanent

#### Scenario: A page that predates lifespans is permanent without being edited
- **WHEN** a store's pages were all scaffolded before lifespans existed and none sits under the
  disposable segment
- **THEN** every one of them is reported permanent, and no file under the configured publish path
  has to change for that to be so

#### Scenario: A change set's report names each page's lifespan
- **WHEN** `ctxr publish urls --since <ref> --json` runs against a change set that adds one disposable
  and one permanent page
- **THEN** each entry carries its lifespan, and a moved page carries the lifespan of the location it
  moved to

#### Scenario: The lifespan does not alter an exit code
- **WHEN** `ctxr publish check` runs against a disposable page and against a permanent page that
  otherwise pass every check
- **THEN** both exit with the success code

### Requirement: A disposable page is scaffolded under the disposable segment with the tool's date
`ctxr publish new --disposable <name>` SHALL scaffold a page at
`disposable/<YYYY-MM-DD>-<name>` under the store's configured publish path, where the date is the
current date the command stamps into the page skeleton's provenance line, writing the same index
skeleton and sibling README an ordinary slug produces. A disposable page is the frozen snapshot the
reserved dated naming is set aside for, and its date SHALL be supplied by the command rather than by
the caller. The command SHALL refuse, with a non-zero exit naming the reason and writing nothing, a
`<name>` that contains more than one segment, that would resolve outside the configured publish path,
or that itself begins with a date pattern (`YYYY-` or `YYYY-MM-DD-`). It SHALL refuse, with a
non-zero exit and leaving the existing folder unchanged, when a folder already exists at the path it
would scaffold. Without `--disposable`, `ctxr publish new <slug>` SHALL refuse, with a non-zero exit
naming the segment's reservation for disposable pages and `--disposable` as the way in, and writing
nothing, a `<slug>` whose first segment is the disposable segment, so that a disposable page has
exactly one way in. A disposable page SHALL be excluded from retrieval by
the same exclusion that covers the configured publish path, with no further configuration.

#### Scenario: A disposable page is scaffolded at a dated path
- **WHEN** `ctxr publish new --disposable agent-week` runs on 2026-10-13
- **THEN** the page folder is `disposable/2026-10-13-agent-week` under the configured publish path,
  holding the same skeleton and sibling README an ordinary slug produces, and the command exits with
  the success code

#### Scenario: A caller-supplied date is refused
- **WHEN** `ctxr publish new --disposable 2026-10-01-agent-week` runs
- **THEN** the command exits non-zero naming that the date is supplied by the command, and no folder is
  created

#### Scenario: A multi-segment disposable name is refused
- **WHEN** `ctxr publish new --disposable folder-a/agent-week` runs
- **THEN** the command exits non-zero naming the reason, and no folder is created

#### Scenario: A slug spelled into the disposable segment is refused
- **WHEN** `ctxr publish new disposable/2026-10-13-agent-week` runs without `--disposable`
- **THEN** the command exits non-zero naming the segment's reservation and `--disposable` as the way
  to scaffold a disposable page, and no folder is created

#### Scenario: An existing disposable page is never overwritten
- **WHEN** `ctxr publish new --disposable agent-week` runs twice on the same date
- **THEN** the second run exits non-zero and the folder the first run created is unchanged

#### Scenario: A disposable page is never retrieved
- **WHEN** a disposable page's README links a note and a retrieval leg contexture computes is asked
  for that note's neighbourhood
- **THEN** neither the page's index file nor its README is returned, exactly as for any other page
  under the configured publish path

### Requirement: A disposable page's shape is checked
For a disposable page, `ctxr publish check <path>` SHALL additionally verify that the page's folder
sits directly beneath the disposable segment, one level deep, and that the folder's name begins with
a valid calendar date in the form `YYYY-MM-DD-`. It SHALL report either violation as a named failing
check in the same run as every other check, and SHALL exit non-zero when it does. The checks a
permanent page's represented note is subject to SHALL NOT apply to a disposable page.

#### Scenario: A well-formed disposable page passes the shape check
- **WHEN** `ctxr publish check` runs against a page at `disposable/2026-10-13-agent-week` that
  satisfies every other check
- **THEN** the command exits with the success code and names no failing check

#### Scenario: A disposable page nested deeper fails the shape check
- **WHEN** `ctxr publish check` runs against a page at `disposable/folder-a/2026-10-13-agent-week`
- **THEN** the command exits non-zero and names the disposable-shape check as failing

#### Scenario: A disposable page with no valid date fails the shape check
- **WHEN** `ctxr publish check` runs against a page at `disposable/agent-week`, or at
  `disposable/2026-13-45-agent-week`
- **THEN** the command exits non-zero and names the disposable-shape check as failing

#### Scenario: A page hand-filed under the reserved segment fails the shape check
- **WHEN** `ctxr publish check` runs against a page at `disposable/ctx-a/example-page`, filed there by
  hand rather than by `ctxr publish new --disposable`
- **THEN** the page is reported disposable by its location, and the command exits non-zero naming the
  disposable-shape check as failing

#### Scenario: A disposable page names no note and still passes
- **WHEN** `ctxr publish check` runs against a well-formed disposable page whose README links no note
- **THEN** no represented-note failure is reported

### Requirement: A permanent page names the one note it represents
For a permanent page, `ctxr publish check <path>` SHALL additionally verify that the first wikilink in
the body of the page's sibling README — frontmatter excluded, read the same way `ctxr publish gather`
reads a README's lead link when counting a page as a subject's — resolves, by filename stem as the
entity selector resolves a wikilink, to exactly one note in the store's note enumeration. That note
is the note the page represents. A page MAY link any number of further notes after the first; they
are its citations and SHALL NOT affect this check. The check SHALL fail, named as the
represented-note check, when the README links no note, when its first link resolves to no note, and
when its first link resolves to more than one note, naming which of the three it is and, for the
last, every note it resolves to. The failure SHALL be reported in the same run as every other check.

#### Scenario: A README leading with an existing note passes
- **WHEN** `ctxr publish check` runs against a permanent page whose README's first wikilink names an
  existing note and whose other checks pass
- **THEN** no represented-note failure is reported

#### Scenario: A page drawing on many notes passes when it leads with one
- **WHEN** a permanent page's README leads with the hub note of a store folder and links a dozen notes
  under that folder after it
- **THEN** the hub note is the represented note and no represented-note failure is reported

#### Scenario: A README that links no note fails
- **WHEN** `ctxr publish check` runs against a permanent page whose README contains no wikilink
- **THEN** the command exits non-zero and names the represented-note check as failing because no note
  is named

#### Scenario: A lead link that resolves to no note fails
- **WHEN** a permanent page's README's first wikilink names a stem no note in the store carries
- **THEN** the command exits non-zero and names the represented-note check as failing because the
  named note does not exist

#### Scenario: An ambiguous lead link fails naming every candidate
- **WHEN** a permanent page's README's first wikilink names a stem two notes share
- **THEN** the command exits non-zero, names the represented-note check as failing, and names both
  notes

### Requirement: A permanent page records its note's content hash and is reported stale when the note changes
`ctxr publish stamp <path>` SHALL, for a permanent page whose represented note resolves, append to the
README line holding the lead link a marker recording the represented note's canonicalized content
hash, computed by the content-hashing primitive defined in the context-ingest capability, in the same
`<!-- hash:<hash> -->` form a confirmed catalog gloss carries. It SHALL write the marker only when
that line carries none; when a marker is present it SHALL write nothing and report whether the marker
matches the note's current hash. It SHALL exit non-zero, writing nothing, when the page is disposable
or when its represented note does not resolve. Confirming a page against a changed note SHALL
therefore take removing the marker and stamping again; no command overwrites a marker.

For a permanent page, `ctxr publish check <path>` SHALL additionally fail, named as the
represented-note-hash check, when the lead-link line carries no marker (the page is not stamped) or
carries one that differs from the represented note's current content hash (the page is stale),
naming which. It SHALL report this failure in the same run as every other check and SHALL write
nothing.

#### Scenario: Stamping records the note's hash once
- **WHEN** `ctxr publish stamp <path>` runs against a permanent page whose README leads with an
  existing note and carries no marker
- **THEN** the lead-link line ends with a marker carrying that note's content hash, nothing else in the
  page's folder changes, and the command exits with the success code

#### Scenario: Stamping never overwrites a marker
- **WHEN** `ctxr publish stamp <path>` runs against a page whose lead-link line already carries a
  marker that no longer matches the note
- **THEN** the README is byte-unchanged, and the command reports the page as stale

#### Scenario: Removing the marker and stamping again confirms the page
- **WHEN** a stale page's marker is removed and `ctxr publish stamp <path>` runs
- **THEN** the new marker carries the note's current hash, and `ctxr publish check <path>` reports no
  represented-note-hash failure

#### Scenario: A page whose note changed fails as stale
- **WHEN** a permanent page was stamped and its represented note's body has since changed
- **THEN** `ctxr publish check <path>` exits non-zero and names the represented-note-hash check as
  failing because the page is stale

#### Scenario: An unstamped page fails as not stamped
- **WHEN** `ctxr publish check <path>` runs against a permanent page whose README leads with an
  existing note and carries no marker
- **THEN** the command exits non-zero and names the represented-note-hash check as failing because the
  page is not stamped

#### Scenario: A disposable page is never stamped
- **WHEN** `ctxr publish stamp <path>` runs against a disposable page
- **THEN** the command exits non-zero naming that a disposable page is not stamped, and writes nothing

#### Scenario: An unresolvable lead link is never stamped
- **WHEN** `ctxr publish stamp <path>` runs against a permanent page whose README's first wikilink
  resolves to no note
- **THEN** the command exits non-zero naming the reason, and writes nothing

## MODIFIED Requirements

### Requirement: A page's filing path is derived from where its subject's notes live
`ctxr publish gather` SHALL report, alongside the resolved note set, the path under the store's
configured publish path at which a page for that subject belongs, derived from the subject selector
alone. The derived path SHALL be the subject's store folder path carried at the full depth that path
runs to, with each segment slugified: lowercased, every run of characters that is neither a letter
nor a digit replaced by a single separator, and leading and trailing separators removed. A segment
that slugifies to nothing SHALL be dropped, and no segment SHALL be truncated. The subject's store
folder SHALL be the prefix itself for a subtree selector and the directory holding the note the
selector names for a note or an entity selector; where the resolved notes themselves live SHALL NOT
change it. The derived path SHALL appear in both the human-readable and the `--json` output, and the
`--json` output SHALL carry it both relative to the configured publish path — the form
`ctxr publish new` accepts as the leading segments of a slug — and relative to the store root. When
no folder path names the subject, the command SHALL report that no path derives, name the reason,
still report the resolved set, and exit with the success code. The first segment beneath the
configured publish path named `disposable` is reserved for disposable pages: when the derived path's
first segment would be that reserved segment, the command SHALL likewise report that no path
derives, name the reservation as the reason, still report the resolved set, and exit with the
success code.

#### Scenario: A subtree selector derives the prefix it names
- **WHEN** `ctxr publish gather --under ctx-a/work` runs
- **THEN** the reported filing path is `ctx-a/work` under the configured publish path

#### Scenario: A note selector derives the directory holding the note
- **WHEN** `ctxr publish gather --note ctx-a/work/ctx-note.md` runs and no page counts as that
  note's
- **THEN** the reported filing path is `ctx-a/work` under the configured publish path

#### Scenario: The derived path carries the store's folder depth, uncapped
- **WHEN** the subject's notes live at a store folder path of three or more segments
- **THEN** the reported filing path carries every one of those segments, rather than stopping at a
  fixed number of levels

#### Scenario: Folder names are slugified, not copied
- **WHEN** a segment of the subject's store folder path is `Ctx A & B`
- **THEN** the corresponding segment of the reported filing path is `ctx-a-b`

#### Scenario: A folder named outside the ASCII range keeps its letters
- **WHEN** a segment of the subject's store folder path is written in a script with no ASCII form
- **THEN** that segment's letters and digits are kept, lowercased, in the derived path, and the
  derived segment is not empty

#### Scenario: An entity subject's filing path does not depend on where its backlinks live
- **WHEN** `ctxr publish gather --entity ctx-a/work/ctx-note.md` runs and the notes linking to that
  note live under two different store folders
- **THEN** the reported filing path is the directory holding the named note, identical to what the
  same command reports when every linking note lives beside it

#### Scenario: An empty resolved set still reports a filing path
- **WHEN** a subject selector resolves to zero notes
- **THEN** the command reports the filing path derived from the selector and exits with the success
  code, exactly as for a non-empty set

#### Scenario: A subject no folder path names reports no derived path
- **WHEN** a subtree selector names the store root rather than a folder under it
- **THEN** the command reports that no filing path derives, names that no folder path names the
  subject, reports the resolved set, and exits with the success code

#### Scenario: A derived path that would land in the reserved segment does not derive
- **WHEN** `ctxr publish gather --note Disposable/ctx-note.md` runs, so the subject's store folder
  slugifies to `disposable`
- **THEN** the command reports that no filing path derives, names the reservation of that segment for
  disposable pages as the reason, reports the resolved set, and exits with the success code

#### Scenario: A folder whose name merely begins with the reserved word is unaffected
- **WHEN** `ctxr publish gather --under disposable-notes` runs
- **THEN** the reported filing path is `disposable-notes`, exactly as for any other folder
