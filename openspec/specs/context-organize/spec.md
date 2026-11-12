# context-organize Specification

## Purpose

Governs how a store stays organized over time: where a note belongs, how a completed or abandoned note is retired without losing its history, and how health problems are surfaced without ever blocking normal use.

## Requirements

### Requirement: Placement is driven by configured taxonomy, not a hardcoded layout
The store's placement skill SHALL determine a new note's layer and folder using the taxonomy declared in `contexture.yaml` — its set of top-level layers and their declared defaults — and SHALL NOT assume any specific named layout is present.

#### Scenario: Placement works under a non-default taxonomy
- **WHEN** a store's `contexture.yaml` declares a taxonomy other than the shipped default profile
- **THEN** the placement skill's decision steps still resolve to a valid layer and folder within that configured taxonomy

### Requirement: Archive is a single tracked rename that leaves the note untouched
Archiving a note SHALL relocate it via the single tracked rename defined in the context-store capability, SHALL leave the note's frontmatter and body byte-identical, and SHALL report every other note in the store whose link would now point at the moved path. The destination SHALL be read from `organize.archive_destination`, a single configured path, and the archive operation SHALL NOT inspect the store's taxonomy to determine it.

#### Scenario: The note's bytes are unchanged by archiving
- **WHEN** a note carrying frontmatter is archived
- **THEN** the archived note's frontmatter and body are byte-identical to what they were before the move

#### Scenario: Inbound links are reported, not silently broken
- **WHEN** a note being archived has one or more other notes linking to it
- **THEN** `contexture archive` lists each linking note in its output, so the operator can update them if needed

#### Scenario: The destination is taxonomy-independent
- **WHEN** a store declares a taxonomy with no retirement layer of any kind
- **THEN** archiving still succeeds, relocating the note to `organize.archive_destination`

### Requirement: Lint reports; it never fails a build
`contexture lint` SHALL report findings (orphaned notes, notes with no catalog entry as covered by context-catalog, broken links, material still sitting in the inbox) and SHALL always exit 0 when it completes its scan successfully, regardless of how many findings it reports. It SHALL NOT be used as a gate that blocks a commit or a session submission. A "broken link" finding SHALL cover a link that resolves to no note at all; a link that resolves ambiguously, to more than one note, is doctor's (per store-integrity), not lint's. The inbox finding SHALL be determined by a file's location under the configured inbox path, not by which frontmatter fields it carries, since a capture is not a note and is not enumerable as one.

#### Scenario: Findings do not produce a non-zero exit
- **WHEN** `lint` finds several orphaned notes and broken links
- **THEN** `lint` still exits 0, and its findings are only visible in its report output

#### Scenario: Lint is distinct from doctor
- **WHEN** an operator wants a check that fails on a real invariant violation rather than merely reports a health observation
- **THEN** they run `doctor` (defined in the store-integrity capability), not `lint`

#### Scenario: An ambiguous link is not a lint finding
- **WHEN** a link's target matches two or more notes' basenames
- **THEN** `lint` does not report it as a broken link, since ambiguous resolution is doctor's invariant (per store-integrity), not a lint observation

#### Scenario: Inbox material is reported by location, not by frontmatter
- **WHEN** a capture sits under the configured inbox path, whether or not it already carries a source type and source id
- **THEN** `lint` reports it as material still awaiting ingest, and stops reporting it once ingest has moved it out of the inbox

### Requirement: Stale rollups are detectable
`ctxr rollup stale [--for <entity>]` SHALL list entity notes for which any backlinking note was modified more recently than the entity's recorded rollup timestamp, or which record no rollup timestamp; `ctxr lint` SHALL report the same as an organize finding bounded by a configured staleness window.

#### Scenario: A newer backlink marks the rollup stale
- **WHEN** an entity note records a rollup timestamp and a note linking to it was modified after that timestamp
- **THEN** `rollup stale` lists the entity

#### Scenario: A fresh rollup is silent
- **WHEN** every backlinking note was modified before the recorded rollup timestamp
- **THEN** the entity is not listed

### Requirement: The store mission document is stale on elapsed time, not backlinks
When a store's configuration declares `organize.mission_path` and the note at that path exists, `ctxr rollup stale` SHALL report it as stale when it records no rollup timestamp, or when the elapsed time since its recorded rollup timestamp exceeds `organize.rollup_stale_days` — independent of any note's backlinks, since a store-wide mission document has no natural set of backlinking notes to compare against. This rule SHALL apply only to the note at the configured mission path; every other entity note's staleness continues to be computed by the existing backlink-based rule.

#### Scenario: An unwritten mission document is stale
- **WHEN** `organize.mission_path` is configured, the note exists, and it records no rollup timestamp
- **THEN** `ctxr rollup stale` lists it as stale

#### Scenario: An aged mission document is stale
- **WHEN** the mission document's recorded rollup timestamp is older than `organize.rollup_stale_days` before the current time
- **THEN** `ctxr rollup stale` lists it as stale, regardless of whether any other note in the store was recently modified

#### Scenario: A freshly rolled-up mission document is not stale
- **WHEN** the mission document's recorded rollup timestamp is within `organize.rollup_stale_days` of the current time
- **THEN** `ctxr rollup stale` does not list it

#### Scenario: No mission path means no new candidate
- **WHEN** a store declares no `organize.mission_path`
- **THEN** `ctxr rollup stale`'s candidate set and results are identical to before this requirement existed

