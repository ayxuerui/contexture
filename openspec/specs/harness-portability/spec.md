# harness-portability Specification

## Purpose

Keeps a contexture store operable from any agent harness — a coding agent with skill auto-discovery, one that reads only an entry document, a cron job, or a person at a terminal — by making the contexture-owned skills the portable surface: canonical content in the package, full copies in the store, delivered by `ctxr init` and refreshed by `ctxr update`, and reachable from the generated entry document by path. Those skills are decision procedures stated against whatever taxonomy, contexts, and relation vocabulary the store's `contexture.yaml` declares, never a shipped profile's or one deployment's names.

## Requirements

### Requirement: Operator conventions are inlined into the entry document
A store MAY carry operator-authored convention documents as markdown files at a configured path. The generated "Store conventions" section of `AGENTS.md` SHALL inline the full body of every convention file present, with its frontmatter stripped, its headings demoted so the shallowest sits directly under the section's own heading, and a provenance line naming its source path. When no convention files exist, the section SHALL state where to add them.

#### Scenario: A convention file's body is inlined on regeneration
- **WHEN** an operator adds a markdown file with a frontmatter title at the configured conventions path and the entry document is regenerated
- **THEN** the `AGENTS.md` conventions section contains that file's full body under a heading naming its title, with a line naming its source path, and its own headings demoted one level below the section heading

#### Scenario: An empty store still explains the mechanism
- **WHEN** a store has no convention files and the entry document is generated
- **THEN** the conventions section names the configured path and states that operator conventions added there will be inlined

#### Scenario: Inlining is byte-stable
- **WHEN** the entry document is regenerated against unchanged convention files
- **THEN** the conventions section is byte-identical and regeneration reports no change

