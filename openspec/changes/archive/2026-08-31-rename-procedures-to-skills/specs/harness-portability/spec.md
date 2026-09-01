## REMOVED Requirements

### Requirement: The procedure index reflects the files on disk
**Reason**: Renamed to "The skill index reflects the files on disk". The requirement's scenario labels also carried the old term, so this is expressed as a removal plus an addition rather than a rename — a RENAMED delta cannot relabel scenarios.
**Migration**: None for any store. The behavior is unchanged; only the vocabulary is. The replacement requirement is under ADDED below.

### Requirement: Procedures are portable markdown reached by path
**Reason**: Renamed to "Skills are portable markdown reached by path", with its scenario relabelled for the same reason as above.
**Migration**: None for any store; behavior unchanged.

### Requirement: Procedures are reachable at a skill-discovery path
**Reason**: The old title was tautological once the unit is called a skill ("procedures are reachable at a skill-discovery path"). Replaced by "The skills path is a harness's native skill directory", which states the same contract in one vocabulary.
**Migration**: None for any store; behavior unchanged.

## ADDED Requirements

### Requirement: The skill index reflects the files on disk
The `AGENTS.md` skill index SHALL list every skill markdown file present at the configured skills path — the shipped pack and any operator-added files — deriving each entry's name and description from the file itself (frontmatter, first-heading, or filename fallback). Harness skill generation (per `contexture-home-layout`) SHALL cover the same scanned set. The portability test SHALL verify every scanned skill has an index entry.

#### Scenario: An operator-added skill joins the index
- **WHEN** an operator adds a new skill file at the configured path and regeneration runs
- **THEN** the `AGENTS.md` index lists it, identically to a shipped skill

#### Scenario: Deleting a shipped skill's index entry still fails the portability test
- **WHEN** a skill file exists on disk but its index entry is removed from `AGENTS.md`
- **THEN** `verify --portable` exits non-zero naming that skill

### Requirement: Skills are portable markdown reached by path
Reusable store skills SHALL be markdown files reachable by a documented path from `AGENTS.md`, readable and followable by any agent capable of reading files, independent of any harness's auto-discovery mechanism.

#### Scenario: A non-auto-discovering harness follows a skill
- **WHEN** an agent harness with no automatic skill-discovery mechanism is given the path to a skill listed in `AGENTS.md`
- **THEN** the agent can read and follow that skill's file directly, with no harness-specific adaptation required

### Requirement: The skills path is a harness's native skill directory
The configured skills path SHALL be usable as a harness's native skill directory, so a harness with skill auto-discovery finds every skill without an intermediate file, while any other harness reaches the same file by path from `AGENTS.md`.

#### Scenario: A skill-discovering harness surfaces every skill without an intermediate hop
- **WHEN** a store's skills path is that harness's skill directory
- **THEN** every skill is discoverable there as a complete skill file — the file the harness loads is the file `AGENTS.md` indexes

## MODIFIED Requirements

### Requirement: Contexture-owned skills are copied into the store and refreshed by update
The shipped skills SHALL be contexture-owned: their canonical content ships with the tool, and a store SHALL carry a full copy of each at the configured skills path in the skill layout (`<slug>/SKILL.md`), marked as managed. `init` SHALL write them; a dedicated update command SHALL bring every contexture-owned file in a store — generated entry-document sections, managed ignore blocks, hooks, skill copies, and adapter outputs — to the installed tool version without touching operator-authored content. Both SHALL be byte-stable when nothing has changed.

#### Scenario: Update refreshes a drifted copy and leaves operator content alone
- **WHEN** a contexture-owned skill copy differs from the installed version and an operator-authored skill sits alongside it, and the update command runs
- **THEN** the contexture-owned copy is rewritten to the installed version, the operator skill is byte-identical, and an immediately repeated update reports nothing changed

### Requirement: `AGENTS.md` is the canonical entry document
Every context store SHALL carry an `AGENTS.md` file at its root that is the canonical, harness-agnostic index of the store's conventions and skills. A harness-specific entry file (for example, one named for a particular agent product) SHALL contain nothing beyond an import of `AGENTS.md` plus that harness's own extras, and SHALL NOT duplicate canonical content.

#### Scenario: A harness-specific entry file only imports
- **WHEN** a store's `contexture.yaml` declares a harness-specific entry filename
- **THEN** `contexture doctor` fails if that file contains convention text not present in `AGENTS.md`, and passes when it contains only the import plus harness-specific extras

