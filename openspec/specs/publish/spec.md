# publish Specification

## Purpose

Governs turning store content into a shareable page for a subject — a store subtree, a single note, a
or a concept: how its source notes are named and resolved, and the mechanical checks a finished page
must pass —
independent of what the page looks like or how it is built, which stay outside this capability.

## Requirements

### Requirement: A publish subject resolves to a note set from a subtree, a note, or an entity
`ctxr publish gather` SHALL accept exactly one subject selector and resolve it to a set of source
notes: a store subtree (a path prefix, every retrievable note under it), a single note, or an entity
(the notes linking to it, the same enumeration `ctxr rollup gather` uses). It SHALL report the
resolved set together with its count, and SHALL exit with the success code on a successful
resolution, gating nothing.

#### Scenario: A subtree selector resolves every note under a prefix
- **WHEN** `ctxr publish gather --under <prefix>` runs
- **THEN** the resolved set is every retrievable note whose path is at or under `<prefix>`

#### Scenario: A note selector resolves to exactly one note
- **WHEN** `ctxr publish gather --note <path>` runs
- **THEN** the resolved set contains exactly that note

#### Scenario: An entity selector resolves to its backlinks
- **WHEN** `ctxr publish gather --entity <name>` runs
- **THEN** the resolved set is every note whose body links to `<name>`, identical to what `ctxr rollup gather <name>` would enumerate

#### Scenario: A successful enumeration exits zero
- **WHEN** `ctxr publish gather --under <prefix> --json` runs against a store containing notes under `<prefix>`
- **THEN** the command exits with the success code and the JSON output lists every note in the resolved set with no per-note verdict

#### Scenario: An empty resolved set is reported as empty
- **WHEN** a subject selector resolves to zero notes
- **THEN** the command exits with the success code and reports a resolved-note count of zero

### Requirement: A living page's identity is validated and never silently overwritten
`ctxr publish new <slug>` SHALL accept a `<slug>` naming either a single folder or a multi-segment path
under the store's configured publish path, so a page can be filed in a directory structure of the
author's choosing. It SHALL refuse, with a non-zero exit naming the reason, a `<slug>` whose final
segment begins with a date pattern (`YYYY-` or `YYYY-MM-DD-`) for a living (non-snapshot) page — the
final segment is the page's own identity, and the reserved dated naming applies to it rather than to
the directories containing it. It SHALL refuse, with a non-zero exit naming the reason, a `<slug>`
containing any segment that would resolve outside the configured publish path, writing nothing. It
SHALL refuse, with a non-zero exit, to scaffold a page at a `<slug>` for which a page folder already
exists. On success it SHALL create the page's folder, together with any intermediate directories its
path names, and a sibling README file containing the required section headings (intent, source notes,
audience, spec). The scaffolded index page SHALL declare a colour scheme covering both light and dark,
adapting to the viewer's own system preference, so a freshly scaffolded page is legible under either
preference before its author styles it further.

#### Scenario: A date-prefixed slug is refused
- **WHEN** `ctxr publish new 2026-01-01-example` runs
- **THEN** the command exits non-zero and no folder is created

#### Scenario: A date-prefixed final segment is refused at any depth
- **WHEN** `ctxr publish new folder-a/2026-01-01-example` runs
- **THEN** the command exits non-zero and no folder is created, exactly as for a single-segment slug

#### Scenario: The date rule binds the page's own segment, not its parent directories
- **WHEN** `ctxr publish new` runs with a slug whose intermediate directory begins with a date pattern
  and whose final segment does not
- **THEN** the command succeeds and scaffolds the page, because the reserved dated naming applies to a
  page's own identity, not to the directories it is filed under

#### Scenario: An ordinary slug scaffolds a folder with the required README headings
- **WHEN** `ctxr publish new project-example` runs against a slug with no existing folder
- **THEN** a folder is created containing a sibling README with the intent, source notes, audience, and spec headings, and no page markup is written into it beyond a minimal skeleton

#### Scenario: A multi-segment slug scaffolds the page at that path
- **WHEN** `ctxr publish new folder-a/folder-b/example-page` runs and no folder exists at that path
- **THEN** the page folder is created at that path under the configured publish path, with its
  intermediate directories, holding the same skeleton and sibling README a single-segment slug produces

#### Scenario: A slug that would escape the publish path is refused
- **WHEN** `ctxr publish new` runs with a slug containing a parent-directory segment, an empty segment,
  or an absolute path
- **THEN** the command exits non-zero naming the reason and writes nothing, inside or outside the
  configured publish path

#### Scenario: An existing page folder is never silently overwritten
- **WHEN** `ctxr publish new <slug>` runs and a folder already exists at that slug
- **THEN** the command exits non-zero and leaves the existing folder unchanged

#### Scenario: The scaffolded page adapts to the viewer's system preference
- **WHEN** `ctxr publish new <slug>` scaffolds a new page
- **THEN** the generated `index.html` declares styling for both a light and a dark system preference,
  without requiring its author to add it before the page is otherwise complete