### Requirement: A shipped baseline convention is delivered into the guidance directory and refreshed by update
A store SHALL carry a contexture-owned baseline convention file at a fixed filename under the configured guidance directory, rendered from the store's own configuration (the visibility field and its resolution order, configured directory defaults, the disclosure ladder, the configured relation vocabulary, archiving, git and session rules, directory-scoped convention discovery) — never a shipped profile's or one deployment's names. `init` SHALL write it; the update command SHALL rewrite it to match a fresh render whenever the template or the store's configuration changed, and SHALL leave every other file in the guidance directory (including the operator's own) untouched. Both SHALL be byte-stable when nothing has changed. The file SHALL be discoverable by the same mechanism that scans and inlines every other convention document into the generated entry document, requiring no composition step of its own.

#### Scenario: A fresh init delivers the baseline convention
- **WHEN** `contexture init` runs
- **THEN** the configured guidance path contains the baseline convention file, and it is inlined into the generated entry document's conventions section alongside any other file present

#### Scenario: A configuration change refreshes the baseline convention on update
- **WHEN** a store's configuration changes in a way that affects the baseline convention's rendered content (for example, a new hard wall) and the update command runs
- **THEN** the baseline convention file is rewritten to reflect the change, and the entry document's conventions section reflects it after regeneration

#### Scenario: A second update with nothing changed is a no-op
- **WHEN** the update command runs twice in a row with no configuration or template change between runs
- **THEN** the second run reports no change to the baseline convention file

### Requirement: An operator convention file is seeded with prompts only
`init` SHALL seed one operator-authored convention file in the guidance directory, containing heading prompts for content specific to the store (placement distinctions, content style, tag vocabulary, store context) and no invented content. Once the file exists, it SHALL never be rewritten by `init` or the update command.

#### Scenario: The seed is not overwritten on a later init or update
- **WHEN** an operator has edited the seeded convention file and `init` or the update command runs again
- **THEN** the file's content is unchanged

### Requirement: A size budget with defined behavior at the limit
The entry document's inlined conventions section SHALL have a configured maximum size (`harness.convention_max_bytes`, defaulting to a shipped constant) in `contexture.yaml`. `contexture doctor` SHALL fail when the section's rendered size exceeds that maximum, naming the current size and the configured budget.

#### Scenario: An oversized conventions section fails doctor
- **WHEN** the entry document's inlined conventions section's rendered size exceeds its configured maximum
- **THEN** `contexture doctor` reports a failing check naming the current size and the configured budget

#### Scenario: A store with no override uses the shipped default
- **WHEN** a store's `contexture.yaml` declares no `harness.convention_max_bytes`
- **THEN** the check measures the section against the shipped default budget

### Requirement: Contexture-owned skills are copied into the store and refreshed by update
The shipped skills SHALL be contexture-owned: their canonical content ships with the tool, and a store SHALL carry a full copy of each at the configured skills path in the skill layout (`<slug>/SKILL.md`), marked as managed. `init` SHALL write them; a dedicated update command SHALL bring every contexture-owned file in a store — generated entry-document sections, managed ignore blocks, hooks, skill copies, and adapter outputs — to the installed tool version without touching operator-authored content. Both SHALL be byte-stable when nothing has changed.

#### Scenario: Update refreshes a drifted copy and leaves operator content alone
- **WHEN** a contexture-owned skill copy differs from the installed version and an operator-authored skill sits alongside it, and the update command runs
- **THEN** the contexture-owned copy is rewritten to the installed version, the operator skill is byte-identical, and an immediately repeated update reports nothing changed

### Requirement: `AGENTS.md` is the canonical entry document
Every context store SHALL carry an `AGENTS.md` file at its root that is the canonical, harness-agnostic entry document for the store — its fundamentals, its current mission when one is configured, and its full operating conventions, inlined rather than referenced, with no harness-specific extras. A harness-specific entry file (for example, one named for a particular agent product) SHALL contain nothing beyond an import of `AGENTS.md` plus that harness's own extras, and SHALL NOT duplicate canonical content.

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

### Requirement: The entry document inlines the mission document when configured
When a store's `contexture.yaml` declares `organize.mission_path` and the note at that path exists, `AGENTS.md` SHALL carry a "Mission" section inlining that note's full body — frontmatter stripped, nested `contexture:` fence markers stripped so only the fence's content is copied, headings demoted so the shallowest sits directly under the section heading. When no mission path is configured, or the configured note does not exist, the section SHALL be absent entirely, and regenerating SHALL report no change once already absent.

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
`ctxr doctor` SHALL fail when `AGENTS.md`'s inlined conventions section or Mission section no longer matches the current content of its source file (a convention file changed after the last regeneration, or the mission document changed after its last rollup-triggered refresh), naming the drifted source. The pre-commit hook SHALL refuse a commit that stages a change to a convention file or to the configured mission document while leaving `AGENTS.md` stale relative to that change.

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
The entry document's contexture-managed sections SHALL render, on a freshly initialized store, in a fixed order: store fundamentals, mission (when configured), retrieval routing, capture, placement, then store conventions. On an existing store whose managed sections are contiguous (separated only by blank lines), `ctxr update` SHALL reorder them to match. When hand-written content interrupts that contiguity, `ctxr update` SHALL leave the existing section order unchanged rather than reordering around foreign content, and SHALL report this via `ctxr lint` as an observation rather than a `ctxr doctor` failure — `doctor` runs only invariant-severity checks (per store-integrity's own "observation checks never fail a run"), so a non-blocking finding is a `lint` finding by construction, never a `doctor` one.

#### Scenario: A first-time init writes sections in the fixed order
- **WHEN** `ctxr init` runs against a store with no existing `AGENTS.md`
- **THEN** the generated sections appear in the fixed order

#### Scenario: A drifted but contiguous store converges on update
- **WHEN** an existing store's managed sections are in a different order but are separated only by blank lines, and `ctxr update` runs
- **THEN** the sections are reordered to match the fixed order, and hand-written content outside every managed section is preserved unchanged

#### Scenario: Hand-written content between sections blocks reordering
- **WHEN** hand-written content sits between two managed sections and `ctxr update` runs
- **THEN** the existing order is left unchanged, and `ctxr lint` reports the interruption as an observation

