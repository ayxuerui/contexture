## Purpose

Extends the context-organize capability (see `bootstrap-contexture-core`): rollup staleness is computed from git history and a rollup timestamp.

## ADDED Requirements

### Requirement: Stale rollups are detectable
`ctxr rollup stale [--for <entity>]` SHALL list entity notes for which any backlinking note was modified more recently than the entity's recorded rollup timestamp, or which record no rollup timestamp; `ctxr lint` SHALL report the same as an organize finding bounded by a configured staleness window.

#### Scenario: A newer backlink marks the rollup stale
- **WHEN** an entity note records a rollup timestamp and a note linking to it was modified after that timestamp
- **THEN** `rollup stale` lists the entity

#### Scenario: A fresh rollup is silent
- **WHEN** every backlinking note was modified before the recorded rollup timestamp
- **THEN** the entity is not listed