#### Scenario: Reading only `AGENTS.md` is sufficient
- **WHEN** an agent with no harness-specific context reads `AGENTS.md` at a store's root
- **THEN** it finds the root-resolution rule, the frontmatter schema pointer, the write-path rule, and an index of every store skill, without needing to read any other file

### Requirement: Executable portability test
The store SHALL provide a command that exercises core store operations — at minimum, a retrieval query, a derived-artifact build, and following one skill via the `AGENTS.md` index — from an environment with no harness-specific state present, and SHALL exit non-zero naming the first failing operation if any operation fails.

#### Scenario: Portability test passes with no harness state
- **WHEN** the portability test command runs in a freshly created worktree with no harness-specific configuration or state directories present
- **THEN** it exits 0

#### Scenario: Portability test names the failure
- **WHEN** one of the exercised operations fails during the portability test
- **THEN** the command exits non-zero and its output names which specific operation failed

### Requirement: The shipped skills carry decision procedures
contexture SHALL ship, as contexture-owned skills delivered by init and update, skills for: placement, ingest orchestration, connection finding, connection proposal, rollup, session lifecycle, session capture, derived artifacts, and organize audit. Each SHALL state its decision rules against the store's configured taxonomy, contexts, and relation vocabulary — never a shipped profile's layer names or any real context name — and SHALL name the command that verifies each step it asks for.

#### Scenario: Placement teaches the visibility-collision test
- **WHEN** a store is initialized
- **THEN** its placement skill states that two locations whose configured visibility defaults differ must not be merged, and that visibility may override location for content bridging contexts

#### Scenario: Placement's termination test follows the configured taxonomy
- **WHEN** a store's configured taxonomy declares a layer whose description implies an end state
- **THEN** the placement skill includes a test for whether a note has an end state; a store whose taxonomy declares no such layer receives no such test

#### Scenario: Connection proposal reads before it proposes
- **WHEN** an agent follows the connection-proposal skill
- **THEN** it is instructed to read each candidate note before proposing a link, to group proposals by the store's configured relation vocabulary (a single group when none is configured), and to confirm before writing

#### Scenario: Rollup refuses to create or to run thin
- **WHEN** an agent follows the rollup skill against a name that resolves to no note, or to a dated or infrastructure note, or to fewer sources than the stated minimum
- **THEN** the skill instructs it to stop and report rather than create the entity note, treat the non-entity as an entity, or write a thin rollup

#### Scenario: Session lifecycle gates every external side effect
- **WHEN** an agent follows the session-lifecycle skill
- **THEN** a push, a pull-request open, and a merge are each preceded by an explicit confirmation step, and the skill instructs a re-scan of git state before any plan and a verification of side effects before any retry

#### Scenario: Session capture proposes before it writes
- **WHEN** an agent follows the session-capture skill at the end of a session
- **THEN** it emits one proposal of store notes, each item individually identified, and writes only approved items into the store

#### Scenario: Derived-artifact skill checks before it builds
- **WHEN** an agent follows the derived-artifacts skill
- **THEN** it runs the check form of a build before the build, sanity-checks the reported counts, and never edits inside a `contexture:` fenced region

#### Scenario: Update delivers the expanded skill set to an existing store
- **WHEN** a store initialized before this change runs the update command
- **THEN** every owned skill above is present at the configured skills path with the managed header, and a second update reports nothing changed

### Requirement: Submit and land are owned skills
contexture SHALL ship `ctxr-submit` and `ctxr-land` as contexture-owned skills delivered by init and update. The submit skill SHALL run the re-scan, run the capture skill exactly once, stage named paths, gate the external side effect, and end in `ctxr session submit`; the land skill SHALL end in `ctxr session land`, SHALL route conflicts to the lifecycle skill's playbook, and SHALL NOT instruct a manual merge. The lifecycle skill SHALL cover start, re-scan, conflicts, and sequencing and SHALL reference both without repeating their steps.

#### Scenario: Submit ends in the command
- **WHEN** an agent follows the rendered submit skill
- **THEN** its only write instruction after the gate is `ctxr session submit`, and the capture skill is invoked once

#### Scenario: Land never merges by hand
- **WHEN** an agent follows the rendered land skill
- **THEN** the merge step is `ctxr session land` and no forge command appears in the skill

#### Scenario: Update delivers both to an existing store
- **WHEN** a store initialized before this change runs the update command
- **THEN** both skills are present at the configured skills path with the managed header and the lifecycle skill no longer contains the submit or land steps