### Requirement: The canonical section states the harness/store identity boundary
The canonical section SHALL state, on every store regardless of configuration, that agent identity, persona, and durable cross-session memory are the harness's responsibility, not the store's — the store holds knowledge and skills. This statement SHALL reference paths (the skills path) rather than inlining any identity content, and SHALL NOT introduce a configuration key, command, or adapter kind for identity.

#### Scenario: The boundary statement is present on every store
- **WHEN** the entry document is generated for a store, regardless of what its `contexture.yaml` declares
- **THEN** the canonical section states that identity and durable cross-session memory belong to the harness, not the store, and names no identity file or path of its own

#### Scenario: A second generation is byte-stable
- **WHEN** the entry document is regenerated against unchanged configuration
- **THEN** the boundary statement's text is unchanged and regeneration reports no change

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
The store SHALL provide a command that exercises core store operations — at minimum, a retrieval query, a derived-artifact build, and following one skill by path at the configured skills path — from an environment with no harness-specific state present, and SHALL exit non-zero naming the first failing operation if any operation fails. It SHALL also verify that every contexture-managed section of `AGENTS.md` is present and, when operator conventions or a mission document are configured, that their inlined content matches the source files on disk.

#### Scenario: Portability test passes with no harness state
- **WHEN** the portability test command runs in a freshly created worktree with no harness-specific configuration or state directories present
- **THEN** it exits 0

#### Scenario: Portability test names the failure
- **WHEN** one of the exercised operations fails during the portability test
- **THEN** the command exits non-zero and its output names which specific operation failed

#### Scenario: Portability test catches drifted inlined content
- **WHEN** a convention file or the configured mission document has changed on disk since `AGENTS.md` was last regenerated
- **THEN** the portability test exits non-zero naming the drifted source

### Requirement: The shipped skills carry decision procedures
contexture SHALL ship, as contexture-owned skills delivered by init and update, skills for: placement, ingest orchestration, connection finding, connection proposal, rollup, mission, session lifecycle, session capture, derived artifacts, and organize audit. Each SHALL state its decision rules against the store's configured taxonomy, contexts, and relation vocabulary — never a shipped profile's layer names or any real context name — and SHALL name the command that verifies each step it asks for.

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

#### Scenario: Mission skill teaches the maintenance discipline
- **WHEN** a store's configured taxonomy is passed to the mission skill
- **THEN** the skill states that the document must be kept current from recent work and the store's taxonomy layers, that every active priority names its status, purpose, and next useful action, that back-burner items state why they are not active, and that sunset candidates and operational debt are carried as their own sections

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

### Requirement: The session-lifecycle skill reflects external workspace ownership
When a store's configuration declares `session.workspaces_external: true`, the rendered session-lifecycle skill SHALL state that session worktrees are provided by an external process and that the procedure MUST NOT create, switch, unlock, remove, or prune one. When the key is false or unset, the rendered skill SHALL retain its existing worktree-lifecycle instructions unchanged.

#### Scenario: External ownership is stated in the rendered skill
- **WHEN** a store declares `session.workspaces_external: true` and the session-lifecycle skill is rendered
- **THEN** the rendered text states that worktrees are externally provided and instructs against creating, switching, unlocking, removing, or pruning one

#### Scenario: Default rendering is unchanged
- **WHEN** a store declares no `session.workspaces_external` key (or declares it `false`) and the session-lifecycle skill is rendered
- **THEN** the rendered text is identical to a store initialized before this change

### Requirement: The session-capture skill applies through the command
The owned session-capture skill SHALL instruct the agent to write the approved items to a proposal file and run `ctxr session capture --proposal <file>`, and to take its report from the command's output.

#### Scenario: Skill applies via the command
- **WHEN** an agent follows the rendered skill's Apply step
- **THEN** the only write instruction is the capture command, and the report step references its output

#### Scenario: Skill names resolved identity paths
- **WHEN** the rendered skill is generated for any store
- **THEN** it names no identity file or path — the skill's contract covers store notes only, and identity is no longer a concept the skill or the command it invokes knows about
