## REMOVED Requirements

### Requirement: A shipped baseline convention is delivered into the guidance directory and refreshed by update

**Reason**: The baseline is no longer a file. Writing it under the guidance directory *and* inlining it into `AGENTS.md` committed the same bytes twice, three directories apart, so every configuration change produced a diff in both, and nothing read the file except contexture itself. It also made staleness a two-hop chain (template → file → `AGENTS.md`), two independent ways to be behind, where rendering straight into `AGENTS.md` leaves one. And it placed one tool-owned file among the operator's own, which made "do not edit this one, edit that one" a live footgun: it fired on a real user, who reasonably read a regenerated diff as contexture editing the wrong file. With the file gone, every file in the guidance directory is the operator's.

The clauses of this requirement that still hold — rendered from the store's own configuration and never a shipped profile's or one deployment's names, refreshed by the update command, byte-stable when nothing changed, and operator files in the guidance directory left untouched — are carried by "The shipped baseline convention is rendered into the entry document, not delivered as a file". Its clause that the baseline is discovered by the same scan that inlines every other convention document is retired with it: the baseline is synthesized at generation time, not scanned.

**Migration**: None required of an operator. The update command removes a baseline copy an earlier version wrote, under either filename an earlier version used, when that copy still carries contexture's managed-owner marker; left in place it would be inlined a second time, because the guidance directory is inlined wholesale. Removal is a tracked deletion that reaches every clone on merge, with no git index manipulation. A file at either name without the marker is the operator's and is kept, inlined as an ordinary convention document.

## ADDED Requirements

### Requirement: The shipped baseline convention is rendered into the entry document, not delivered as a file
The generated "Store conventions" section of `AGENTS.md` SHALL open with contexture's shipped baseline convention, rendered at generation time from the shipped template and the store's own configuration (for example, its configured archive destination, default branch, and session worktrees path) — never a shipped profile's or one deployment's names — and placed ahead of every operator convention document. Its provenance line SHALL name contexture as its source rather than a path. The baseline SHALL NOT be written as a file under the configured guidance directory.

`init` and the update command SHALL render the baseline from the current template and configuration, so a change to either is reflected in `AGENTS.md` by the next update, and both SHALL be byte-stable when neither has changed. `ctxr doctor` SHALL attribute a conventions-section drift caused only by the baseline to the baseline by name, rather than to the guidance directory or to an operator file.

Neither command SHALL write, rewrite, or remove an operator file in the guidance directory. The single exception is a baseline copy an earlier version wrote there: when a file at a filename an earlier version used for the baseline still carries contexture's managed-owner marker, the update command SHALL remove it, so an upgraded store does not inline the baseline twice. A file at such a name without the marker SHALL be left untouched and inlined as an ordinary operator convention document.

#### Scenario: A fresh init inlines the baseline and writes no file
- **WHEN** `ctxr init` runs
- **THEN** the configured guidance directory contains no baseline convention file, and the `AGENTS.md` conventions section opens with the baseline exactly once, with a provenance line naming contexture rather than a path

#### Scenario: The baseline precedes the operator's conventions
- **WHEN** the configured guidance directory holds operator convention documents and the entry document is regenerated
- **THEN** the conventions section carries the baseline block first, followed by a block for each operator document

#### Scenario: A configuration change refreshes the baseline on update
- **WHEN** a store's configuration changes a value the baseline renders (for example, its configured default branch) and the update command runs
- **THEN** the baseline block in the `AGENTS.md` conventions section reflects the new value, and no file under the configured guidance directory is written

#### Scenario: A second update with nothing changed is a no-op
- **WHEN** the update command runs twice in a row with no configuration or template change between runs
- **THEN** the second run reports no change to `AGENTS.md` and none under the configured guidance directory

#### Scenario: Doctor names the baseline when only the baseline has drifted
- **WHEN** a store's configuration changes a value the baseline renders, `AGENTS.md` is not regenerated, and `ctxr doctor` runs
- **THEN** it fails, naming the shipped baseline as the drifted source rather than the guidance directory or any operator document

#### Scenario: An upgrade removes a managed baseline copy
- **WHEN** the configured guidance directory holds a baseline copy written by an earlier version and carrying contexture's managed-owner marker, and the update command runs
- **THEN** the copy is removed, the baseline is inlined exactly once, and the removed copy's body is not inlined

#### Scenario: An operator file at the old baseline name is kept
- **WHEN** the configured guidance directory holds an operator-authored file at a filename an earlier version used for the baseline, without contexture's managed-owner marker, and the update command runs
- **THEN** the file is byte-identical afterward and is inlined as an operator convention document after the baseline
