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
A store SHALL carry a contexture-owned baseline convention file at a fixed filename under the configured guidance directory, rendered from the store's own configuration (the configured relation vocabulary, archiving, git and session rules, directory-scoped convention discovery) — never a shipped profile's or one deployment's names. `init` SHALL write it; the update command SHALL rewrite it to match a fresh render whenever the template or the store's configuration changed, and SHALL leave every other file in the guidance directory (including the operator's own) untouched. Both SHALL be byte-stable when nothing has changed. The file SHALL be discoverable by the same mechanism that scans and inlines every other convention document into the generated entry document, requiring no composition step of its own.

#### Scenario: A fresh init delivers the baseline convention
- **WHEN** `contexture init` runs
- **THEN** the configured guidance path contains the baseline convention file, and it is inlined into the generated entry document's conventions section alongside any other file present

#### Scenario: A configuration change refreshes the baseline convention on update
- **WHEN** a store's configuration changes in a way that affects the baseline convention's rendered content (for example, a new relation name) and the update command runs
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

### Requirement: The shipped skills carry decision procedures for the configured taxonomy
contexture SHALL ship, as contexture-owned skills delivered by init and update, skills for: placement, ingest orchestration, connection finding, connection proposal, rollup, mission, session lifecycle, session capture, derived artifacts, organize audit, and publish. Each SHALL state its decision rules against the store's configured taxonomy and relation vocabulary — never a shipped profile's layer names — and SHALL name the command that verifies each step it asks for.

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
- **THEN** a merge and a worktree reclaim are each preceded by an explicit confirmation step, a push and a pull-request open are not (the request to submit is itself that consent), and the skill instructs a re-scan of git state before any plan and a verification of side effects before any retry

#### Scenario: Session capture proposes before it writes
- **WHEN** an agent follows the session-capture skill at the end of a session
- **THEN** it emits one proposal of store notes, each item individually identified, and writes only approved items into the store

#### Scenario: Derived-artifact skill checks before it builds
- **WHEN** an agent follows the derived-artifacts skill
- **THEN** it runs the check form of a build before the build, sanity-checks the reported counts, and never edits inside a `contexture:` fenced region

#### Scenario: Publish names the subject before scaffolding
- **WHEN** an agent follows the publish skill to build a page for a subject
- **THEN** it is instructed to resolve the subject's note set before copying any content out, and to fix the page's identity once via the naming command rather than hand-creating a folder

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

### Requirement: Submit and land are owned skills over git and gh
contexture SHALL ship `ctxr-submit` and `ctxr-land` as contexture-owned skills delivered by init and update. The submit skill SHALL run the re-scan, run the capture skill exactly once, stage named paths, run `ctxr doctor` for store-scope validation, and end in `git push` followed by `gh pr create` — without an intervening confirmation step, because the request to submit is itself the consent for both. The land skill SHALL name its target explicitly (never inferring it from the currently checked-out branch), read the pull request's state and mergeability with `gh pr view` before any side effect, gate the merge behind an explicit confirmation, merge with `gh pr merge`, confirm the forge reports merged before synchronizing, and route conflicting or unknown mergeability to the lifecycle skill's conflict playbook. The lifecycle skill SHALL cover start, re-scan, conflicts, sequencing, and reclaiming worktrees, and SHALL reference both skills without repeating their steps.

#### Scenario: Submit ends in git and gh, gated
- **WHEN** an agent follows the rendered submit skill
- **THEN** `ctxr doctor` runs before staging, the capture skill is invoked exactly once, and the branch rename is followed directly by `git push` and `gh pr create` with no confirmation step between them — the gate on this path is `ctxr doctor`, which submit may not proceed past, not a confirmation of the push itself

#### Scenario: Land checks state before merging and confirms after
- **WHEN** an agent follows the rendered land skill
- **THEN** it reads the pull request's state and mergeability with `gh pr view` before merging, gates the merge behind an explicit confirmation, and re-reads state after `gh pr merge` to confirm the forge reports merged rather than trusting the merge command's exit code

#### Scenario: Land names its target explicitly
- **WHEN** the land skill is rendered for a store
- **THEN** it instructs naming the target by branch name or pull-request number instead of relying on the current checkout

#### Scenario: Update delivers both to an existing store
- **WHEN** a store initialized before this change runs the update command
- **THEN** both skills are present at the configured skills path with the managed header, driving `git` and `gh` rather than a `ctxr session` subcommand, and the lifecycle skill no longer contains the submit or land steps

### Requirement: The session-capture skill applies through the command
The owned session-capture skill SHALL instruct the agent to write the approved items to a proposal file and run `ctxr session capture --proposal <file>`, and to take its report from the command's output.

#### Scenario: Skill applies via the command
- **WHEN** an agent follows the rendered skill's Apply step
- **THEN** the only write instruction is the capture command, and the report step references its output

#### Scenario: Skill names resolved identity paths
- **WHEN** the rendered skill is generated for any store
- **THEN** it names no identity file or path — the skill's contract covers store notes only, and identity is no longer a concept the skill or the command it invokes knows about

### Requirement: Vendored third-party skills are delivered and refreshed like owned ones
contexture SHALL ship a set of third-party skills inside its published package and, at `ctxr init` and `ctxr update`, SHALL write each one a store declares into the store's skills directories. A vendored skill's own files SHALL be written byte-identical to the packaged copy — contexture SHALL NOT insert its managed-owner header, or any other contexture-authored content, into a file it did not author. Each vendored skill SHALL be accompanied by its upstream license file. This requirement is the only place the shipped vendored set is enumerated; no other requirement may name a vendored skill.

The shipped set SHALL be, at minimum, one skill covering visual design direction for generated interfaces: `frontend-design`, redistributed from its upstream under Apache-2.0.

#### Scenario: Init delivers the vendored set
- **WHEN** `ctxr init` completes on a store whose configuration lists a vendored skill
- **THEN** that skill's directory exists under the store's skills directory, containing its `SKILL.md` byte-identical to the packaged copy and its upstream license file

#### Scenario: The managed-owner header is never inserted into vendored content
- **WHEN** a vendored skill is written into a store
- **THEN** its `SKILL.md` contains no contexture-authored header and its first line is the start of the file's own frontmatter block

### Requirement: A vendored skill carries a provenance record that identifies it
Each vendored skill directory SHALL contain a machine-readable provenance record written by contexture, recording at minimum the upstream source, the pinned upstream revision, the license identifier, and a content hash of the delivered skill file. Contexture SHALL treat a skill directory as vendored — and therefore as one it manages — if and only if that record is present, so that a directory without one is operator-authored and never touched.

#### Scenario: The provenance record accompanies the skill
- **WHEN** a vendored skill is written into a store
- **THEN** its directory contains a provenance record naming the upstream source, the pinned revision, the license, and a content hash

#### Scenario: A directory with no provenance record is left alone
- **WHEN** `ctxr update` runs against a store containing an operator-authored skill directory that carries neither the managed-owner header nor a provenance record
- **THEN** that directory is not rewritten, not removed, and not reported as drifted

### Requirement: A locally modified vendored skill is preserved and reported, never overwritten
When the delivered file of a vendored skill no longer matches the content hash in its provenance record, `ctxr update` SHALL leave every file in that directory unchanged and SHALL report the divergence naming the skill. When the hash still matches and the packaged copy differs, update SHALL rewrite the skill to the packaged copy. When the hash matches and the packaged copy is identical, update SHALL write nothing.

#### Scenario: An operator's edit survives an update
- **WHEN** an operator edits a vendored skill's `SKILL.md` and `ctxr update` runs
- **THEN** the edited file is byte-identical afterwards and the command's output names that skill as locally modified

#### Scenario: An unmodified vendored skill is refreshed to the packaged version
- **WHEN** a store's vendored skill still matches its recorded hash and the installed contexture package carries a different version of it
- **THEN** `ctxr update` rewrites it to the packaged version and updates the provenance record

#### Scenario: A current vendored skill makes update a no-op
- **WHEN** `ctxr update` runs twice against a store whose vendored skills are current
- **THEN** the second run writes no bytes and reports nothing changed for them

### Requirement: A store declares which vendored skills it wants
Configuration SHALL carry a list of the vendored skills a store wants installed, defaulting to the shipped set when the key is absent so that a store predating this configuration parses and behaves as if it declared the default. An empty list SHALL mean "install none", and SHALL cause `ctxr update` to remove any vendored skill directory it previously wrote whose delivered file still matches its recorded hash.

#### Scenario: A store predating the configuration key gets the default
- **WHEN** a `contexture.yaml` written before this key existed is read
- **THEN** it resolves to the shipped vendored set, with no migration required

#### Scenario: An empty list opts out and removes what contexture installed
- **WHEN** a store's configuration declares an empty vendored list and `ctxr update` runs
- **THEN** every unmodified vendored skill directory contexture previously wrote is removed

#### Scenario: Opting out never deletes a locally modified skill
- **WHEN** a store opts out while one vendored skill has been locally modified
- **THEN** that directory is left on disk and reported, rather than removed

### Requirement: Skills are written once, to the configured canonical directory
Contexture SHALL write every owned and vendored skill exactly once, into the store's configured skills path, which SHALL default for a newly initialized store to the ecosystem's cross-harness canonical location. The generated entry document SHALL index that path. A store that configures a different skills path SHALL have its skills written there instead, with no other behavior change.

#### Scenario: A new store gets the canonical location by default
- **WHEN** `ctxr init` runs with no skills-path override
- **THEN** the generated configuration names the cross-harness canonical skills location, and every owned and vendored skill is written there

#### Scenario: A store predating this default keeps its own path
- **WHEN** a store whose configuration already names a different skills path runs `ctxr update`
- **THEN** skills continue to be written to that configured path, with no relocation and no migration

### Requirement: A declared harness that reads elsewhere is bridged to the canonical directory
For each harness the operator declares whose adapter declares a skills directory different from the configured skills path, contexture SHALL make that directory resolve to the canonical one — preferring a directory symlink, and falling back to copying every skill into it when a symlink cannot be created. Contexture SHALL report which mechanism it used for each bridged harness. Bridging SHALL be idempotent: a directory that already resolves to the canonical location, whether directly or through a symlinked parent, SHALL be left unchanged.

#### Scenario: A branded harness directory is symlinked to the canonical one
- **WHEN** a store declares a harness whose adapter names a skills directory other than the configured skills path, on a platform where symlinks can be created
- **THEN** that directory is a symlink resolving to the configured skills path, no skill files are duplicated, and the command reports the harness as bridged by symlink

#### Scenario: Copying is used where a symlink cannot be created
- **WHEN** the same store is initialized where the platform or filesystem refuses symlink creation
- **THEN** every skill is copied into the harness's directory instead, the store is fully usable from that harness, and the command reports the harness as bridged by copy

#### Scenario: Bridging twice changes nothing
- **WHEN** `ctxr update` runs against a store whose declared harness directory already resolves to the canonical location
- **THEN** no bytes are written for that harness and nothing is reported as changed

#### Scenario: An undeclared harness is never bridged
- **WHEN** a harness is installed on the machine but not declared in the store's configuration
- **THEN** contexture creates no directory for it and does not inspect the machine to discover it

### Requirement: The operator declares which harnesses a store targets, at setup
`ctxr init` SHALL accept a non-interactive option naming the harnesses to configure, and SHALL prompt for them when run interactively without one, recording the selection in the store's configuration as declared adapters. Selecting none SHALL be permitted and SHALL leave the store with the canonical skills directory and no bridged harness. Contexture SHALL NOT infer the selection from what is installed on the machine.

#### Scenario: Harnesses are named non-interactively
- **WHEN** `ctxr init` runs with the harness option naming two harnesses
- **THEN** both are recorded as declared adapters in the generated configuration and both are bridged, with no prompt shown

#### Scenario: An interactive run prompts before writing
- **WHEN** `ctxr init` runs in an interactive terminal with no harness option
- **THEN** it presents the selectable harnesses and records the operator's choice before writing the configuration

#### Scenario: Selecting no harness is valid
- **WHEN** `ctxr init` runs selecting no harness
- **THEN** skills are written to the canonical skills directory, no harness directory is created, and the command exits successfully

### Requirement: A broken bridge is detected and repaired
When a declared harness's skills directory exists but neither resolves to the canonical directory nor contains the current skills — including the case where a checkout has materialized a symlink as a regular file — `ctxr doctor` SHALL report it as a broken bridge naming the harness, and `ctxr update` SHALL repair it by re-establishing the bridge, preferring a symlink and falling back to copying.

#### Scenario: A symlink materialized as a text file is reported and repaired
- **WHEN** a store is checked out where symlinks cannot be represented, leaving a declared harness's skills directory as a regular file containing a path
- **THEN** `ctxr doctor` reports a broken bridge naming that harness, and `ctxr update` replaces it with a working bridge

#### Scenario: A bridge pointing at the wrong location is repaired
- **WHEN** a declared harness's skills directory is a symlink resolving somewhere other than the configured skills path
- **THEN** `ctxr update` re-points it at the configured skills path and reports the repair
