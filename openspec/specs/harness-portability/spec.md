# harness-portability Specification

## Purpose

Keeps a contexture store operable from any agent harness — a coding agent with skill auto-discovery, one that reads only an entry document, a cron job, or a person at a terminal — by making the contexture-owned skills the portable surface: canonical content in the package, full copies in the store, delivered by `ctxr init` and refreshed by `ctxr update`, and indexed from the generated entry document. Those skills are decision procedures stated against whatever taxonomy, contexts, and relation vocabulary the store's `contexture.yaml` declares, never a shipped profile's or one deployment's names.

## Requirements

### Requirement: Operator conventions are referenced documents indexed by the entry document
A store MAY carry operator-authored convention documents as markdown files at a configured path. The generated portion of `AGENTS.md` SHALL include an index of every convention file present — its title and, when declared, a one-line description, both read from the file's frontmatter with a fallback to its first heading or filename — and SHALL reference each by path rather than inlining its content. When no convention files exist, the section SHALL state where to add them.

#### Scenario: A convention file appears in the index on regeneration
- **WHEN** an operator adds a markdown file with a frontmatter title and description at the configured conventions path and the entry document is regenerated
- **THEN** the `AGENTS.md` conventions index lists that title, description, and path, and the file's body is not copied into `AGENTS.md`

#### Scenario: An empty store still explains the mechanism
- **WHEN** a store has no convention files and the entry document is generated
- **THEN** the conventions section names the configured path and states that operator conventions added there will be indexed

### Requirement: The skill index reflects the files on disk
The `AGENTS.md` skill index SHALL list every skill markdown file present at the configured skills path — the shipped pack and any operator-added files — deriving each entry's name and description from the file itself (frontmatter, first-heading, or filename fallback). Harness skill generation (per `contexture-home-layout`) SHALL cover the same scanned set. The portability test SHALL verify every scanned skill has an index entry.

#### Scenario: An operator-added skill joins the index
- **WHEN** an operator adds a new skill file at the configured path and regeneration runs
- **THEN** the `AGENTS.md` index lists it, identically to a shipped skill

#### Scenario: Deleting a shipped skill's index entry still fails the portability test
- **WHEN** a skill file exists on disk but its index entry is removed from `AGENTS.md`
- **THEN** `verify --portable` exits non-zero naming that skill

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

### Requirement: Root resolution precedence
Any contexture command SHALL resolve the store root in this order: an explicit `--root` argument; the `CONTEXTURE_ROOT` environment variable; walking up from the current working directory looking for `contexture.yaml`. If none resolves, the command SHALL exit non-zero naming that no store root was found, and SHALL NOT guess a fallback location.

#### Scenario: Explicit argument overrides an inherited environment variable
- **WHEN** a command is invoked with `--root /path/a` while `CONTEXTURE_ROOT=/path/b` is set in the environment
- **THEN** the command operates against `/path/a`

#### Scenario: No root resolves
- **WHEN** a command is invoked with no `--root`, no `CONTEXTURE_ROOT`, and no `contexture.yaml` found by walking up from the current directory
- **THEN** the command exits non-zero with a message naming that no store root was found, and performs no store operation

### Requirement: Exactly one root environment variable and one root flag
The store root SHALL be addressable by exactly one environment variable and one command-line flag. No alias environment variable or flag name SHALL be introduced for the same purpose.

#### Scenario: No alias is recognized
- **WHEN** an operator sets an environment variable other than the one documented root variable, intending it to select the store root
- **THEN** contexture does not recognize it and falls through to the next resolution step

### Requirement: Skills are portable markdown reached by path
Reusable store skills SHALL be markdown files reachable by a documented path from `AGENTS.md`, readable and followable by any agent capable of reading files, independent of any harness's auto-discovery mechanism.

#### Scenario: A non-auto-discovering harness follows a skill
- **WHEN** an agent harness with no automatic skill-discovery mechanism is given the path to a skill listed in `AGENTS.md`
- **THEN** the agent can read and follow that skill's file directly, with no harness-specific adaptation required

### Requirement: Executable portability test
The store SHALL provide a command that exercises core store operations — at minimum, a retrieval query, a derived-artifact build, and following one skill via the `AGENTS.md` index — from an environment with no harness-specific state present, and SHALL exit non-zero naming the first failing operation if any operation fails.

#### Scenario: Portability test passes with no harness state
- **WHEN** the portability test command runs in a freshly created worktree with no harness-specific configuration or state directories present
- **THEN** it exits 0

