## ADDED Requirements

### Requirement: A store's read view includes its present mounts, each note admitted by the store that owns it
The graph build and the retrieval pass SHALL cover the mounting store's own notes plus the notes of each present
mount that joins the read view (per shared-stores). A mounted note's identity SHALL be its path relative to the
mounting store's root, so it carries the mount's location as a prefix. Each mounted note SHALL be admitted by the
exclusion configuration of the store that owns it, never by the mounting store's. The mounting store's own note
enumeration SHALL exclude `shared/`, so its catalog build, catalog coverage check, and graph delta
between commits cover its own notes only. A declared mount that is absent SHALL contribute no notes, and the graph
build SHALL report it as absent.

Mounts SHALL be read from the mounting store's main working tree, so a command run in a linked worktree of the
mounting store, such as a session worktree, has the same mounts in its read view as the main working tree.

The persisted-graph loader's admission check SHALL decide each node by the exclusion configuration of the store that
owns it.

#### Scenario: A mounted note is in the graph under its mount prefix
- **WHEN** store `ctx-a` mounts `ctx-b`, `ctx-b` holds `work/ctx-note.md`, and `ctxr graph build` runs in `ctx-a`
- **THEN** the graph carries a node identified as `shared/ctx-b/work/ctx-note.md`

#### Scenario: A mounted note excluded by its own store stays out
- **WHEN** `ctx-b`'s configuration excludes `work/` and `ctx-a`'s does not
- **THEN** no node under `shared/ctx-b/work/` appears in `ctx-a`'s graph or retrieval pass

#### Scenario: The mounting store's own catalog ignores mounts
- **WHEN** `ctxr catalog build` and `ctxr catalog check` run in `ctx-a`
- **THEN** neither writes nor requires an entry for any note under `shared/`

#### Scenario: The graph delta covers the store's own notes only
- **WHEN** the graph delta between two of `ctx-a`'s commits is computed
- **THEN** it reports no node under `shared/`, since mounted notes are never in `ctx-a`'s commits

#### Scenario: A session worktree reads the mounts of the main working tree
- **WHEN** `ctxr graph build` runs in a session worktree of `ctx-a`, and `ctx-b` is present only under `ctx-a`'s main working tree
- **THEN** the graph carries `ctx-b`'s admitted notes under `shared/ctx-b/`, exactly as a build in the main working tree would

#### Scenario: An absent mount is reported, not fatal
- **WHEN** `ctx-a` declares mount `ctx-b` that has not been cloned, and `ctxr graph build` runs
- **THEN** the build completes from the notes present and reports `ctx-b` as absent

### Requirement: Links resolve within the store that owns the note
A wikilink SHALL resolve within the store that owns the note carrying it. A link target containing no `/` SHALL
resolve by filename stem among that store's admitted notes only. A link target containing a `/` SHALL resolve as a
path, with `.md` appended, relative to that store's root, and SHALL resolve only to an admitted note. Consequently a
note owned by the mounting store reaches a mounted note only through a path link that begins with `shared/`, and a note owned by a mounted store resolves no link to a note outside that mount. Ambiguity SHALL be decided
within the owning store: two notes sharing a stem in different stores do not make a stem link ambiguous.

#### Scenario: A stem link stays inside its own store
- **WHEN** `ctx-a` holds `people/ctx-person.md`, mount `ctx-b` also holds `people/ctx-person.md`, and a note in `ctx-a` links `[[ctx-person]]`
- **THEN** the link resolves to `ctx-a`'s note and is not reported as ambiguous

#### Scenario: A path link reaches into a mount
- **WHEN** a note in `ctx-a` links `[[shared/ctx-b/people/ctx-person]]`
- **THEN** the link resolves to the mounted note `shared/ctx-b/people/ctx-person.md`

#### Scenario: A mounted note cannot link into the mounting store
- **WHEN** a note owned by mount `ctx-b` links to a stem or path that exists only in `ctx-a`
- **THEN** the link resolves to no note and is reported as dangling

#### Scenario: A path link in a store with no mounts resolves against the store root
- **WHEN** a store with no `shared_stores` key holds `work/ctx-note.md` and a note links `[[work/ctx-note]]`
- **THEN** the link resolves to `work/ctx-note.md`
