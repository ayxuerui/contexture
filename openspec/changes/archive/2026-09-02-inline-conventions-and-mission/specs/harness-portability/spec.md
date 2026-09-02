## REMOVED Requirements

### Requirement: The skill index reflects the files on disk
**Reason**: On any harness with native skill auto-discovery, the entry document's skill index duplicates
content the harness has already loaded into its own context before `AGENTS.md` is ever read — in a
typical store this index is the majority of the rendered file's bytes, all of it redundant. The
"Skills are portable markdown reached by path" requirement already covers the non-auto-discovering
case: a harness with no discovery mechanism still reaches every skill by path from the configured
skills path, with no index needed to do so.
**Migration**: A store that wants a curated, browsable listing of its skills (grouped, annotated,
cross-referenced — more than a flat name+description dump can offer) writes one as an operator
convention document, which the "Operator conventions are inlined into the entry document" requirement
below now inlines in full. A harness or agent with no such convention can browse the configured skills
path directly; nothing about skill delivery, ownership, or the skill layout (`<slug>/SKILL.md`)
changes.

### Requirement: Operator conventions are referenced documents indexed by the entry document
**Reason**: Conventions move from an index of links to full inline bodies (see "Operator conventions are
inlined into the entry document" below); its scenario labels also carry the old "index" term, so — per
this spec's own established precedent (`rename-procedures-to-skills`) — this is expressed as a removal
plus an addition rather than a MODIFIED block, since a MODIFIED requirement cannot drop a scenario the
current spec still has.
**Migration**: None for any store. `.contexture/conventions/` stays the configured path and every
existing convention file is picked up unchanged; only how its content lands in `AGENTS.md` changes,
automatically on the next `ctxr update`.

## ADDED Requirements

### Requirement: Operator conventions are inlined into the entry document
A store MAY carry operator-authored convention documents as markdown files at a configured path. The
generated "Store conventions" section of `AGENTS.md` SHALL inline the full body of every convention
file present, with its frontmatter stripped, its headings demoted so the shallowest sits directly under
the section's own heading, and a provenance line naming its source path. When no convention files
exist, the section SHALL state where to add them.

#### Scenario: A convention file's body is inlined on regeneration
- **WHEN** an operator adds a markdown file with a frontmatter title at the configured conventions path and the entry document is regenerated
- **THEN** the `AGENTS.md` conventions section contains that file's full body under a heading naming its title, with a line naming its source path, and its own headings demoted one level below the section heading

#### Scenario: An empty store still explains the mechanism
- **WHEN** a store has no convention files and the entry document is generated
- **THEN** the conventions section names the configured path and states that operator conventions added there will be inlined

#### Scenario: Inlining is byte-stable
- **WHEN** the entry document is regenerated against unchanged convention files
- **THEN** the conventions section is byte-identical and regeneration reports no change

### Requirement: The entry document inlines the mission document when configured
When a store's `contexture.yaml` declares `organize.mission_path` and the note at that path exists,
`AGENTS.md` SHALL carry a "Mission" section inlining that note's full body — frontmatter stripped,
nested `contexture:` fence markers stripped so only the fence's content is copied, headings demoted so
the shallowest sits directly under the section heading. When no mission path is configured, or the
configured note does not exist, the section SHALL be absent entirely, and regenerating SHALL report no
change once already absent.

#### Scenario: Mission is inlined when configured
- **WHEN** a store declares `organize.mission_path` and the entry document is regenerated
- **THEN** `AGENTS.md` carries a "Mission" section containing that note's body, with any nested `contexture:` fence markers removed and only their content retained

#### Scenario: No mission section when unconfigured
- **WHEN** a store declares no `organize.mission_path` and the entry document is regenerated
- **THEN** `AGENTS.md` carries no "Mission" section, and regenerating again reports no change

#### Scenario: A rollup write refreshes the mission section in the same operation
- **WHEN** `ctxr rollup write` succeeds against the configured mission path
- **THEN** the entry document's "Mission" section is refreshed to match the newly written content before the command completes, with no separate regeneration step required

### Requirement: The entry document's inlined content matches its sources
`ctxr doctor` SHALL fail when `AGENTS.md`'s inlined conventions section or Mission section no longer
matches the current content of its source file (a convention file changed after the last regeneration,
or the mission document changed after its last rollup-triggered refresh), naming the drifted source.
The pre-commit hook SHALL refuse a commit that stages a change to a convention file or to the configured
mission document while leaving `AGENTS.md` stale relative to that change.

#### Scenario: Doctor detects a drifted convention file
- **WHEN** a convention file is edited directly (not through a commit that also regenerates `AGENTS.md`) and `ctxr doctor` runs
- **THEN** it fails, naming the drifted convention file's path

#### Scenario: Doctor detects a drifted mission document
- **WHEN** the mission document is edited by a means other than `ctxr rollup write` and `ctxr doctor` runs
- **THEN** it fails, naming the mission document's path

#### Scenario: A commit that would leave the entry document stale is refused
- **WHEN** a commit stages a change to a convention file or the mission document without a corresponding regeneration of `AGENTS.md`
- **THEN** the pre-commit hook refuses the commit and names the file that would drift

#### Scenario: A synchronized store passes
- **WHEN** every convention file and the mission document match what `AGENTS.md` currently inlines
- **THEN** `ctxr doctor` reports no drift finding

### Requirement: Generated sections render in a fixed order
The entry document's contexture-managed sections SHALL render, on a freshly initialized store, in a
fixed order: store fundamentals, mission (when configured), retrieval routing, capture, placement, then
store conventions. On an existing store whose managed sections are contiguous (separated only by blank
lines), `ctxr update` SHALL reorder them to match. When hand-written content interrupts that
contiguity, `ctxr update` SHALL leave the existing section order unchanged rather than reordering
around foreign content, and SHALL report this via `ctxr lint` as an observation rather than a `ctxr
doctor` failure — `doctor` runs only invariant-severity checks (per store-integrity's own
"observation checks never fail a run"), so a non-blocking finding is a `lint` finding by construction,
never a `doctor` one.

#### Scenario: A first-time init writes sections in the fixed order
- **WHEN** `ctxr init` runs against a store with no existing `AGENTS.md`
- **THEN** the generated sections appear in the fixed order

#### Scenario: A drifted but contiguous store converges on update
- **WHEN** an existing store's managed sections are in a different order but are separated only by blank lines, and `ctxr update` runs
- **THEN** the sections are reordered to match the fixed order, and hand-written content outside every managed section is preserved unchanged

#### Scenario: Hand-written content between sections blocks reordering
- **WHEN** hand-written content sits between two managed sections and `ctxr update` runs
- **THEN** the existing order is left unchanged, and `ctxr lint` reports the interruption as an observation

## MODIFIED Requirements

### Requirement: `AGENTS.md` is the canonical entry document
Every context store SHALL carry an `AGENTS.md` file at its root that is the canonical, harness-agnostic
entry document for the store — its fundamentals, its current mission when one is configured, and its
full operating conventions, inlined rather than referenced, with no harness-specific extras. A
harness-specific entry file (for example, one named for a particular agent product) SHALL contain
nothing beyond an import of `AGENTS.md` plus that harness's own extras, and SHALL NOT duplicate
canonical content.

#### Scenario: A harness-specific entry file only imports
- **WHEN** a store's `contexture.yaml` declares a harness-specific entry filename
- **THEN** `contexture doctor` fails if that file contains convention text not present in `AGENTS.md`, and passes when it contains only the import plus harness-specific extras

#### Scenario: Reading only `AGENTS.md` is sufficient
- **WHEN** an agent with no harness-specific context reads `AGENTS.md` at a store's root
- **THEN** it finds the root-resolution rule, the frontmatter schema pointer, the write-path rule, a statement that agent identity and durable cross-session memory belong to its harness rather than to this store, the store's current mission when one is configured, and the store's full operating conventions, without needing to read any other file

#### Scenario: The canonical section names the mission document when configured
- **WHEN** a store's `contexture.yaml` declares `organize.mission_path` and the entry document is regenerated
- **THEN** the canonical section names that path as a document to load at session start, alongside the root-resolution rule, the frontmatter schema pointer, and the write-path rule — immediately followed by the "Mission" section carrying that document's full inlined body

#### Scenario: No mission pointer when unconfigured
- **WHEN** a store declares no `organize.mission_path` and the entry document is regenerated
- **THEN** the canonical section names no mission document, and regenerating again reports no change

### Requirement: Executable portability test
The store SHALL provide a command that exercises core store operations — at minimum, a retrieval
query, a derived-artifact build, and following one skill by path at the configured skills path — from
an environment with no harness-specific state present, and SHALL exit non-zero naming the first
failing operation if any operation fails. It SHALL also verify that every contexture-managed section of
`AGENTS.md` is present and, when operator conventions or a mission document are configured, that their
inlined content matches the source files on disk.

#### Scenario: Portability test passes with no harness state
- **WHEN** the portability test command runs in a freshly created worktree with no harness-specific configuration or state directories present
- **THEN** it exits 0

#### Scenario: Portability test names the failure
- **WHEN** one of the exercised operations fails during the portability test
- **THEN** the command exits non-zero and its output names which specific operation failed

#### Scenario: Portability test catches drifted inlined content
- **WHEN** a convention file or the configured mission document has changed on disk since `AGENTS.md` was last regenerated
- **THEN** the portability test exits non-zero naming the drifted source