### Requirement: A published page's structural invariants are checked mechanically
`ctxr publish check <path>` SHALL verify, for the `index.html` at `<path>`: it contains no external
network reference (no `http://` or `https://` value in a `src` or `href` attribute), it declares a
viewport meta tag, it declares at least one `@media print` rule, it states a provenance line pairing a
date with a link to its sibling README, it declares a non-empty `<title>`, its sibling README exists,
its sibling README's frontmatter declares no `kind` field, and — when it contains one or more
`<script>` blocks — each block is syntactically valid. It SHALL additionally verify the page's filing
location: that the folder holding the checked index page sits inside at least one grouping directory
beneath the store's configured publish path, rather than being an immediate child of that path, and
SHALL report a page filed directly at the publish path as a named failing check. That check answers
the filing *shape* only — which grouping directory a given page belongs under is not derivable from
the page and SHALL NOT be checked. It SHALL exit non-zero and name every failing check in one run,
not only the first.

#### Scenario: A page referencing an external network resource fails the check
- **WHEN** `ctxr publish check <path>` runs against a page whose `index.html` loads a script or
  stylesheet from an external URL
- **THEN** the command exits non-zero and names the external-reference check as failing

#### Scenario: A page missing its sibling README fails the check
- **WHEN** `ctxr publish check <path>` runs against a page folder with no README file
- **THEN** the command exits non-zero and names the missing-README check as failing

#### Scenario: A page with a syntactically invalid embedded script fails the check, naming the block
- **WHEN** `ctxr publish check <path>` runs against a page containing a `<script>` block with a syntax
  error
- **THEN** the command exits non-zero, names the script-syntax check as failing, and identifies which
  script block failed

#### Scenario: A page with no title fails the check
- **WHEN** `ctxr publish check <path>` runs against a page whose `index.html` declares no `<title>`, or
  declares one that is empty
- **THEN** the command exits non-zero and names the title check as failing

#### Scenario: A page satisfying every invariant exits successfully
- **WHEN** `ctxr publish check <path>` runs against a page satisfying every check above
- **THEN** the command exits with the success code and names no failing check

#### Scenario: A page filed directly at the publish path fails the location check
- **WHEN** `ctxr publish check <path>` runs against a page whose folder is an immediate child of the
  store's configured publish path, inside no grouping directory
- **THEN** the command exits non-zero and names the filing-location check as failing, while still
  reporting the result of every other check in the same run

#### Scenario: A page filed inside a grouping directory passes the location check at any depth
- **WHEN** `ctxr publish check <path>` runs against a page whose folder sits beneath one or more
  grouping directories under the store's configured publish path
- **THEN** the command names no filing-location failure, whether that page sits one grouping
  directory deep or several

#### Scenario: The location check names no expected directory
- **WHEN** the filing-location check fails for a page
- **THEN** the reported failure names that the page is filed directly at the configured publish path,
  and does not name any particular directory the page should have been filed under — no such
  directory is derivable from the page

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
still report the resolved set, and exit with the success code.

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

### Requirement: A subject with more than one page collects them under a segment naming it
The path `ctxr publish gather` derives SHALL carry a segment naming the subject note, between the
subject's slugified folder path and the page itself, exactly when the subject note already has at
least one page — so a subject's first page sits directly in its folder path and its later pages
collect beside the first under one segment — and when the subject's folder path is empty, so that a
subject at the store root is named by something. That segment SHALL be the subject note's filename
stem, slugified by the same rule. A subtree selector names no note and SHALL never produce it.
A page SHALL be counted as the subject note's when it sits directly in the subject's slugified
folder path or directly in that path's subject segment — the two places this derivation files
into — and either the first note its sibling README links is the subject note, resolved by filename
stem the same way the entity selector resolves a wikilink, or its own directory segment equals the
subject note's slugified stem. A README that links the subject note anywhere after the first SHALL
NOT count the page, so a page that merely cites the subject among its sources is left where it is.
No other directory under the configured publish path SHALL be examined.
When carrying that segment would leave an existing page in the wrong place, the command SHALL report
each such page with its current path, the path it would move to, and which of the two signals
counted it as the subject's. The command SHALL move nothing and SHALL exit with the success code
whether or not it reports a move; filing or moving a page is the caller's act, and nothing here
performs or gates it.

#### Scenario: A subject with no page yet files directly in its folder path
- **WHEN** `ctxr publish gather --note ctx-a/work/ctx-note.md` runs and no page under the configured
  publish path counts as that note's
- **THEN** the reported filing path is `ctx-a/work`, carrying no segment naming the note

#### Scenario: A subject that already has a page gains a segment naming it
- **WHEN** a page at `ctx-a/work/page-one` counts as `ctx-a/work/ctx-note.md`'s and
  `ctxr publish gather --note ctx-a/work/ctx-note.md` runs