### Requirement: The mission document has a shipped default location and is seeded at init
`organize.mission_path` SHALL default to a path under the configured guidance directory, so every store carries a mission document without an operator opting in. `init` SHALL seed the file when it does not already exist. Staleness detection for the path named by `organize.mission_path` SHALL read that document directly rather than locating it through any retrieval-facing note listing, so its location under the guidance directory — which is excluded from that listing — does not prevent it from being found. Setting `organize.mission_path` to an empty value SHALL remove both the seeding behavior and the staleness rule for it.

#### Scenario: A fresh init seeds an unwritten mission document
- **WHEN** `contexture init` runs with no `organize.mission_path` override
- **THEN** the default mission path exists on disk, and `ctxr rollup stale` reports it stale, since it records no rollup timestamp

#### Scenario: The mission document is found regardless of retrieval exclusion
- **WHEN** the configured mission path falls under a directory excluded from the store's note listing
- **THEN** `ctxr rollup stale` and `ctxr rollup write` still locate and operate on it

#### Scenario: Unsetting the mission path removes the mechanism
- **WHEN** a store's configuration sets `organize.mission_path` to an empty value
- **THEN** `init` seeds no mission file, and `ctxr rollup stale` reports no mission-rule candidate

### Requirement: Lint reports a stale or past-due mission
`ctxr lint`'s rollup-staleness observation SHALL apply the mission rule (elapsed time since the recorded rollup timestamp exceeding `organize.rollup_stale_days`, or no timestamp at all) to the configured mission document, as `ctxr rollup stale` already does, so every lint run surfaces a stale mission rather than only an explicit staleness query. `ctxr lint` SHALL also report, as an observation, every date in the mission document's body that follows the word "due" (case-insensitively) and is earlier than the current date, naming the date and the line it appears on.

#### Scenario: Lint names a stale mission
- **WHEN** the configured mission document's recorded rollup timestamp is 18 days old and `organize.rollup_stale_days` is 7
- **THEN** `ctxr lint` reports the mission document as stale

#### Scenario: Lint names a past-due action in the mission
- **WHEN** the mission document's body contains "Due: 2026-09-18" and the current date is 2026-10-11
- **THEN** `ctxr lint` reports 2026-09-18 as past due, naming the line, and `ctxr doctor` still passes

#### Scenario: Future dates are not reported
- **WHEN** the mission document's body contains "due 2026-10-28" and the current date is 2026-10-11
- **THEN** no past-due finding is reported for that date

### Requirement: Lint reports disposable pages past their window
`ctxr lint` SHALL report, as an observation, every disposable page under the store's configured
publish path whose name's leading date is more than 30 days before the current date, naming the page's
path and its age in days, as a candidate for removal. The window SHALL be a fixed 30 days. A disposable
page whose name carries no valid leading date SHALL NOT be reported by this observation, its shape
being the publish capability's check. `ctxr lint` SHALL remove, move and modify nothing under the
configured publish path, SHALL exit 0 whatever this observation reports, and `ctxr doctor` SHALL NOT
report the same condition.

#### Scenario: A disposable page past the window is listed
- **WHEN** the current date is 2026-10-13 and a disposable page is named `2026-08-29-agent-week`
- **THEN** `ctxr lint` reports it as a removal candidate aged 45 days, and exits 0

#### Scenario: A disposable page within the window is not listed
- **WHEN** the current date is 2026-10-13 and a disposable page is named `2026-10-03-agent-week`
- **THEN** `ctxr lint` does not report it

#### Scenario: Lint removes nothing
- **WHEN** `ctxr lint` reports one or more removal candidates
- **THEN** every file under the configured publish path is unchanged from before it ran

#### Scenario: An old disposable page does not fail doctor
- **WHEN** a disposable page is 400 days old and every other doctor check passes
- **THEN** `ctxr doctor` exits 0

### Requirement: Lint reports permanent pages out of step with the note they represent
`ctxr lint` SHALL report, as an observation, every permanent page under the store's configured
publish path that `ctxr publish check` would fail on its represented-note or represented-note-hash
check — a page that names no resolvable note, one that is not stamped, and one that is stale against
its note — naming the page's path, the represented note when one resolves, and which of the three
applies. It SHALL exit 0 whatever this observation reports, and `ctxr doctor` SHALL NOT report the
same condition.

#### Scenario: A stale page is listed with its note
- **WHEN** a permanent page was stamped and its represented note has changed since
- **THEN** `ctxr lint` reports the page as stale, naming the note, and exits 0

#### Scenario: Pages that predate stamping are listed for migration
- **WHEN** a store's permanent pages were all built before stamping existed
- **THEN** `ctxr lint` reports each one, as not stamped or as naming no resolvable note, and `ctxr doctor`
  reports none of them

#### Scenario: A current page is silent
- **WHEN** a permanent page's README leads with an existing note and its marker matches that note's
  current hash
- **THEN** `ctxr lint` does not report it

### Requirement: Lint reports send copies without a dated name
`ctxr lint` SHALL report, as the `organize.send_copy_name` observation, each send copy — as the publish
capability defines it — anywhere under the store's configured publish path whose name is not
`<YYYY-MM-DD>-<name>.<extension>` led by a real calendar date and a non-empty name, naming the file and its
page folder. It SHALL report on permanent and disposable pages alike, and SHALL NOT report a file in a
subfolder of a page folder or a format outside the send-copy formats. Like every lint observation, it SHALL
NOT change lint's exit code.

#### Scenario: An undated send copy is reported
- **WHEN** a page folder under the configured publish path holds `model.xlsx` beside its `index.html`
- **THEN** `ctxr lint` reports `organize.send_copy_name` for that file, and exits as it would without it

#### Scenario: A store whose send copies are all dated reports nothing
- **WHEN** every send copy under the configured publish path has a dated name
- **THEN** `ctxr lint` reports no `organize.send_copy_name` observation
