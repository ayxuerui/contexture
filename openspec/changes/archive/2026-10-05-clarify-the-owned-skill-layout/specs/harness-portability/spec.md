## MODIFIED Requirements

### Requirement: Contexture-owned skills are copied into the store and refreshed by update
The shipped skills SHALL be contexture-owned: their canonical content ships with the tool, and a store SHALL carry a full copy of each at the configured skills path in the skill layout: a directory `<slug>/` holding `SKILL.md`, marked as managed, and any supporting files the skill ships beside it (governed by the requirement *Owned skills may carry supporting files*). `init` SHALL write them, together with every other contexture-owned file the update command brings current, including each declared harness's adapter outputs; a dedicated update command SHALL bring every contexture-owned file in a store — generated entry-document sections, managed ignore blocks, hooks, skill copies, and adapter outputs — to the installed tool version without touching operator-authored content. Both SHALL be byte-stable when nothing has changed.

#### Scenario: Update refreshes a drifted copy and leaves operator content alone
- **WHEN** a contexture-owned skill copy differs from the installed version and an operator-authored skill sits alongside it, and the update command runs
- **THEN** the contexture-owned copy is rewritten to the installed version, the operator skill is byte-identical, and an immediately repeated update reports nothing changed