#### Scenario: Portability test names the failure
- **WHEN** one of the exercised operations fails during the portability test
- **THEN** the command exits non-zero and its output names which specific operation failed

### Requirement: The shipped skills carry decision procedures
contexture SHALL ship, as contexture-owned skills delivered by init and update, skills for: placement, ingest orchestration, connection finding, connection proposal, rollup, session lifecycle, session capture, derived artifacts, organize audit, and publish. Each SHALL state its decision rules against the store's configured taxonomy, contexts, and relation vocabulary — never a shipped profile's layer names or any real context name — and SHALL name the command that verifies each step it asks for.

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

#### Scenario: Publish gates before it copies, and names the subject before scaffolding
- **WHEN** an agent follows the publish skill to build a page for a subject
- **THEN** it is instructed to run the disclosure gate over the subject's resolved note set before copying any content out, to treat an ASK verdict as a stop that names the note to the operator, and to fix the page's identity once via the naming command rather than hand-creating a folder

#### Scenario: Update delivers the expanded skill set to an existing store
- **WHEN** a store initialized before this change runs the update command
- **THEN** every owned skill above is present at the configured skills path with the managed header, and a second update reports nothing changed

### Requirement: Owned skills read the vocabulary and the graph document from configuration
The connection-proposal skill SHALL group proposals by the relation vocabulary declared in configuration and fall back to a single group when it is empty; the connection-finding and ingest-orchestration skills SHALL direct the agent to the graph document at its configured path for cluster context; and the generated entry document's retrieval section SHALL name that path. No skill SHALL hardcode a relation name.

#### Scenario: Vocabulary flows into the proposal skill
- **WHEN** a store's configuration declares the relation names `supports` and `contradicts`
- **THEN** the rendered connection-proposal skill lists those two groups and no other relation name

#### Scenario: Empty vocabulary yields one group
- **WHEN** a store declares no relation vocabulary
- **THEN** the rendered skill instructs a single group and names no relation

### Requirement: The skills path is a harness's native skill directory
The configured skills path SHALL be usable as a harness's native skill directory, so a harness with skill auto-discovery finds every skill without an intermediate file, while any other harness reaches the same file by path from `AGENTS.md`.

#### Scenario: A skill-discovering harness surfaces every skill without an intermediate hop
- **WHEN** a store's skills path is that harness's skill directory
- **THEN** every skill is discoverable there as a complete skill file — the file the harness loads is the file `AGENTS.md` indexes

### Requirement: Submit and land are owned skills
contexture SHALL ship `ctxr-submit` and `ctxr-land` as contexture-owned skills delivered by init and update. The submit skill SHALL run the re-scan, run the capture skill exactly once, stage named paths, gate the external side effect, and end in `ctxr session submit`; the land skill SHALL end in `ctxr session land`, SHALL instruct naming the target with `--branch` or `--pr` rather than relying on whichever checkout the agent is in, SHALL state that a reap must run from outside the worktree being reaped, SHALL route conflicts to the lifecycle skill's playbook, and SHALL NOT instruct a manual merge. The lifecycle skill SHALL cover start, re-scan, conflicts, and sequencing and SHALL reference both without repeating their steps.

#### Scenario: Submit ends in the command
- **WHEN** an agent follows the rendered submit skill
- **THEN** its only write instruction after the gate is `ctxr session submit`, and the capture skill is invoked once

#### Scenario: Land never merges by hand
- **WHEN** an agent follows the rendered land skill
- **THEN** the merge step is `ctxr session land` and no forge command appears in the skill

#### Scenario: Land names its target and where a reap runs
- **WHEN** the land skill is rendered for a store
- **THEN** it instructs naming the target with `--branch <name>` or `--pr <n>` instead of relying on the current checkout, and states that `--reap` cannot remove the worktree the command is running from

#### Scenario: Update delivers both to an existing store
- **WHEN** a store initialized before this change runs the update command
- **THEN** both skills are present at the configured skills path with the managed header and the lifecycle skill no longer contains the submit or land steps

### Requirement: The session-capture skill applies through the command
The owned session-capture skill SHALL instruct the agent to write the approved items to a proposal file and run `ctxr session capture --proposal <file>`, and to take its report from the command's output.

#### Scenario: Skill applies via the command
- **WHEN** an agent follows the rendered skill's Apply step
- **THEN** the only write instruction is the capture command, and the report step references its output

#### Scenario: Skill names resolved identity paths
- **WHEN** the rendered skill is generated for any store
- **THEN** it names no identity file or path — the skill's contract covers store notes only, and identity is no longer a concept the skill or the command it invokes knows about
