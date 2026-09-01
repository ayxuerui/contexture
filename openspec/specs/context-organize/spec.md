# context-organize Specification

## Purpose

Governs how a store stays organized over time: where a note belongs, how a completed or abandoned note is retired without losing its history, and how health problems are surfaced without ever blocking normal use.

## Requirements

### Requirement: Placement is driven by configured taxonomy, not a hardcoded layout
The store's placement skill SHALL determine a new note's layer and folder using the taxonomy declared in `contexture.yaml` — its set of top-level layers and their declared defaults — and SHALL NOT assume any specific named layout is present.

#### Scenario: Placement works under a non-default taxonomy
- **WHEN** a store's `contexture.yaml` declares a taxonomy other than the shipped default profile
- **THEN** the placement skill's decision steps still resolve to a valid layer and folder within that configured taxonomy

### Requirement: Archive is a single tracked rename
Archiving a note SHALL relocate it via the single tracked rename defined in the context-store capability, SHALL preserve the note's resolved visibility unchanged, and SHALL report every other note in the store whose link would now point at the moved path.

#### Scenario: Visibility is unchanged by archiving
- **WHEN** a note with an explicit visibility field is archived
- **THEN** the archived note's visibility field is unchanged

#### Scenario: Inbound links are reported, not silently broken
- **WHEN** a note being archived has one or more other notes linking to it
- **THEN** `contexture archive` lists each linking note in its output, so the operator can update them if needed

### Requirement: Lint reports; it never fails a build
`contexture lint` SHALL report findings (orphaned notes, notes with no catalog entry as covered by context-catalog, broken links, uningested inbox material) and SHALL always exit 0 when it completes its scan successfully, regardless of how many findings it reports. It SHALL NOT be used as a gate that blocks a commit or a session submission.

#### Scenario: Findings do not produce a non-zero exit
- **WHEN** `lint` finds several orphaned notes and broken links
- **THEN** `lint` still exits 0, and its findings are only visible in its report output

#### Scenario: Lint is distinct from doctor
- **WHEN** an operator wants a check that fails on a real invariant violation rather than merely reports a health observation
- **THEN** they run `doctor` (defined in the store-integrity capability), not `lint`

### Requirement: Stale rollups are detectable
`ctxr rollup stale [--for <entity>]` SHALL list entity notes for which any backlinking note was modified more recently than the entity's recorded rollup timestamp, or which record no rollup timestamp; `ctxr lint` SHALL report the same as an organize finding bounded by a configured staleness window.

#### Scenario: A newer backlink marks the rollup stale
- **WHEN** an entity note records a rollup timestamp and a note linking to it was modified after that timestamp
- **THEN** `rollup stale` lists the entity

#### Scenario: A fresh rollup is silent
- **WHEN** every backlinking note was modified before the recorded rollup timestamp
- **THEN** the entity is not listed
