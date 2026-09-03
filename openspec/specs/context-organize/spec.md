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
Archiving a note SHALL relocate it via the single tracked rename defined in the context-store capability, SHALL leave the note's frontmatter and body byte-identical, and SHALL report every other note in the store whose link would now point at the moved path.

#### Scenario: The note's bytes are unchanged by archiving
- **WHEN** a note carrying frontmatter is archived
- **THEN** the archived note's frontmatter and body are byte-identical to what they were before the move

#### Scenario: Inbound links are reported, not silently broken
- **WHEN** a note being archived has one or more other notes linking to it
- **THEN** `contexture archive` lists each linking note in its output, so the operator can update them if needed

### Requirement: Lint reports; it never fails a build
`contexture lint` SHALL report findings (orphaned notes, notes with no catalog entry as covered by context-catalog, broken links, uningested inbox material) and SHALL always exit 0 when it completes its scan successfully, regardless of how many findings it reports. It SHALL NOT be used as a gate that blocks a commit or a session submission. A "broken link" finding SHALL cover a link that resolves to no note at all; a link that resolves ambiguously, to more than one note, is doctor's (per store-integrity), not lint's.

#### Scenario: Findings do not produce a non-zero exit
- **WHEN** `lint` finds several orphaned notes and broken links
- **THEN** `lint` still exits 0, and its findings are only visible in its report output

#### Scenario: Lint is distinct from doctor
- **WHEN** an operator wants a check that fails on a real invariant violation rather than merely reports a health observation
- **THEN** they run `doctor` (defined in the store-integrity capability), not `lint`

#### Scenario: An ambiguous link is not a lint finding
- **WHEN** a link's target matches two or more notes' basenames
- **THEN** `lint` does not report it as a broken link, since ambiguous resolution is doctor's invariant (per store-integrity), not a lint observation

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