- **THEN** the reported filing path is `ctx-a/work/ctx-note`, and the command reports that
  `ctx-a/work/page-one` would move to `ctx-a/work/ctx-note/page-one`

#### Scenario: A page is counted by its README leading with the subject note
- **WHEN** the first note a page's sibling README links is the subject note
- **THEN** that page is counted as the subject's, and the report names the README link as what
  counted it

#### Scenario: A page that merely cites the subject among its sources is not counted
- **WHEN** a page's sibling README links some other note first and the subject note after it
- **THEN** that page is not counted as the subject's, and no move naming it is reported

#### Scenario: A page is counted by its own directory segment naming the subject
- **WHEN** a page's directory segment equals the subject note's slugified stem and its sibling
  README links no note at all
- **THEN** that page is counted as the subject's, and the report names the directory segment as what
  counted it

#### Scenario: A reported move is reported, never performed
- **WHEN** the command reports that an existing page would move
- **THEN** every file under the configured publish path is unchanged from before the command ran,
  and the command exits with the success code

#### Scenario: A page for another subject in the same folder is not counted
- **WHEN** a page beside the subject's folder path neither leads its sibling README with the subject
  note nor carries the subject note's slugified stem as its own directory segment
- **THEN** the derived path carries no segment naming the subject, and no move naming that page is
  reported

#### Scenario: A subject whose pages already sit under its segment reports no move
- **WHEN** every page counted as the subject note's already sits directly under the segment naming
  it
- **THEN** the reported filing path is that segment and the command reports no move

#### Scenario: A subtree subject never gains a subject segment
- **WHEN** `ctxr publish gather --under ctx-a/work` runs and pages already sit under `ctx-a/work`
- **THEN** the reported filing path is `ctx-a/work`, however many pages sit there

#### Scenario: A subject note at the store root is named by its segment
- **WHEN** the subject note sits at the store root, so its folder path is empty
- **THEN** the reported filing path is the segment naming that note, so a page following it is not
  filed directly at the configured publish path

### Requirement: A page command names the address its page is served at
`ctxr publish new` and `ctxr publish check` SHALL each report, alongside their existing result, the
address at which the store's browsing surface serves the page they name, so that address is never
inferred by the caller. The reported address SHALL name the page's index file rather than the page's
directory, because the serving routes address files and answer no directory request.

When the store root the command resolved is a session worktree, the reported address SHALL be the
one that worktree's pages are previewable at, and the command SHALL additionally report the address
the same page is served at once that worktree's work reaches the store's default branch. When the
resolved store root is not a session worktree, the reported address SHALL be the published-pages
address, and no second address SHALL be reported, because that address is already the durable one.
The reported address SHALL name which of the store's serving routes it belongs to, rather than
leaving that to be read off the address itself.

When the store's configuration declares a base URL for its browsing surface, the reported address
SHALL be absolute against it, preserving any path that base URL itself carries. When the
configuration declares none, the server-relative route alone SHALL be reported and no origin SHALL
be invented.

`ctxr publish check` SHALL report no address for a file that lies outside the store's configured
publish path, since no route in the store serves it, and SHALL report the address whether its checks
passed or failed. Reporting an address SHALL gate nothing and SHALL NOT change either command's
exit code.

#### Scenario: A page created in a session worktree is named at its previewable address
- **WHEN** `ctxr publish new folder-a/example-page` runs with the resolved store root being a session worktree
- **THEN** the reported address is the previewable address for that worktree and that page, names the worktree it belongs to, and is reported together with the address the page is served at once that worktree's work lands

#### Scenario: A page created in the store's own checkout is named at its published-pages address
- **WHEN** `ctxr publish new folder-a/example-page` runs with the resolved store root not being a session worktree
- **THEN** the reported address is the published-pages address for that page, and no second address is reported

#### Scenario: A checked page reports its address on both the passing and the failing path
- **WHEN** `ctxr publish check <path>` runs against a page under the store's configured publish path
- **THEN** the address is reported whether the command exits with the success code or names failing checks

#### Scenario: A checked file outside the publish path is reported at no address
- **WHEN** `ctxr publish check <path>` runs against a file that is not under the store's configured publish path
- **THEN** no address is reported, exactly as no filing verdict is reported for such a file

#### Scenario: Without a declared base URL the address is server-relative
- **WHEN** a page's address is reported and the store's configuration declares no base URL for its browsing surface
- **THEN** the reported address is the server-relative route alone and names no host

#### Scenario: With a declared base URL the address is absolute
- **WHEN** a page's address is reported and the store's configuration declares a base URL for its browsing surface
- **THEN** the reported address is that base URL joined to the same route, and any path the base URL itself carries is preserved rather than discarded

#### Scenario: The address names a file, not a directory
- **WHEN** a page's address is reported
- **THEN** it names the page's index file, because the route that serves it answers no request for the page's directory
