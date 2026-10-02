## ADDED Requirements

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
