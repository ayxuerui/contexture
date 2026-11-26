# harness-portability Specification

## Purpose

Keeps a contexture store operable from any agent harness — a coding agent with skill auto-discovery, one that reads only an entry document, a cron job, or a person at a terminal — by making the contexture-owned skills the portable surface: canonical content in the package, full copies in the store, delivered by `ctxr init` and refreshed by `ctxr update`, and reachable from the generated entry document by path. Those skills are decision procedures stated against whatever taxonomy, contexts, and relation vocabulary the store's `contexture.yaml` declares, never a shipped profile's or one deployment's names.

## Requirements

### Requirement: Operator conventions are inlined into the entry document
A store MAY carry operator-authored convention documents as markdown files at a configured path. The generated "Store conventions" section of `AGENTS.md` SHALL inline the full body of every convention file present that does not load on demand (governed by *A guidance document may load on demand*). Each inlined body SHALL have its frontmatter stripped, its headings demoted so the shallowest sits directly under the section's own heading, and a provenance line naming its source path. When no convention files exist, the section SHALL state where to add them.

#### Scenario: A convention file's body is inlined on regeneration
- **WHEN** an operator adds a markdown file with a frontmatter title, that does not load on demand, at the configured conventions path and the entry document is regenerated
- **THEN** the `AGENTS.md` conventions section contains that file's full body under a heading naming its title, with a line naming its source path, and its own headings demoted one level below the section heading

#### Scenario: An empty store still explains the mechanism
- **WHEN** a store has no convention files and the entry document is generated
- **THEN** the conventions section names the configured path and states that operator conventions added there will be inlined, or indexed when they declare when to read them

#### Scenario: Inlining is byte-stable
- **WHEN** the entry document is regenerated against unchanged convention files
- **THEN** the conventions section is byte-identical and regeneration reports no change

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
The shipped skills SHALL be contexture-owned: their canonical content ships with the tool, and a store SHALL carry a full copy of each at the configured skills path in the skill layout: a directory `<slug>/` holding `SKILL.md`, marked as managed, and any supporting files the skill ships beside it (governed by the requirement *Owned skills may carry supporting files*). `init` SHALL write them, together with every other contexture-owned file the update command brings current, including each declared harness's adapter outputs; a dedicated update command SHALL bring every contexture-owned file in a store — generated entry-document sections, managed ignore blocks, hooks, skill copies, and adapter outputs — to the installed tool version without touching operator-authored content. Both SHALL be byte-stable when nothing has changed.

#### Scenario: Update refreshes a drifted copy and leaves operator content alone
- **WHEN** a contexture-owned skill copy differs from the installed version and an operator-authored skill sits alongside it, and the update command runs
- **THEN** the contexture-owned copy is rewritten to the installed version, the operator skill is byte-identical, and an immediately repeated update reports nothing changed

### Requirement: `AGENTS.md` is the canonical entry document
Every context store SHALL carry an `AGENTS.md` file at its root that is the canonical, harness-agnostic entry document for the store. It holds the store's fundamentals, its current mission when one is configured, and its every-turn operating conventions inlined, with no harness-specific extras. It also holds an index naming, for every guidance document that loads on demand, when to read it and where it is. A harness-specific entry file (for example, one named for a particular agent product) SHALL contain nothing beyond an import of `AGENTS.md` plus that harness's own extras, and SHALL NOT duplicate canonical content.

#### Scenario: A harness-specific entry file only imports
- **WHEN** a store's `contexture.yaml` declares a harness-specific entry filename
- **THEN** `contexture doctor` fails if that file contains convention text not present in `AGENTS.md`, and passes when it contains only the import plus harness-specific extras

#### Scenario: Reading only `AGENTS.md` is sufficient
- **WHEN** an agent with no harness-specific context reads `AGENTS.md` at a store's root
- **THEN** it finds all of the following without needing to read any other file to learn what exists:
  - the root-resolution rule
  - the frontmatter schema pointer
  - the write-path rule
  - a statement that agent identity, persona, and the agent's conversational recall of the user and of itself belong to its harness while subject-matter knowledge belongs to this store
  - the store's current mission when one is configured
  - the store's every-turn conventions
  - for every on-demand guidance document, its title, when to read it, and its path

#### Scenario: The canonical section names the mission document when configured
- **WHEN** a store's `contexture.yaml` declares `organize.mission_path` and the entry document is regenerated
- **THEN** the "Mission" section carries that document's inlined core with a line naming that path as its source, and the canonical section carries no separate instruction to load the document, since its content is already inlined

#### Scenario: No mission pointer when unconfigured
- **WHEN** a store declares no `organize.mission_path` and the entry document is regenerated
- **THEN** neither the canonical section nor any other section names a mission document, and regenerating again reports no change

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
`ctxr doctor` SHALL fail when `AGENTS.md` no longer matches its sources, naming the drifted source. This covers three cases:
- the inlined conventions section no longer matches a convention file's current content;
- the guidance index no longer matches an on-demand document's current title, trigger, or presence;
- the Mission section no longer matches the mission document, for example because it changed after its last rollup-triggered refresh.

The pre-commit hook SHALL refuse a commit that stages a change to a convention file or to the configured mission document while leaving `AGENTS.md` stale relative to that change.

#### Scenario: Doctor detects a drifted convention file
- **WHEN** a convention file is edited directly (not through a commit that also regenerates `AGENTS.md`), whether its inlined body or its on-demand title or trigger changed, and `ctxr doctor` runs
- **THEN** it fails, naming the drifted convention file's path

#### Scenario: Doctor detects a drifted mission document
- **WHEN** the mission document is edited by a means other than `ctxr rollup write` and `ctxr doctor` runs
- **THEN** it fails, naming the mission document's path

#### Scenario: A commit that would leave the entry document stale is refused
- **WHEN** a commit stages a change to a convention file (inlined or on-demand) or the mission document without a corresponding regeneration of `AGENTS.md`
- **THEN** the pre-commit hook refuses the commit and names the file that would drift

#### Scenario: A synchronized store passes
- **WHEN** every convention file and the mission document match what `AGENTS.md` currently inlines or indexes
- **THEN** `ctxr doctor` reports no drift finding

### Requirement: Generated sections render in a fixed order
The entry document's contexture-managed sections SHALL render, on a freshly initialized store, in a fixed order: store fundamentals, mission (when configured), retrieval routing, capture, placement, shared stores (when the store declares any), store conventions, then the guidance index (when any document loads on demand). The shared-stores section SHALL name each declared mount and its location, and SHALL state that a write to a mounted store is a session started inside that mount, reviewed and landed by that store. On an existing store whose managed sections are contiguous (separated only by blank lines), `ctxr update` SHALL reorder them to match. When hand-written content interrupts that contiguity, `ctxr update` SHALL leave the existing section order unchanged rather than reordering around foreign content. It SHALL report this via `ctxr lint` as an observation, not as a `ctxr doctor` failure. `doctor` runs only invariant-severity checks (per store-integrity's own "observation checks never fail a run"), so a non-blocking finding is a `lint` finding by construction, never a `doctor` one.

#### Scenario: A first-time init writes sections in the fixed order
- **WHEN** `ctxr init` runs against a store with no existing `AGENTS.md`
- **THEN** the generated sections appear in the fixed order

#### Scenario: A drifted but contiguous store converges on update
- **WHEN** an existing store's managed sections are in a different order but are separated only by blank lines, and `ctxr update` runs
- **THEN** the sections are reordered to match the fixed order, and hand-written content outside every managed section is preserved unchanged

#### Scenario: Hand-written content between sections blocks reordering
- **WHEN** hand-written content sits between two managed sections and `ctxr update` runs
- **THEN** the existing order is left unchanged, and `ctxr lint` reports the interruption as an observation

#### Scenario: A store with mounts gets the shared-stores section after placement
- **WHEN** a store declares a `shared_stores` key and its entry document is generated
- **THEN** a shared-stores section naming each mount and its location appears after the placement section and before the store conventions section

#### Scenario: A store without mounts gets no shared-stores section
- **WHEN** a store has no `shared_stores` key and its entry document is generated
- **THEN** no shared-stores section appears, and the document is byte-identical to one generated before this section existed

### Requirement: The canonical section states the harness/store identity boundary
The canonical section SHALL state, on every store regardless of configuration, that agent identity, persona, and the agent's conversational recall — what it remembers of the user and of itself across sessions — are the harness's responsibility, not the store's, and that subject-matter knowledge, including knowledge worth retrieving in a later session, is the store's — the store holds knowledge and skills. This statement SHALL reference paths (the skills path) rather than inlining any identity content, and SHALL NOT introduce a configuration key, command, or adapter kind for identity.

#### Scenario: The boundary statement is present on every store
- **WHEN** the entry document is generated for a store, regardless of what its `contexture.yaml` declares
- **THEN** the canonical section states that identity, persona, and the agent's conversational recall belong to the harness, not the store, states that subject-matter knowledge belongs to the store, and names no identity file or path of its own

#### Scenario: A second generation is byte-stable
- **WHEN** the entry document is regenerated against unchanged configuration
- **THEN** the boundary statement's text is unchanged and regeneration reports no change

### Requirement: Root resolution precedence
Any contexture command SHALL resolve the store root in this order: an explicit `--root` argument; the
store root found by walking up from the current working directory when that root is a linked git
worktree of the store named by the `CONTEXTURE_STORE_ROOT` environment variable; the store root found
by walking up from the current working directory when that root is a mount the named store declares
(per shared-stores), or a linked git worktree of such a mount; the
`CONTEXTURE_STORE_ROOT` environment variable; walking up from the current working directory looking
for `contexture.yaml`. If none resolves, the command SHALL exit non-zero naming that no store root
was found, and SHALL NOT guess a fallback location.

The worktree step SHALL be consulted only when `CONTEXTURE_STORE_ROOT` is set and no `--root`
argument was given, and SHALL redirect only to a checkout of the very store that variable names. The
mount step SHALL be consulted under the same conditions, and SHALL redirect only to a root located at,
or a worktree of, a mount location that the named store's configuration declares. When
the store root found from the current directory belongs to a different repository than the one the
variable names, the variable SHALL resolve unchanged. The step SHALL be decided from the filesystem
without invoking git, and SHALL fall back to resolving the variable whenever it cannot decide.

#### Scenario: Explicit argument overrides an inherited environment variable
- **WHEN** a command is invoked with `--root /path/a` while `CONTEXTURE_STORE_ROOT=/path/b` is set in the environment
- **THEN** the command operates against `/path/a`

#### Scenario: An explicit argument overrides the worktree the caller is standing in
- **WHEN** a command is invoked with `--root <store>` from inside a linked worktree of that same store, with `CONTEXTURE_STORE_ROOT` set
- **THEN** the command operates against the named root and the worktree step does not redirect it

#### Scenario: A command run from a session worktree operates on that worktree
- **WHEN** a command is invoked with no `--root` from inside a linked git worktree of the store named by `CONTEXTURE_STORE_ROOT`, and that worktree carries its own `contexture.yaml`
- **THEN** the command operates against the worktree rather than against the store the variable names

#### Scenario: The environment variable still pins across different stores
- **WHEN** a command is invoked with no `--root` from inside a store, or a worktree of a store, that is a different repository than the one `CONTEXTURE_STORE_ROOT` names and is not a mount that store declares
- **THEN** the command operates against the store the variable names

#### Scenario: The main working tree does not redirect to itself
- **WHEN** a command is invoked with no `--root` from inside the main working tree of the store named by `CONTEXTURE_STORE_ROOT`
- **THEN** the command operates against the store the variable names

#### Scenario: A worktree is recognized without invoking git
- **WHEN** root resolution decides whether the current directory's store is a linked worktree of the named store
- **THEN** it reads only the filesystem, invoking no git subprocess, and resolves the environment variable unchanged when the question cannot be decided

#### Scenario: No root resolves
- **WHEN** a command is invoked with no `--root`, no `CONTEXTURE_STORE_ROOT`, and no `contexture.yaml` found by walking up from the current directory
- **THEN** the command exits non-zero with a message naming that no store root was found, and performs no store operation

#### Scenario: Store creation is never redirected into an existing worktree
- **WHEN** `ctxr init` is invoked from inside a linked worktree of the store named by `CONTEXTURE_STORE_ROOT`
- **THEN** it resolves its root by its own rule — `--root`, then the variable, then the current directory — and the worktree step does not apply

#### Scenario: A command run inside a declared mount operates on the mount
- **WHEN** a command is invoked with no `--root` from inside `shared/ctx-b` of the store named by `CONTEXTURE_STORE_ROOT`, and that store declares the mount `ctx-b`
- **THEN** the command operates against the mounted store `ctx-b`, not the store the variable names

#### Scenario: An undeclared clone under the mount path does not redirect
- **WHEN** a command is invoked with no `--root` from inside a store located under `shared/` that the store named by `CONTEXTURE_STORE_ROOT` does not declare
- **THEN** the command operates against the store the variable names

### Requirement: Exactly one root environment variable and one root flag
The store root SHALL be addressable by exactly one environment variable and one command-line flag. No alias environment variable or flag name SHALL be introduced for the same purpose.

A superseded root variable name SHALL NOT resolve a root under any circumstances. When a superseded name is set and the current one is not, the command SHALL exit non-zero naming both names, enforced by a check in root resolution that precedes every store operation — so that an environment migrated only in part fails visibly rather than resolving a different store by walking up from the current directory.

#### Scenario: No alias is recognized
- **WHEN** an operator sets an environment variable that is neither the documented root variable nor a superseded root variable name, intending it to select the store root
- **THEN** contexture does not recognize it and falls through to the next resolution step

#### Scenario: A superseded variable name is refused rather than ignored
- **WHEN** a command is invoked with no `--root`, with `CONTEXTURE_ROOT` set in the environment, and with `CONTEXTURE_STORE_ROOT` unset
- **THEN** the command exits non-zero with a message naming both the superseded and the current variable, performs no store operation, and does not fall through to walking up from the current directory

#### Scenario: The current variable wins when both are set
- **WHEN** a command is invoked with no `--root` while both `CONTEXTURE_ROOT` and `CONTEXTURE_STORE_ROOT` are set to different paths
- **THEN** the command operates against the path named by `CONTEXTURE_STORE_ROOT` and does not refuse

#### Scenario: An explicit argument beats a superseded variable
- **WHEN** a command is invoked with `--root /path/a` while `CONTEXTURE_ROOT=/path/b` is set and `CONTEXTURE_STORE_ROOT` is unset
- **THEN** the command operates against `/path/a` and does not refuse, since no environment variable was consulted to resolve the root

### Requirement: Skills are portable markdown reached by path
Reusable store skills SHALL be markdown files reachable by a documented path from `AGENTS.md`, readable and followable by any agent capable of reading files, independent of any harness's auto-discovery mechanism.

#### Scenario: A non-auto-discovering harness follows a skill
- **WHEN** an agent harness with no automatic skill-discovery mechanism is given the path to a skill listed in `AGENTS.md`
- **THEN** the agent can read and follow that skill's file directly, with no harness-specific adaptation required

### Requirement: Executable portability test
The store SHALL provide a command that exercises core store operations — at minimum, a retrieval query,
a derived-artifact build, a write-path gate evaluation, following one skill by path at the configured
skills path, and confirming that the external tooling the shipped write-path skills invoke is present —
and SHALL exit non-zero naming the first failing operation if any operation fails. It SHALL also verify that every
contexture-managed section of `AGENTS.md` is present and, when operator conventions or a mission
document are configured, that their inlined content matches the source files on disk.

The command SHALL offer an isolated mode. In that mode it SHALL create a disposable checkout of the
store's recorded commit, SHALL run the exercised operations against that checkout in a separate process
whose environment has the harness home directory and the store-root variable removed, SHALL report
which commit it verified, and SHALL remove the disposable checkout whether or not the operations
succeeded. Isolation SHALL be produced by that mechanism rather than asserted of the implementation.
Outside that mode the command SHALL operate on the working tree.

Presence of external tooling SHALL be determined by resolving a tool name that contexture itself
names, on the executable search path. The command SHALL NOT execute a tool in order to check it, SHALL
NOT install one, and SHALL NOT accept a tool name, version constraint, or command line from the store's
configuration.

#### Scenario: Portability test passes with no harness state
- **WHEN** the portability test command runs in isolated mode against a store whose operations all succeed
- **THEN** it exits 0, and its output names the commit that was verified

#### Scenario: Portability test names the failure
- **WHEN** one of the exercised operations fails during the portability test
- **THEN** the command exits non-zero, its output names which specific operation failed, and no later operation is run

#### Scenario: Portability test catches drifted inlined content
- **WHEN** a convention file or the configured mission document has changed on disk since `AGENTS.md` was last regenerated
- **THEN** the portability test exits non-zero naming the drifted source

#### Scenario: The isolated run cannot see the operator's home directory
- **WHEN** the portability test runs in isolated mode
- **THEN** the operations execute in a process whose home directory is an empty location containing no harness state, and that location is still empty when the run finishes

#### Scenario: Uncommitted work does not affect the isolated run
- **WHEN** the working tree contains an edit that would fail an exercised operation, and the portability test runs in isolated mode against a commit that predates that edit
- **THEN** the run reports the operations as they behave at that commit, and names the commit it verified

#### Scenario: The disposable checkout is always reclaimed
- **WHEN** the portability test runs in isolated mode and an exercised operation fails
- **THEN** the disposable checkout is removed and the repository is left with the same checkouts registered as before the run

#### Scenario: No commit to verify
- **WHEN** the portability test runs in isolated mode against a repository with no commit yet
- **THEN** it exits non-zero naming that there is no commit to verify, and creates no checkout

#### Scenario: The write-path gate is exercised as a store operation
- **WHEN** the portability test evaluates the write-path gate for a path that resolves outside the store
- **THEN** the operation passes if the gate refuses it and names a reason, and fails only if no verdict is produced

#### Scenario: Missing write-path tooling is reported by the portability test, not by the gate
- **WHEN** the external tool that the shipped submit and land skills invoke is absent from the executable search path
- **THEN** the portability test exits non-zero naming that tool, while `ctxr doctor` and `ctxr lint` report nothing about it

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
- **THEN** the skill states that the document is a small core kept current from recent work and the store's taxonomy layers — the primary mission, the top priorities in rank order each naming its status, purpose, and next useful action, and what is deliberately not now — that back-burner items, sunset candidates, and open debt live in a register note the core links to rather than in the core, that closed debt is recorded in the store log and removed, and that the agent proposes a change to the mission or the ranking and writes it only once the operator confirms

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

#### Scenario: Publish delegates both halves of the craft rather than inventing either
- **WHEN** an agent follows the publish skill past the point where the page's form is chosen
- **THEN** it is instructed to take the page's visual language from the design-focused craft skill the store carries and its explanatory prose from the reader-calibration craft skill the store carries, rather than inventing either

#### Scenario: Publish keeps the reader's level distinct from the disclosure audience
- **WHEN** the publish skill instructs an agent to pitch a page's prose at a reader
- **THEN** it states that how much a reader already knows is a question about register alone, that it is never a reason to put more on the page, and that writing an explanation more plainly never widens what the page may contain — naming no audience selector and no gate, the store having none to name

#### Scenario: Update delivers the expanded skill set to an existing store
- **WHEN** a store initialized before this change runs the update command
- **THEN** every owned skill above is present at the configured skills path with the managed header, and a second update reports nothing changed

### Requirement: An owned skill names only affordances the CLI provides
Every contexture command and option a contexture-owned skill instructs SHALL be one the CLI registers. A long option named alongside a contexture command in a rendered owned skill SHALL resolve against the option table that command registers, and a skill naming an option no command accepts SHALL fail a check rather than ship. A skill MAY also instruct tools other than contexture — `git`, `gh`, `node`, or a model CLI a skill's own runner drives — and those tools' options are outside what this check resolves. The enforcing mechanism is a test over the rendered skill set that resolves each such option against the CLI's own registration, so a skill cannot outlive the affordance it documents.

#### Scenario: A skill naming a removed option fails the check
- **WHEN** an owned skill instructs a step by naming a contexture command together with a long option that command does not register
- **THEN** the check exits non-zero, naming the skill and the option

#### Scenario: A skill naming only registered options passes
- **WHEN** every long option an owned skill names alongside a contexture command is one that command registers
- **THEN** the check passes, and an option named for a tool other than contexture is outside what the check resolves

#### Scenario: The selector-required message offers only selectors the command accepts
- **WHEN** `ctxr publish gather` is invoked with no subject selector
- **THEN** it exits with the usage code and its message names exactly the selectors the command registers

### Requirement: The skills path is a harness's native skill directory
The configured skills path SHALL be usable as a harness's native skill directory, so a harness with skill auto-discovery finds every skill without an intermediate file, while any other harness reaches the same file by path from `AGENTS.md`.

#### Scenario: A skill-discovering harness surfaces every skill without an intermediate hop
- **WHEN** a store's skills path is that harness's skill directory
- **THEN** every skill is discoverable there as a complete skill file — the file the harness loads is the file `AGENTS.md` indexes

### Requirement: The session-capture skill applies through the command
The owned session-capture skill SHALL instruct the agent to write the approved items to a proposal file and run `ctxr session capture --proposal <file>`, and to take its report from the command's output.

#### Scenario: Skill applies via the command
- **WHEN** an agent follows the rendered skill's Apply step
- **THEN** the only write instruction is the capture command, and the report step references its output

#### Scenario: Skill names resolved identity paths
- **WHEN** the rendered skill is generated for any store
- **THEN** it names no identity file or path — the skill's contract covers store notes only, and identity is no longer a concept the skill or the command it invokes knows about

### Requirement: Vendored third-party skills are delivered and refreshed like owned ones
contexture SHALL ship a set of third-party skills inside its published package and, at `ctxr init` and `ctxr update`, SHALL write each one a store declares into the store's skills directories. A vendored skill's own files SHALL be written byte-identical to the packaged copy — contexture SHALL NOT insert its managed-owner header, or any other contexture-authored content, into a file it did not author. Each vendored skill SHALL be accompanied by its upstream license file: the one published beside the skill where upstream publishes one there, and otherwise the upstream repository's own license file, taken at the same revision as the skill. This requirement is the only place the shipped vendored set is enumerated; no other requirement may name a vendored skill.

The shipped set SHALL cover, at minimum, the two craft axes a published page needs and contexture supplies neither of: visual design direction for generated interfaces — `frontend-design`, redistributed from its upstream under Apache-2.0 — and calibrating an explanation to a stated reader — `eli5`, redistributed from its upstream under MIT. No vendored skill SHALL be required for any command to run.

#### Scenario: Init delivers the vendored set
- **WHEN** `ctxr init` completes on a store whose configuration lists a vendored skill
- **THEN** that skill's directory exists under the store's skills directory, containing its `SKILL.md` byte-identical to the packaged copy and its upstream license file

#### Scenario: The managed-owner header is never inserted into vendored content
- **WHEN** a vendored skill is written into a store
- **THEN** its `SKILL.md` contains no contexture-authored header and its first line is the start of the file's own frontmatter block

#### Scenario: A license kept outside the skill's own directory still travels with it
- **WHEN** the shipped set includes a skill whose upstream publishes no license file inside the skill's own directory
- **THEN** the packaged and delivered skill directory still carries that upstream's license file verbatim, taken at the same revision as the skill itself

#### Scenario: Every craft axis the publish skill delegates has a skill behind it
- **WHEN** a store is initialized on the default configuration
- **THEN** it carries one vendored skill for the visual form of a published page and one for calibrating that page's prose to a reader, and removing either from the store's declared list removes only that directory and changes no command's behavior

### Requirement: A vendored skill carries a provenance record that identifies it
Each vendored skill directory SHALL contain a machine-readable provenance record written by contexture, recording at minimum the upstream source, the pinned upstream revision, the license identifier, and a content hash of the delivered skill file. Where the license was taken from outside the vendored subtree, the record SHALL also name the upstream path it came from, so the record accounts for every file delivered beside the skill. Contexture SHALL treat a skill directory as vendored — and therefore as one it manages — if and only if that record is present, so that a directory without one is operator-authored and never touched.

#### Scenario: The provenance record accompanies the skill
- **WHEN** a vendored skill is written into a store
- **THEN** its directory contains a provenance record naming the upstream source, the pinned revision, the license, and a content hash

#### Scenario: A separately sourced license is recorded as such
- **WHEN** a vendored skill's license was taken from outside the subtree its provenance record names as the source
- **THEN** that record also names the upstream path the license file was taken from

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

`ctxr init` SHALL generate the outputs of every declared harness adapter in the same run that records the selection, and SHALL commit every output it writes with the initial store scaffold, so a harness pointed at a freshly initialized store loads the store's entry document without any further command. A file the adapter generates nothing for SHALL NOT be created. Running `ctxr init` against an already-initialized store SHALL bring the declared adapters' outputs current exactly as the update command does.

#### Scenario: Harnesses are named non-interactively
- **WHEN** `ctxr init` runs with the harness option naming two harnesses
- **THEN** both are recorded as declared adapters in the generated configuration and both are bridged, with no prompt shown

#### Scenario: An interactive run prompts before writing
- **WHEN** `ctxr init` runs in an interactive terminal with no harness option
- **THEN** it presents the selectable harnesses and records the operator's choice before writing the configuration

#### Scenario: Selecting no harness is valid
- **WHEN** `ctxr init` runs selecting no harness
- **THEN** skills are written to the canonical skills directory, no harness directory is created, no harness entry file is written, and the command exits successfully

#### Scenario: A harness that declares an entry file gets it in the initial commit
- **WHEN** `ctxr init` runs non-interactively on an empty directory selecting a harness whose adapter declares an entry file
- **THEN** that entry file exists at the store root containing the managed import of `AGENTS.md`, it is tracked in the commit `init` creates, it is listed among the files `init` reports as created, and the working tree is clean afterwards

#### Scenario: A harness that reads the entry document directly gets no entry file
- **WHEN** `ctxr init` runs selecting only a harness whose adapter declares no entry file
- **THEN** no harness entry file is written, its skills directory is still bridged, and the command exits successfully

#### Scenario: Nothing is created for an adapter that contributes nothing
- **WHEN** `ctxr init` runs selecting a harness whose adapter emits no permission config for a store that has none
- **THEN** no permission config file is created, and none is named among the created files or in the initial commit

#### Scenario: Re-running init restores a missing entry file
- **WHEN** an initialized store declares a harness whose adapter declares an entry file, that file is absent, and `ctxr init` runs against the store again
- **THEN** the entry file is written with the managed import of `AGENTS.md`, no configuration is rewritten, no commit is created, and a further `ctxr init` changes nothing

### Requirement: A broken bridge is detected and repaired
When a declared harness's skills directory exists but neither resolves to the canonical directory nor contains the current skills — including the case where a checkout has materialized a symlink as a regular file — `ctxr doctor` SHALL report it as a broken bridge naming the harness, and `ctxr update` SHALL repair it by re-establishing the bridge, preferring a symlink and falling back to copying.

#### Scenario: A symlink materialized as a text file is reported and repaired
- **WHEN** a store is checked out where symlinks cannot be represented, leaving a declared harness's skills directory as a regular file containing a path
- **THEN** `ctxr doctor` reports a broken bridge naming that harness, and `ctxr update` replaces it with a working bridge

#### Scenario: A bridge pointing at the wrong location is repaired
- **WHEN** a declared harness's skills directory is a symlink resolving somewhere other than the configured skills path
- **THEN** `ctxr update` re-points it at the configured skills path and reports the repair

### Requirement: Upgrading the CLI is an owned skill that asks before it acts
contexture SHALL ship `ctxr-upgrade` as a contexture-owned skill delivered by init and refreshed by update, like every other owned skill. The rendered skill SHALL take the installed and published versions from the CLI's own release check rather than from an advisory that may have gone stale; SHALL stop, reporting what it found, when the CLI reports the running executable as a linked working copy rather than a global installation, instead of instructing a package-manager install that would not affect the executable in use; SHALL likewise stop when the CLI reports a global installation that the running user cannot write to, stating that the executable is managed by whatever installed it and is upgraded there — for a container image, by moving to a newer image — instead of instructing a package-manager install that would be refused; SHALL gate the install behind an explicit operator approval, because upgrading the executable changes every store on the machine and not only the one at hand; SHALL order the package upgrade before the store re-render, so the re-render is performed by the upgraded executable rather than by the one being replaced; and SHALL instruct that the re-render happen from a session worktree, since it writes contexture-owned files and is subject to the same write path as any other change.

The skill drives the package manager rather than a contexture command, in the same way the submit and land skills drive `git` and `gh`: there is no contexture command that upgrades the CLI, and the store-update command re-renders a store rather than replacing an executable.

#### Scenario: A linked working copy stops the skill before any install
- **WHEN** an agent follows the rendered upgrade skill and the CLI reports the running executable as a linked working copy
- **THEN** the skill stops and reports the install it found, and instructs no package-manager install

#### Scenario: The upgrade is gated, and ordered before the re-render
- **WHEN** an agent follows the rendered upgrade skill against a global installation the running user can write to, with a newer release published
- **THEN** the operator's approval is obtained before any install runs, the package upgrade precedes the store re-render, and the re-render step follows a confirmation that the upgraded executable is the one now on the path

#### Scenario: Update delivers the skill to an existing store
- **WHEN** a store initialized before this change runs the update command
- **THEN** the upgrade skill is present at the configured skills path carrying the managed header, discoverable exactly as every other owned skill is

#### Scenario: An install the user cannot write stops the skill before any install
- **WHEN** an agent follows the rendered upgrade skill and the CLI reports a global installation that the running user cannot write to
- **THEN** the skill stops, reports the install location and that it is managed by whatever installed it, names moving to a newer image as the remedy when the executable shipped in one, and instructs no package-manager install

### Requirement: The lifecycle skill offers the upgrade without blocking the session
The rendered session-lifecycle skill's start step SHALL, when the session-start command reports that a newer release is published, instruct the agent to name the installed and published versions to the operator and to offer the upgrade skill. It SHALL NOT instruct the agent to upgrade unasked, and SHALL NOT make the session's continuation conditional on the operator's answer: a deferred or declined upgrade continues the session unchanged. When the start command reports no newer release, or reports that the check could not be completed, the start step SHALL proceed without raising either as a problem.

#### Scenario: A newer release is offered, not imposed
- **WHEN** an agent follows the rendered lifecycle skill's start step and the start command reports a newer release
- **THEN** the operator is told the installed and published versions and offered the upgrade skill, and the session continues whether the operator accepts, defers, or declines

#### Scenario: A failed check is not raised as a problem
- **WHEN** the start command reports that the release check could not be completed
- **THEN** the start step continues the session without offering an upgrade and without reporting a store problem

### Requirement: A skills path sitting on a harness's own branded directory is reported
When the store's configured skills path is identical to a declared harness-generation adapter's own declared skills directory, and that directory is not the cross-harness canonical skills location, `ctxr lint` SHALL report it, naming that harness and the cross-harness canonical skills location. No bridge is created for a harness whose directory already equals the configured path, so a harness the store has not declared finds no skills at a branded path — a state the broken-bridge check cannot express, because it skips on exactly that equality. An adapter that declares the cross-harness canonical location itself reads the location every other harness is bridged to, which is not branded, and SHALL NOT be reported on that account.

This SHALL be an observation and SHALL NOT fail a run: a store that configures a branded skills path remains valid, keeps that path, and is never relocated. Where the store itself overrides a declared harness's skills directory to equal the configured skills path, nothing SHALL be reported — the store has chosen to have no bridge for that harness, which is a supported configuration rather than drift.

#### Scenario: A branded canonical path is reported
- **WHEN** a store's configured skills path is identical to the skills directory a declared harness's adapter declares for itself
- **THEN** `ctxr lint` reports it, naming that harness and the cross-harness canonical location, and `ctxr doctor` still passes

#### Scenario: The cross-harness canonical path is not reported
- **WHEN** a store's configured skills path is the cross-harness canonical skills location and a declared harness reads its own branded directory
- **THEN** nothing is reported, and that harness's directory is bridged to the configured path as usual

#### Scenario: A store-declared override is not reported
- **WHEN** a store overrides a declared harness's skills directory so that it equals the store's configured skills path
- **THEN** nothing is reported, because the store declared that this harness needs no bridge

#### Scenario: A harness that reads the canonical location natively is not reported
- **WHEN** a store's configured skills path is the cross-harness canonical skills location and a declared harness's adapter declares that same location as its own skills directory
- **THEN** nothing is reported for that harness, and no bridge is created for it

### Requirement: A store declares which note templates it installs
Configuration SHALL carry a note-templates path, `templates.path`, and a list of the templates a store installs, `templates.installed`. Both SHALL resolve to a shipped default when absent, so a store predating these keys parses and behaves as if it declared them. An empty list SHALL mean "install none", and SHALL cause `ctxr update` to remove any template contexture previously wrote whose delivered file still matches its recorded hash.

contexture SHALL package a library of note templates and install exactly those a store declares. The library is contexture's offer, not its assertion about what a store is: a store removes what it does not want by editing the list, and adds its own kinds as files the list does not name. This requirement is the only place the packaged library is enumerated; no other requirement may name a template.

A packaged template's content SHALL be fixed markdown, identical for every store that installs it — a template is a file to start a note from, not an artifact rendered per store. It follows that no configuration value appears inside one, and that two stores installing the same template get byte-identical files.

The library SHALL cover, at minimum: a base carrying the frontmatter and top-level heading every note in the store shares — the file a store copies to cut its own kinds — and, built on that base, a template for a synthesized idea carrying the store's relation sections, one for work with a stated end state, and templates for the recurring entities a knowledge store accumulates, at minimum a person and an organization. No command SHALL require a template to exist in order to run.

Every packaged template other than the base SHALL carry, in its frontmatter, a field naming the kind of note it is for, spelled with the template's own name. The base SHALL carry the same field empty, since a note started from it is of no particular kind and the base is the file a store copies to cut its own. No `ctxr` command SHALL read, validate, or select by that field: it records the kind a note was started from so that the agent's own content matching can find every note of a kind, and any further values in it are the store's. The generated entry document SHALL tell the agent, in the same place it names the configured templates path, to keep the field when starting a note and to use it to find notes by kind, and that no command filters by it.

#### Scenario: A store predating the configuration keys gets the defaults
- **WHEN** a `contexture.yaml` written before these keys existed is read
- **THEN** it resolves to the shipped path and the shipped installed list, with nothing for the store to run

#### Scenario: Init installs the declared set
- **WHEN** `ctxr init` completes on a store using the default configuration
- **THEN** the configured templates path contains every template the shipped list names, including the base

#### Scenario: An empty list opts out and removes what contexture installed
- **WHEN** a store's configuration declares an empty installed list and `ctxr update` runs
- **THEN** every unmodified template contexture previously wrote is removed, and no command's behavior changes

#### Scenario: Every packaged template builds on the base
- **WHEN** a freshly initialized store's installed templates are read
- **THEN** every one of them carries the base template's frontmatter keys and its top-level heading, and adds only sections of its own

#### Scenario: Two stores get byte-identical templates
- **WHEN** two stores with different configurations install the same packaged template
- **THEN** the delivered files are byte-identical

#### Scenario: No command depends on a template
- **WHEN** every file is removed from a store's templates path and any contexture command runs
- **THEN** the command behaves exactly as it did before, and no check fails for the absence

#### Scenario: Every template but the base names its kind
- **WHEN** a freshly initialized store's installed templates are read
- **THEN** the base's kind field is empty, and every other template's kind field names exactly that template

#### Scenario: No command acts on the kind field
- **WHEN** a note's kind field is edited, emptied, or removed and any `ctxr` command runs
- **THEN** no finding names the field, and the note's membership and order in every retrieval result, its catalog section, and its graph edges are the same as before the edit

### Requirement: Installed note templates are refreshed by update
`ctxr init` SHALL write the declared templates to the configured path, and `ctxr update` SHALL bring each one to the installed version. Both SHALL be byte-stable when nothing has changed, and both SHALL leave every other file at that path — the store's own note kinds — untouched.

#### Scenario: Update refreshes a drifted copy and leaves the store's own kinds alone
- **WHEN** an installed template in a store differs from the packaged version, a store-authored template sits alongside it, and `ctxr update` runs
- **THEN** the installed template is rewritten, the store-authored file is byte-identical, and an immediately repeated update reports nothing changed

#### Scenario: A template added to the declared list arrives on update
- **WHEN** a store adds a packaged template's name to its installed list and `ctxr update` runs
- **THEN** that template is written to the configured path, and nothing else at that path changes

### Requirement: An installed note template carries a record that identifies it
Each installed note template SHALL be accompanied by a machine-readable record written by contexture at the templates path, naming every template contexture delivered. The record exists so a template can be removed when the store stops declaring it, or when the packaged library stops carrying it — nothing else remembers that a given file was contexture's. It SHALL NOT record a content hash: ownership follows the packaged library's names rather than a file's contents, and byte-stability is decided by comparing the file to the bytes it should have.

A file at the templates path whose name the packaged library does not use SHALL be treated as store-authored: never read, rewritten, removed, or reported.

#### Scenario: The record accompanies the installed set
- **WHEN** the declared templates are written into a store
- **THEN** the templates path contains a record naming each delivered template

#### Scenario: A file the record does not name is left alone
- **WHEN** `ctxr update` runs against a store holding a template at that path under a name the packaged library does not use
- **THEN** that file is not rewritten, not removed, and not reported as drifted

#### Scenario: A template dropped from the library is removed only when unmodified
- **WHEN** the installed version no longer packages a template the store's record names, and `ctxr update` runs
- **THEN** the file is removed, whether or not it was edited locally — a shipped template carries nothing an operator is entitled to keep, and leaving an edited copy of a retired template behind would leave a name contexture no longer explains

### Requirement: The shipped skills distinguish starting a note from extending one
The rendered placement, ingest-orchestration and session-capture skills SHALL direct the agent to start a new note from a template at the configured templates path and to substitute the placeholder vocabulary as it does so, rather than to infer a shape by imitating sibling notes. For a note that already exists, the same skills SHALL direct the agent to extend it in place — preserving existing content — rather than to restart it from a template. The generated entry document SHALL name the configured templates path, so an agent reaches the templates without reading the CLI.

Choosing which template fits a note SHALL remain the agent's judgment, informed where a directory states its own default in the `README.md` that the baseline conventions already direct an agent to read before working in that directory. No configuration key SHALL bind a template to a taxonomy layer: a layer is a placement axis and holds notes of many kinds, so a per-layer default would be wrong for most of what a layer contains.

#### Scenario: The placement skill names the templates path
- **WHEN** a store's skills are rendered
- **THEN** the placement skill instructs the agent to start from a template at the store's configured templates path, and no rendered skill instructs the agent to infer a new note's shape solely by imitating siblings

#### Scenario: The capture skill splits create from append
- **WHEN** the session-capture skill is rendered
- **THEN** its create path names a template as the starting point and its append path directs the agent to extend the existing note, preserving its content

#### Scenario: A directory's own default is honoured
- **WHEN** a directory's `README.md` states which template notes in it start from
- **THEN** the rendered placement skill directs the agent to that README before choosing, and contexture reads no template binding from configuration

#### Scenario: The entry document names the path
- **WHEN** the entry document is generated for a store
- **THEN** it names the store's configured templates path

### Requirement: Owned skills render the relation vocabulary and read the graph document from configuration
The connection-proposal skill SHALL group proposals by the relation vocabulary and SHALL render each name with its definition, so the agent choosing a group is told what the group means rather than only what it is called; the connection-finding and ingest-orchestration skills SHALL direct the agent to the graph document at its configured path for cluster context; and the generated entry document's retrieval section SHALL name that path. No skill SHALL restate a relation's name or definition as a literal — both SHALL be read from the single source the context-retrieval capability enumerates, so a skill cannot drift from it.

The entry document SHALL likewise name the vocabulary with its definitions, and both SHALL state that edges are directed and carry no automatic reciprocal.

#### Scenario: Vocabulary flows into the proposal skill
- **WHEN** a store's skills are rendered
- **THEN** the connection-proposal skill lists one group per relation, each with the definition of what belongs in it

#### Scenario: The entry document explains the vocabulary it names
- **WHEN** the entry document is generated for a store
- **THEN** it names each relation with its definition, and states that an edge is recorded only on the note carrying the link

#### Scenario: No skill carries a relation name of its own
- **WHEN** the shipped skills are rendered for any store
- **THEN** every relation name and definition they contain matches the single enumerated source, and none is written into a skill template as a literal

### Requirement: A shipped note template is refreshed unconditionally
`ctxr update` SHALL rewrite every installed note template whose name the packaged library uses, to the packaged version, regardless of any local edit. A shipped template is contexture's: it is a starting shape rather than content, so an edit to one is not operator work to be preserved but a divergence from the shape every store is meant to share. Update SHALL be byte-stable — a template already matching the packaged version SHALL not be rewritten — and that determination SHALL be made by comparing the file to the bytes it should have, requiring no stored hash.

A store wanting a variant SHALL keep it under a name the packaged library does not use, which contexture never reads, rewrites, or removes. That is the supported way to hold a house shape, and the only one.

#### Scenario: A local edit does not survive an update
- **WHEN** an operator edits an installed note template and `ctxr update` runs
- **THEN** the file is restored to the packaged version, and no finding reports it as locally modified

#### Scenario: A current set makes update a no-op
- **WHEN** `ctxr update` runs twice against a store whose installed templates are current
- **THEN** the second run writes no bytes and reports nothing changed for them

#### Scenario: A store's own kind is untouched
- **WHEN** a store keeps a template at the templates path under a name the packaged library does not use, and `ctxr update` runs
- **THEN** that file is byte-identical afterwards, and is neither removed nor reported

### Requirement: Capture is an owned skill over connected sources
contexture SHALL ship `ctxr-capture` as a contexture-owned skill, delivered by `init` and refreshed by `update` like every other owned skill. The skill SHALL carry the procedure for bringing external material into the configured inbox: locate the material among whatever sources the harness has connected rather than assuming a particular one is present, retrieving through a `ctxr-capture-<source>` skill for the material's source when the store ships one and continuing from the record it wrote; write the source's record into the inbox; stamp the source type and source id while leaving the two fields ingest assigns unset; run the dedupe check when the material may already be in the store; and end by handing off to the ingest-orchestration skill. The skill SHALL NOT instruct the agent to decide what the store should know, which note to write, or where it belongs — those are the ingest-orchestration and placement skills' procedures, and capture ends before them.

The skill's steps MAY name tools contexture does not provide, on the same footing as the submit and land skills naming `git` and `gh`. contexture SHALL NOT ship a client, credential handling, or an adapter kind for any capture source. An opt-in `ctxr-capture-<source>` skill MAY drive a capture source's own command-line tool, which holds that source's credential, when the skill reads and stores no credential itself (per *The Circleback skill routes meetings by tag without handling a credential*).

#### Scenario: The capture skill is delivered and refreshed like every owned skill
- **WHEN** `init` writes a store, and a later `update` runs after the shipped copy has drifted
- **THEN** a full copy of the capture skill sits at the configured skills path in the skill layout marked as managed, and update rewrites the drifted copy to the installed version

#### Scenario: Capture ends at the handoff, not at a note
- **WHEN** the rendered capture skill's final step is read
- **THEN** it hands off to the ingest-orchestration skill, and no step of it instructs creating, expanding, merging, or restructuring a note

#### Scenario: Capture retrieves through a source's skill and keeps the rest of the procedure
- **WHEN** the rendered capture skill's first step is read
- **THEN** it directs retrieval through a `ctxr-capture-<source>` skill when the store ships one for the material's source, names no source, and continues from the second step with the record that skill wrote

### Requirement: The capture skill names no particular source
The rendered capture skill SHALL express its steps without naming any capture service, server, or source-type value. Where the procedure needs a source type it SHALL direct the agent to the source system's own name, and where it needs a source id it SHALL specify a form composed from that source type and the source system's own stable identifier, so the same procedure holds for any harness and any connected source. The enforcing mechanism is a check over the rendered skill set, on the same footing as the checks that keep a shipped taxonomy profile's layer names out of the rendered skills.

#### Scenario: A source-type literal does not reach the shipped text
- **WHEN** the owned skill set is rendered for a store
- **THEN** the capture skill names no capture service and no literal source-type value, and the check over the rendered set passes

#### Scenario: A store's own source types remain the vocabulary
- **WHEN** an agent follows the rendered capture skill against a connected source
- **THEN** the source type it records is the source system's own name, not one contexture supplied

### Requirement: The capture skill distinguishes the record from a summary of it
The rendered capture skill SHALL state that a capture is the source's record, written as the source supplied it, and that a summary the source itself produced is retained as that source's own derivation in a section distinct from the record rather than in place of it. Because material reaching the agent through a connected source passes through the agent before it is written, this SHALL be stated in the skill; the mechanism that enforces it is the ingest precondition a store declares (per `context-ingest`), not the instruction alone.

#### Scenario: The skill states the distinction
- **WHEN** the rendered capture skill is read
- **THEN** it names the record as what the capture must carry, and names a source-supplied summary as a derivation retained alongside the record rather than as a substitute for it

#### Scenario: The instruction is backed by a check, not trusted on its own
- **WHEN** a store declares a required capture section for a source type and a capture of that type carries only a summary
- **THEN** ingest refuses it (per `context-ingest`), so the outcome does not depend on the skill having been followed

### Requirement: Owned skills may carry supporting files
A contexture-owned skill SHALL be able to ship packaged files beside its `SKILL.md`, inside the same skill directory at the configured skills path. `ctxr init` and `ctxr update` SHALL write each supporting file byte-identical to the packaged copy, and SHALL write nothing when every file already matches. An owned skill directory — one whose `SKILL.md` carries the managed header — SHALL belong to contexture as a whole, exactly as the managed `SKILL.md` already does: `ctxr update` SHALL make its contents match the installed version's package, removing any file in it the package does not ship and naming each removed path in its report. Supporting files carry no marker of their own; the managed header on `SKILL.md` is what makes the directory contexture's, and a directory without it SHALL never be touched. When the whole skill stops being shipped, its directory SHALL be removed with every file in it, as the managed skill copy is today. The enforcing mechanism is the skill sync that init and update both run, exercised by a test that writes a supporting file, drops it from the package, and asserts its removal.

#### Scenario: Init delivers a skill's supporting files
- **WHEN** `ctxr init` runs against a fresh store and the installed version ships an owned skill with supporting files
- **THEN** that skill's directory at the configured skills path contains its `SKILL.md` with the managed header and each supporting file byte-identical to the packaged copy

#### Scenario: Update removes a supporting file the package dropped
- **WHEN** a store carries an owned skill's supporting file from an earlier version, the installed version no longer ships that file, and `ctxr update` runs
- **THEN** the file is removed, every file the installed version still ships is present and current, and the command reports the change

#### Scenario: A file the package does not ship is removed and named
- **WHEN** an owned skill's directory contains a file the installed version does not ship, whether left by an earlier version or added by hand, and `ctxr update` runs
- **THEN** the file is removed and the command's report names its path

#### Scenario: A directory without the managed header is never touched
- **WHEN** an operator-authored skill directory whose `SKILL.md` carries no managed header holds files of any name and `ctxr update` runs
- **THEN** every file in it is byte-identical afterwards and none is reported

#### Scenario: A current skill with supporting files makes update a no-op
- **WHEN** `ctxr update` runs twice in a row against a store whose owned skills and their supporting files already match the installed version
- **THEN** the second run writes no bytes and reports nothing changed

#### Scenario: A copy-bridged harness receives the supporting files
- **WHEN** a store declares a harness whose skills directory is bridged by copy rather than symlink
- **THEN** that harness's copy of the skill directory contains the same supporting files as the canonical one

### Requirement: The second-opinion skill is an owned skill over external model CLIs
contexture SHALL ship `ctxr-second-opinion` as a contexture-owned skill delivered by init and update, carrying no supporting files and driving the `ctxr second-opinion` command group. The command SHALL offer two modes: *critique*, in which a written plan is sent to the critic roles — structure and coherence, failure modes and trust boundaries, simplicity and cost, and, where a fourth family is in the lineup, how the result will be checked — each backed by a different model family, reached through that family's command-line tool or through OpenRouter, as the lineup and the machine's default give; and *poll*, in which one question is sent to the same model families, optionally asking each to answer through two or three named taste lenses; and a *preflight* that checks each tool before anything is spent. `ctxr second-opinion` SHALL be the only `ctxr` command that invokes a model CLI or calls a model API. No other command's behavior SHALL depend on it or on those CLIs being present, it SHALL NOT be invoked by any command on the write path, and `ctxr verify` SHALL NOT report the CLIs. The critic contract, persona mandates and lens roster SHALL be shipped as package templates.

The command is the enforcing mechanism for the following, each covered by a test that runs it against stub CLIs on the executable search path:

- It SHALL run the critics concurrently, each model CLI in its own process, and each critic given only the plan and its own role — never another critic's output.
- It SHALL pass prompt content to each CLI on standard input or as a single argument vector element, never through a shell.
- It SHALL invoke each CLI with that tool's read-only or no-tools mode where one exists, and in an empty scratch directory as its working directory in every case.
- It SHALL give each CLI an environment built from a declared allowlist — the executable search path, home, locale and terminal variables, the model CLIs' own variable prefixes, proxy and certificate variables, its own `CTXR_SECOND_OPINION_` variables, and any names an operator lists in a declared pass-through variable, except the forge and contexture prefixes, which the pass-through cannot name — and no other variable of its own environment.
- It SHALL bound each critic by a timeout and record a critic that times out, exits non-zero, or returns output lacking the required verdict as failed, with the cause.
- It SHALL write each critique under a letter assigned in an order independent of the critic roster, record the letter-to-role-and-model mapping in a separate manifest, and record in that manifest the model each CLI reports having run where the CLI reports one.
- It SHALL mark a critique whose findings cite nothing the plan contains — no step it numbers and no text quoted from it — as blind and exclude it from the count of valid critiques, while a critique that approves with no findings SHALL remain valid.
- It SHALL exit with the failed-check status when fewer than two critiques are valid, so a partial result cannot be mistaken for a complete one, and with the usage status for invalid arguments or fewer than two requested critics.

The skill SHALL state when to critique, when to poll, and when to answer directly; SHALL instruct synthesis on the anonymized letters before the manifest is read; SHALL instruct that a dissent backed by cited evidence, and a rejection carrying a critical finding, are surfaced in their own sections rather than outvoted; SHALL disclose that a critic sharing the orchestrating agent's model family is a bias to name; and SHALL end in a hand-off that executes no step of the plan it critiqued. Those instructions are skill-markdown conventions, asserted by a test over the rendered skill, not guarantees the command can make.

#### Scenario: Update delivers the skill with its runner
- **WHEN** a store whose skill carries the earlier supporting-file runner runs `ctxr update`
- **THEN** the skill is present at the configured skills path with the managed header and names `ctxr second-opinion`, the earlier runner and prompt fragments beside it are removed, and a second update reports nothing changed

#### Scenario: Critics never see each other
- **WHEN** the command executes a critique against stub CLIs that record the input they receive
- **THEN** each stub received the plan and exactly one role's instructions, and none received text produced by another critic

#### Scenario: No shell stands between the plan and a critic
- **WHEN** the command executes a critique of a plan containing shell metacharacters, quotes, and a multi-kilobyte body
- **THEN** each stub CLI receives the plan byte-identical, and no shell process is spawned

#### Scenario: Results are anonymized
- **WHEN** the command completes a critique
- **THEN** the critique files are named by letter, contain no role or model name placed there by the command, and the letter-to-role-and-model mapping appears only in the manifest

#### Scenario: A failed critic is reported, not hidden
- **WHEN** one stub CLI exits non-zero and another exceeds the timeout
- **THEN** each of those critiques is recorded as failed naming its cause, and the command does not substitute another model for either

#### Scenario: A blind critique does not count
- **WHEN** a stub CLI returns a well-formed verdict whose findings cite no step and quote no text present in the plan
- **THEN** the critique is marked blind in the manifest and excluded from the valid count

#### Scenario: Fewer than two valid critiques is a partial result
- **WHEN** only one of three critiques is valid
- **THEN** the command exits with the failed-check status, distinct from both success and a usage error

#### Scenario: The rendered skill hands off without executing
- **WHEN** the skill is rendered for a store
- **THEN** it instructs synthesizing on letters before reading the manifest, carries sections for evidence-backed dissent and for critical rejections, names the orchestrator's model-family bias, and ends by presenting the synthesis without executing any step of the critiqued plan

#### Scenario: No command depends on the model CLIs
- **WHEN** none of the model CLIs is on the executable search path and `ctxr verify`, `ctxr doctor`, and `ctxr update` run
- **THEN** each behaves exactly as it does when the CLIs are present, and none names them

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

### Requirement: A freshly initialized store is already current
A store produced by `ctxr init` SHALL already hold every contexture-owned file at the installed tool version, so the update command run immediately afterwards, with the same tool version, SHALL report nothing changed. This SHALL hold whichever taxonomy and harness selection `init` was given. It is enforced by an automated test that initializes a store and then runs the update command against it. A contexture-owned file that `init` omits, or writes differently from the update command, fails that test.

#### Scenario: Update after init is a no-op
- **WHEN** `ctxr init` runs non-interactively on an empty directory selecting a harness whose adapter declares an entry file, and the update command runs immediately afterwards
- **THEN** the update command reports nothing changed, and the working tree is still clean

#### Scenario: Update after a no-harness init is a no-op
- **WHEN** `ctxr init` runs selecting no harness, and the update command runs immediately afterwards
- **THEN** the update command reports nothing changed, and no harness entry file exists

### Requirement: Codex and Antigravity are built-in harnesses that read the canonical locations
contexture SHALL ship a built-in harness-generation adapter for Codex, identified as `codex`, and one for Antigravity, identified as `antigravity`, each selectable at `ctxr init` both interactively and through the non-interactive harness option. Each SHALL declare the cross-harness canonical skills location as its skills directory and SHALL declare no entry file, because each harness reads `AGENTS.md` at the store root and discovers skills at that location natively. The `codex` adapter SHALL declare an entry-document read limit of 32,768 bytes and the `antigravity` adapter one of 24,000 bytes, the sizes past which each harness was observed to stop reading. The non-interactive harness option's help text SHALL list every selectable harness, taken from the same list the interactive prompt presents, so neither can name a harness the other omits.

#### Scenario: A store targeting Codex gains no entry file and no bridge
- **WHEN** `ctxr init` runs with the harness option naming `codex`, on a store whose skills path is the cross-harness canonical location
- **THEN** the configuration declares the `codex` adapter, every owned and vendored skill is written to the canonical skills directory, no harness entry file is written, no bridged directory is created, and the command exits successfully

#### Scenario: A store targeting Antigravity gains no entry file and no bridge
- **WHEN** `ctxr init` runs with the harness option naming `antigravity`, on a store whose skills path is the cross-harness canonical location
- **THEN** the configuration declares the `antigravity` adapter, no harness entry file is written, no bridged directory is created, and the command exits successfully

#### Scenario: A store whose skills path is elsewhere bridges the canonical location for them
- **WHEN** a store whose configured skills path is not the cross-harness canonical location declares `codex`
- **THEN** the cross-harness canonical location is bridged to the configured skills path, exactly as for any harness whose directory differs from it

#### Scenario: Every selectable harness is named in the option's help
- **WHEN** an operator reads the help for `ctxr init`
- **THEN** the harness option's description names every harness the interactive prompt offers, including `codex` and `antigravity`

### Requirement: A guidance document may load on demand
An operator-authored convention document MAY declare, in its frontmatter, a `read_when` field holding a single line that states when an agent should read it. A document declaring a non-empty `read_when` SHALL NOT be inlined into the entry document. Instead, the entry document's guidance index section SHALL list it as one entry naming its title, its `read_when` text, and its store-relative path, in the order the documents are scanned. A document declaring no `read_when` SHALL be inlined exactly as before. The configured mission document SHALL never be listed in the index, because it has its own section. When no document declares `read_when`, the guidance index section SHALL be absent, and regenerating SHALL report no change once it is already absent. This requirement is the only place the `read_when` key is named.

#### Scenario: An on-demand document is indexed, not inlined
- **WHEN** a convention document declaring `read_when: Before a research pass` sits at the configured guidance path and the entry document is regenerated
- **THEN** the guidance index section names that document's title, the text "Before a research pass", and its path, and no part of its body appears in the "Store conventions" section

#### Scenario: A document without the field is still inlined
- **WHEN** a convention document with no `read_when` sits beside an on-demand one and the entry document is regenerated
- **THEN** that document's body is inlined in the "Store conventions" section as before, and it does not appear in the guidance index

#### Scenario: Changing the trigger refreshes the index
- **WHEN** an operator edits an on-demand document's `read_when` and `ctxr update` runs
- **THEN** the guidance index carries the new text, and an immediately repeated update reports nothing changed

#### Scenario: Editing an on-demand document's body needs no regeneration
- **WHEN** a commit stages a change to only the body of an on-demand document, leaving its title and `read_when` unchanged, and stages no `AGENTS.md`
- **THEN** the pre-commit hook accepts it, because `AGENTS.md` carries nothing of that body

#### Scenario: No on-demand documents means no index section
- **WHEN** no convention document declares `read_when` and the entry document is regenerated
- **THEN** `AGENTS.md` carries no guidance index section

### Requirement: The entry document fits every supported harness
`ctxr doctor` SHALL fail when `AGENTS.md` is larger, in bytes, than the store's entry-document limit, `harness.entry_document_max_bytes`. That key SHALL default to the smallest entry-document read limit declared by any harness-generation adapter contexture ships (the adapters capability), whichever harnesses the store declares. A store therefore works with every supported harness without listing each one. The failure SHALL name every built-in harness whose read limit the document exceeds, the document's size, the limit, and the first generated section that harness's limit falls inside. A store MAY set the key to a different positive value. A value above the shipped default is an explicit choice to give up the guarantee for the harnesses it exceeds, and the failure, once past those harnesses' limits, still names them. Separately, `ctxr lint` SHALL report, as an observation, when `AGENTS.md` exceeds the store's target size, `harness.entry_document_target_bytes`, which SHALL default to a shipped value of 20,480 bytes.

#### Scenario: The limit applies whichever harnesses a store declares
- **WHEN** a store declares only `claude-code`, sets no limit, and its `AGENTS.md` is 30,000 bytes
- **THEN** `ctxr doctor` fails against the default limit of 24,000 bytes, naming `antigravity` and `codex` with their limits and the section each stops reading in

#### Scenario: Only the harnesses whose limits are exceeded are named
- **WHEN** a store's `AGENTS.md` is 28,000 bytes
- **THEN** `ctxr doctor` fails naming `antigravity` and not `codex`

#### Scenario: The default is the smallest built-in read limit
- **WHEN** a store sets no `harness.entry_document_max_bytes`
- **THEN** its limit equals the smallest read limit any built-in harness adapter declares

#### Scenario: A store that raises the limit is held to its own number
- **WHEN** a store sets `harness.entry_document_max_bytes` to 40,000 and its `AGENTS.md` is 30,000 bytes
- **THEN** `ctxr doctor` passes, and the store's configuration records that it no longer fits `antigravity` or `codex`

#### Scenario: A document over the target but within the limit is an observation
- **WHEN** a store with the default target and limit has an `AGENTS.md` of 22,000 bytes
- **THEN** `ctxr doctor` passes, and `ctxr lint` reports the size and the 20,480-byte target

#### Scenario: A store sets its own target
- **WHEN** a store's configuration sets `harness.entry_document_target_bytes` to 16,384 and its `AGENTS.md` is 18,000 bytes
- **THEN** `ctxr lint` reports the document against a target of 16,384

### Requirement: contexture's own share of the entry document is held under a ceiling
The contexture-owned prose in the entry document (the fundamentals, retrieval, capture, and placement sections, the shipped baseline, and the guidance index's own framing), rendered for a freshly initialized store on the default configuration, SHALL total no more than a shipped ceiling. This is enforced by an automated test that initializes a store, measures those sections, and fails when the total exceeds the ceiling. The ceiling SHALL only be lowered, never raised, without a change that argues for the increase. Procedure that a shipped skill already carries SHALL NOT be restated in these sections. A section names the skill instead.

#### Scenario: Growing a generated section past the ceiling fails the suite
- **WHEN** a contexture template is edited so that a freshly initialized store's contexture-owned sections exceed the ceiling
- **THEN** the automated test fails, naming the measured total and the ceiling

#### Scenario: A section defers to the skill that carries the procedure
- **WHEN** the capture section of a freshly initialized store's entry document is read
- **THEN** it states where captures go and which source-identity fields a capture must not carry, names the skills that carry the capture and ingest procedure, and does not restate the five verdicts or the ingest walkthrough

### Requirement: The shipped skills carry the operating guidance every store would otherwise restate
Guidance that holds for any store SHALL ship in contexture's owned skills and generated sections, not be left to each store's conventions:

- **The submit skill** SHALL name the routes a pull request takes and instruct the agent to state which one it took and why:
  - a session pull request (the session's work plus its approved capture);
  - an own pull request (a new skill, a structural or entry-document change, a large refactor);
  - a housekeeping pull request (batched small appends, never folded into unrelated work).

  It SHALL instruct the agent, during its re-scan, to check for stale rollups on the entities the session touched and to offer the rollup skill without running it unasked. It SHALL state that the pull-request body answers why, what changed, the route, verification, and follow-ups.
- **The second-opinion skill** SHALL state that a critique is required before implementing a change that is architectural, irreversible, or touches a confidentiality boundary, run before the work rather than after it. It SHALL state that the verdict lands in the pull-request body, which with its commit is the decision record, with no separate governance step.
- **The derived-artifacts skill** SHALL state:
  - that a flagged gloss is confirmed by reviewing it and stripping its frozen hash marker once, so the next catalog build stamps a fresh one, and that editing the gloss alone does not clear the finding;
  - that the graph is a per-checkout cache built at the point of use when `ctxr doctor` reports it stale, never on a schedule.
- **The entry document's retrieval section** SHALL state what to do when a literal search finds nothing: use the vocabulary the note would use, expand acronyms, and walk the graph from the nearest note found.

#### Scenario: Submit names its routes and the body's questions
- **WHEN** the submit skill is rendered for any store
- **THEN** it names the session, own, and housekeeping routes, tells the agent to state its route, and names why, what changed, route, verification, and follow-ups as the questions the body answers

#### Scenario: Submit checks rollups without running them
- **WHEN** the submit skill's re-scan step is read
- **THEN** it instructs `ctxr rollup stale` for the entities the session touched and offering `ctxr-rollup`, and forbids running a rollup unasked

#### Scenario: A critique is required before an irreversible change
- **WHEN** the second-opinion skill is rendered
- **THEN** it states that a critique is required before an architectural, irreversible, or confidentiality-boundary change and that the verdict lands in the pull-request body

#### Scenario: Confirming a stale gloss is documented
- **WHEN** the derived-artifacts skill is rendered
- **THEN** it states that a flagged gloss is confirmed by stripping its hash marker once and rebuilding, that editing the gloss alone does not clear the finding, and that the graph is built at the point of use rather than on a schedule

#### Scenario: Retrieval names its fallback for a search that finds nothing
- **WHEN** the entry document's retrieval section is generated
- **THEN** it tells the agent to retry with the note's own vocabulary, expand acronyms, and walk the graph from the nearest note found

### Requirement: The baseline conventions carry the every-turn rules of any store
The shipped baseline conventions, inlined into every store's entry document, SHALL state:
- that notes are written in outliner bullets rather than prose paragraphs unless the operator asks otherwise;
- that notes link liberally with wikilinks, and that creating a note includes suggesting links to existing notes;
- that a note's existing content is extended rather than overwritten unless a rewrite is asked for;
- the task format: a checkbox with a dated parenthetical for added, due, and done, and a marker for in progress;
- that credentials and full card or account numbers never enter the store, only their last four digits;
- that scratch and intermediate files go in the store's configured scratch path, `harness.scratch_path` (a convention key defaulting to `/tmp/`), never into the store or the home directory;
- that notes carry no access control, so sensitive material is placed deliberately and marked in the note when it must not be quoted onward.

A store's house conventions MAY state a different rule, and the more specific rule applies.

#### Scenario: The baseline states the every-turn rules
- **WHEN** the entry document is generated for a store on the default configuration
- **THEN** its baseline conventions state the outliner, wikilink, preserve-content, task-format, last-four-digits, scratch-path, and no-access-control rules

#### Scenario: The scratch path follows configuration
- **WHEN** a store sets `harness.scratch_path` to `/var/tmp/ctx/` and the entry document is regenerated
- **THEN** the baseline names `/var/tmp/ctx/` as where scratch files go

### Requirement: A store keeps an append-only log
A store SHALL have a log document at `organize.log_path`, a convention key defaulting to `log.md` at the store root. The log SHALL be excluded from every retrieval leg. The baseline conventions SHALL state its entry form, `## [YYYY-MM-DD] <kind> | <title>` followed by short bullets, and that it is appended to and never rewritten. They SHALL also state that, at session start, when the log's most recent `lint` entry is more than seven days old or absent, the agent suggests a lint pass. The ingest-orchestration skill SHALL instruct appending an `ingest` entry after an ingest, and the organize-audit skill SHALL instruct appending a `lint` entry after a lint pass.

#### Scenario: The log is not a note
- **WHEN** a store on the default configuration has a `log.md` at its root
- **THEN** no retrieval leg returns it and the catalog takes no entry for it

#### Scenario: The skills append to the log
- **WHEN** the ingest-orchestration and organize-audit skills are rendered
- **THEN** each instructs appending an entry of the stated form, of kind `ingest` and `lint` respectively, to the configured log path

#### Scenario: A stale lint is suggested at session start
- **WHEN** the baseline conventions are read
- **THEN** they tell the agent to suggest a lint pass when the log's last `lint` entry is more than seven days old or missing

### Requirement: Capture and submit carry their store-independent practice
The capture skill SHALL state that a capture keeps the durable mechanic of perishable material (a promotion, a price), not its momentary state, and that a file a note links to or displays lives under the capture root's `assets/` directory. The submit skill SHALL state that `gh` authenticates from its own credential file, so a token is never exported or interpolated and the origin's URL is never rewritten. It SHALL also give a default branch-name form, `<prefix>/<slug>` with prefixes `skill/`, `feat/`, `project/`, `notes/`, `chore/`, `refactor/`, and `fix/`.

#### Scenario: Capture names perishable state and attachments
- **WHEN** the capture skill is rendered for a store whose capture root is `raw/`
- **THEN** it tells the agent to keep a perishable item's durable mechanic, and names `raw/assets/` for files a note links to or displays

#### Scenario: Submit names the credential practice and branch form
- **WHEN** the submit skill is rendered
- **THEN** it forbids exporting a `gh` token or rewriting the origin, and gives the `<prefix>/<slug>` branch form with its default prefixes

### Requirement: Source and retirement practice ships in the skills
The capture skill SHALL instruct the agent to:
- query connected sources for uncaptured primary material on a topic before a research pass;
- treat several items from one source system covering the same occasion as one source, checked against each other by content rather than string matching, and never counted as corroborating each other;
- record, when a source does not separate speakers, that every attribution built from it is inference.

The ingest-orchestration skill SHALL instruct recording who claimed an unverified quantity, when, and in what setting. The organize-audit skill SHALL state that a unit living as a folder of notes is retired by moving the whole folder into the configured archive destination, since the archive command moves one note. The baseline conventions SHALL state that a note's `title:` equals its filename stem. The placement skill SHALL state that a unit carrying supporting notes gets a folder of its own, because the graph clusters notes by their first configured cluster-depth path segments and a common parent would merge their clusters.

#### Scenario: A unit with supporting notes gets its own folder
- **WHEN** the placement skill is rendered for a store whose graph cluster depth is 2
- **THEN** it tells the agent to give a unit with supporting notes its own folder, naming the first 2 path segments as what the graph clusters by

#### Scenario: Capture carries the same-event, speaker, and primary-material rules
- **WHEN** the capture skill is rendered
- **THEN** it names checking connected sources before research, treating same-occasion items as one source, and marking attributions from an unseparated transcript as inference

#### Scenario: Ingest records a claim's provenance
- **WHEN** the ingest-orchestration skill is rendered
- **THEN** it tells the agent to record who claimed an unverified quantity, when, and in what setting

#### Scenario: A folder is retired whole
- **WHEN** the organize-audit skill is rendered for a store whose archive destination is `archives/`
- **THEN** it tells the agent to retire a folder of notes with `git mv <folder> archives/<name>`

#### Scenario: Titles match filename stems
- **WHEN** the baseline conventions are rendered
- **THEN** they state that a note's `title:` equals its filename stem

### Requirement: The mission is a dated core held to a budget
The entry document's "Mission" section SHALL render, before the inlined body, a line stating the date the mission was last confirmed, taken from the document's recorded rollup timestamp, or stating that it has never been confirmed when none is recorded. Every agent then sees how old the priorities are without reading anything else. `ctxr doctor` SHALL fail when the mission document's inlined body exceeds `organize.mission_max_bytes`, a convention key defaulting to 2,048 bytes, naming the current size and the budget. The section SHALL name the document's path as its source, and no other section SHALL instruct an agent to load the mission document separately.

#### Scenario: The confirmation date is rendered
- **WHEN** a store's mission document records a rollup timestamp of 2026-10-05T06:38:28Z and the entry document is regenerated
- **THEN** its "Mission" section states that the mission was last confirmed on 2026-10-05, before the inlined body

#### Scenario: A never-confirmed mission says so
- **WHEN** the mission document records no rollup timestamp
- **THEN** the "Mission" section states that the mission has never been confirmed

#### Scenario: An oversized mission fails doctor
- **WHEN** the mission document's inlined body is 3,000 bytes and the store sets no `organize.mission_max_bytes`
- **THEN** `ctxr doctor` fails, naming a size of 3,000 bytes and a budget of 2,048

#### Scenario: A store sets its own mission budget
- **WHEN** a store sets `organize.mission_max_bytes` to 4,096 and its mission body is 3,000 bytes
- **THEN** the mission budget check passes

### Requirement: The baseline conventions say how to explain something to the operator
The shipped baseline conventions, inlined into every store's entry document, SHALL carry an "Explaining"
section that applies whenever an agent explains something to the operator. The section SHALL name ASD-STE100
and state, as the adopted rules: one fact per sentence; at most 20 words in a sentence that instructs and at
most 25 in one that describes; active voice; one word for one thing; lists for three or more items; numbers
in place of vague words. It SHALL state the departures from the standard: the store's own names are kept as
written; each reason gets its own sentence starting `Why:`; quotes, command output and report tables are
copied unchanged. It SHALL state when to draw a diagram instead of prose, and its form: a fenced `mermaid`
block in notes, pull requests and answers, and inline SVG in published pages. A store's house conventions
MAY state a different rule, and the more specific rule applies.

#### Scenario: A fresh store's entry document carries the section
- **WHEN** a store is freshly initialized
- **THEN** its entry document's conventions carry the "Explaining" section, naming ASD-STE100, the 20-word
  and 25-word limits, active voice, one word for one thing, and lists for three or more items

#### Scenario: The departures are stated
- **WHEN** the rendered baseline conventions are read
- **THEN** the "Explaining" section states that the store's names are kept as written, that each reason gets
  a `Why:` sentence, and that quotes, command output and report tables are copied unchanged

#### Scenario: The section says when and how to draw a diagram
- **WHEN** the rendered baseline conventions are read
- **THEN** the "Explaining" section names structure, flow and sequence as reasons to draw a diagram, a
  fenced `mermaid` block for notes, pull requests and answers, and inline SVG for pages

#### Scenario: Update delivers the section to an existing store
- **WHEN** a store initialized before this change runs `ctxr update`
- **THEN** its entry document carries the "Explaining" section, with no configuration change required

#### Scenario: The section fits under the raised ceiling
- **WHEN** the entry-document ceiling test runs against a freshly initialized store
- **THEN** contexture's share of the entry document, including the section, is at or under 8,900 bytes

### Requirement: The publish skill settles a page's lifespan before anything else
The rendered `ctxr-publish` skill SHALL instruct, as its first step and ahead of resolving any note
set, deciding whether the page is permanent — the rendered form of one note that will keep changing —
or disposable, built to understand something once. For a disposable page it SHALL instruct
scaffolding with `ctxr publish new --disposable`, never revising the page once it has landed, and
leaving its removal to the operator when lint lists it. For a permanent page it SHALL instruct leading
the README's source notes with the one note the page represents — for a page drawn from a store
folder, that folder's hub note — stamping it with `ctxr publish stamp`, and, when a page is reported
stale, reviewing the page against the note before removing the marker and stamping again. It SHALL
state that a page meant to be kept which can name no note it represents is disposable. The enforcing
mechanism is the test over the rendered skill set.

#### Scenario: Lifespan is the first decision
- **WHEN** the publish skill is rendered for a store
- **THEN** its first step decides between a permanent and a disposable page, and appears before the
  step that resolves the subject's note set

#### Scenario: A disposable page is scaffolded by option and never revised
- **WHEN** an agent follows the publish skill for a disposable page
- **THEN** it is instructed to scaffold with `ctxr publish new --disposable`, not to edit the page after
  it lands, and not to remove it unasked

#### Scenario: A permanent page is led by its note and stamped
- **WHEN** an agent follows the publish skill for a permanent page
- **THEN** it is instructed to lead the README with the represented note, run `ctxr publish stamp`, and
  confirm a stale page by review before removing its marker and stamping again

### Requirement: The organize-audit skill hands disposable-page removal to the operator
The rendered `ctxr-organize-audit` skill SHALL instruct taking lint's list of disposable pages past
their window to the operator as a proposal, removing only the pages the operator approves, through a
session and a reviewed pull request like any other change, and naming each removed page's address as
one that stops working. It SHALL hand permanent pages lint reports as out of step with their note to
the publish skill. The enforcing mechanism is the test over the rendered skill set.

#### Scenario: Removal is proposed, never assumed
- **WHEN** an agent follows the organize-audit skill and lint lists disposable pages past their window
- **THEN** it is instructed to propose their removal to the operator and remove only what is approved

#### Scenario: A drifted page goes to the publish skill
- **WHEN** an agent follows the organize-audit skill and lint lists a permanent page as stale
- **THEN** it is instructed to hand that page to the publish skill rather than restamp it

### Requirement: Submit's Pages table names each page's lifespan
When the rendered `ctxr-submit` skill instructs a Pages section in the pull request body, it SHALL
instruct that each page's row carry the lifespan `ctxr publish urls` reports for it, copied from the
report rather than inferred from the path. The enforcing mechanism is the test over the rendered skill
set.

#### Scenario: The Pages table carries the lifespan
- **WHEN** an agent follows the rendered submit skill and `ctxr publish urls` lists a disposable page
- **THEN** the Pages table row for that page names it as disposable, taken from the report

### Requirement: The publish skill files a page's send copies beside its index page, dated, and keeps a source file beside its note
The rendered `ctxr-publish` skill SHALL name the send-copy formats (`.pdf`, `.docx`, `.xlsx`,
`.pptx`) and instruct that a send copy — a file built from the note and sent to someone — is written
directly into the page's folder, beside its `index.html`, under a file name led by the date it was
made; that a send copy is never a page on its own, so a document sent in any of these formats still
has an `index.html`; that a file the page uses as an input belongs in the page's `assets/`, not at
the folder root; and that making a send copy of a changed page writes a new dated file and leaves
every earlier one untouched, because an earlier file may be what a recipient was sent. It SHALL
instruct that an office file which is itself the source — edited by hand and not built from any
note — is kept in the note tree beside the note that describes it, undated, and is not published,
and that a dated copy of it sent to someone is a send copy. It SHALL state that the commit is refused when it adds an undated send copy or changes a send copy
already committed. It SHALL name how a send copy is produced
as the store's choice, and SHALL NOT name a renderer contexture ships. The enforcing mechanism is the
test over the rendered skill set.

#### Scenario: A send copy is filed beside the index page with its date
- **WHEN** an agent follows the publish skill to produce a spreadsheet send copy of a page
- **THEN** it is instructed to write it at the page folder's root, beside `index.html`, under a file
  name led by the date it was made

#### Scenario: A new send copy keeps the earlier one
- **WHEN** an agent follows the publish skill to produce a send copy of a page that already holds one
- **THEN** it is instructed to write a new dated file and to leave the earlier file unchanged

#### Scenario: An input stays in assets
- **WHEN** an agent follows the publish skill for a page that uses a file it did not produce
- **THEN** it is instructed to place that file in the page's `assets/`

#### Scenario: A hand-edited workbook stays beside its note
- **WHEN** an agent follows the publish skill for a workbook that is edited by hand and built from
  no note
- **THEN** it is instructed to keep the workbook beside the note that describes it, undated, and not
  to publish it, and to file any dated copy sent from it as a send copy

#### Scenario: The skill names the commit gate
- **WHEN** an agent follows the publish skill to produce a send copy
- **THEN** it is told that a commit adding an undated send copy, or changing one already committed, is
  refused

### Requirement: An opt-in owned skill ships only to a store that declares its configuration block
contexture SHALL be able to ship an owned skill that a store receives only by opting in. Such a skill SHALL be enabled by an optional top-level block in `contexture.yaml` that has no shipped default, so a store that never declares the block never carries the key and never receives the skill. While the block is present, `ctxr init` and `ctxr update` SHALL write and refresh the skill exactly like every other owned skill. When the block is removed, the skill SHALL no longer be shipped to that store, and the next `ctxr update` SHALL remove its managed directory, as it does for a skill the package stopped shipping. An opt-in skill's supporting files MAY be rendered from the store's configuration, for a runner that cannot read `contexture.yaml` itself.

#### Scenario: A store without the block gets no opt-in skill
- **WHEN** a store's `contexture.yaml` declares no `circleback` block and `ctxr update` runs
- **THEN** no `ctxr-capture-circleback` directory is written, and the rendered configuration carries no `circleback` key

#### Scenario: Opting out removes the skill
- **WHEN** a store that carried `ctxr-capture-circleback` removes its `circleback` block and `ctxr update` runs
- **THEN** the managed `ctxr-capture-circleback` directory is removed with every file in it, and an immediately repeated update reports nothing changed

### Requirement: The Circleback skill routes meetings by tag without handling a credential
contexture SHALL ship `ctxr-capture-circleback` as an opt-in owned skill, enabled by a `circleback` block naming this store's tag, optionally the tags that route a meeting to other stores, and optionally the tag that declines a meeting (absent means `no-capture`). It SHALL be the capture skill's retrieval step for Circleback, and SHALL hand back to the capture skill at its second step rather than carry a capture procedure of its own. The skill SHALL carry a runner, invoked with `node` and depending on nothing outside the Node standard library, and a settings file rendered from that block. The runner SHALL drive Circleback's own command-line tool, `git` and `gh`, and SHALL NOT read, write or store any credential.

The runner SHALL read the meetings of a fixed lookback window with their tags, and SHALL treat a meeting as owed by this store when it carries this store's tag, carries neither the decline tag nor another store's tag, is absent from the store's default branch and from every open pull request, and is still readable in full. For owed meetings it SHALL prepare a review-branch worktree at a fixed path, clearing what an earlier run left there, and SHALL write each one's verbatim record into the configured inbox there: the source type and id, metadata, attendees, the source's action items and summary marked as its own derivation, and the transcript verbatim under the store's required capture section for the source type, with trailing whitespace removed and the recording URL never written. It SHALL print a report naming what it retrieved, and separately what is locked, untagged, tagged for more than one store, and recently declined. A failure SHALL be reported as such and never as an empty list.

The skill SHALL direct the agent to continue each retrieved record with the capture skill from its second step: checking the record, including its speakers; confirming the identity already stamped; and the dedupe check. Interactively the capture skill's hand-off follows. In a scheduled run the skill SHALL stop at a review pull request instead, and SHALL state that the agent never merges it.

#### Scenario: Only owed meetings are rendered
- **WHEN** the runner sees meetings that are tagged for this store and absent, tagged for this store and present, tagged for this store and locked, untagged, tagged for this store and another, declined, and tagged only for another store
- **THEN** only the first is rendered into the inbox, and each of the others is counted as present or listed under its own report section

#### Scenario: A capture carries the record and no credential
- **WHEN** an owed meeting is rendered
- **THEN** the capture carries `source_type: circleback` and its prefixed source id, the transcript under the store's required section, no trailing whitespace, and not the recording URL

#### Scenario: A repeated run does not collide with the last
- **WHEN** the runner runs twice with the same meetings owed
- **THEN** the second run reuses the fixed worktree path and renders the same captures without failing

### Requirement: Submit and land are owned skills over the session commands
contexture SHALL ship `ctxr-submit` and `ctxr-land` as contexture-owned skills delivered by init and update. The submit skill SHALL state the entry condition that admits it — an explicit operator request to wrap up, or the operator's own closing signal — alongside the anti-triggers that do not admit it, naming an agent's own judgment that its assigned task is finished as the chief one. It SHALL run `ctxr session status` as the re-scan, offer a rollup for any entity `ctxr rollup stale` flags, run the capture skill exactly once, hold one coherent unit per pull request, and end in `ctxr session submit` with a branch name, a commit message, a title and a body answering why, what changed, route, verification and follow-ups, without an intervening confirmation, because the request to submit is the consent and the command's store-scope check is the gate. It SHALL NOT instruct writing the Knowledge changes or Pages sections, which the command writes. It SHALL close by reporting the pull request, naming the target a land needs, and, when the store declares change approval, the approval page address. The land skill SHALL be as before: name its target explicitly, read state with `gh pr view` and `ctxr review list` before any side effect, gate on an explicit go unless already approved, land with `ctxr land`, and route a conflict to the lifecycle skill. The lifecycle skill SHALL cover start, including acting on `changes-requested` and `blocked` rows `ctxr session list --review` reports when the store declares change approval, the resting state between turns, re-scan through `ctxr session status`, conflicts through `ctxr session rebase`, sequencing, and removal through `ctxr session discard`, and SHALL reference submit and land without repeating their steps.

#### Scenario: Submit ends in the session command, gated
- **WHEN** an agent follows the rendered submit skill
- **THEN** it re-scans with `ctxr session status`, invokes the capture skill exactly once, and ends with `ctxr session submit` and no confirmation step, naming no `git push` or `gh pr create`

#### Scenario: Submit leaves the generated sections to the command
- **WHEN** the submit skill is rendered for a store
- **THEN** it does not instruct running `ctxr graph diff` or `ctxr publish urls` to paste their output, and states that the command appends those sections

#### Scenario: Submit still states what admits it
- **WHEN** the submit skill is rendered for a store
- **THEN** it carries an entry-condition section ahead of the first step naming the admitting request and the anti-triggers, including that a finished task and the agent's own summary are not closing signals

#### Scenario: The lifecycle skill drives the session commands
- **WHEN** the session-lifecycle skill is rendered for a store that declares change approval
- **THEN** it reads requested changes from `ctxr session list --review`, re-scans with `ctxr session status`, resolves conflicts with `ctxr session rebase`, and removes a session with `ctxr session discard`

#### Scenario: Land is unchanged
- **WHEN** an agent follows the rendered land skill
- **THEN** it reads the pull request's state and decision state before landing, gates on an explicit go unless already approved, and lands with `ctxr land`

#### Scenario: Update delivers the reworded skills
- **WHEN** a store initialized before this change runs the update command
- **THEN** the submit and lifecycle skills are present with the managed header and drive the session commands, and a second update reports nothing changed

### Requirement: No secret in the environment reaches a model CLI
`ctxr second-opinion` SHALL NOT pass to a model CLI any environment variable outside its declared allowlist, so a forge token, an App credential or its file path present in its own environment is never visible to a critic. A preflight that fails SHALL name the variables it withheld, never their values.

#### Scenario: A forge credential is withheld
- **WHEN** the command runs with `GH_TOKEN`, `CONTEXTURE_GITHUB_APP_PRIVATE_KEY_FILE` and `ANTHROPIC_API_KEY` set, against stub CLIs that record their environment
- **THEN** each stub saw `ANTHROPIC_API_KEY` and neither of the other two

#### Scenario: The pass-through cannot name a protected variable
- **WHEN** `CTXR_SECOND_OPINION_PASS_ENV=GH_TOKEN` is set
- **THEN** the command exits with the usage code naming `GH_TOKEN`, and no CLI is invoked

#### Scenario: An operator passes a variable through
- **WHEN** `CTXR_SECOND_OPINION_PASS_ENV=CORP_CONFIG` and `CORP_CONFIG` are set
- **THEN** each stub saw `CORP_CONFIG`

### Requirement: An MCP-rendered skill names only what the surface offers
A test over the shared skills SHALL fail, naming the skill and the term, when one names a tool the surface does not register, a `ctxr` command the surface's command-to-tool mapping neither routes nor marks unavailable, or a `git` or `gh` step whose sentence does not also name the tool that does it through the store's server. The tool names, allowlists and unavailable commands SHALL be read from the same definitions the server uses.

#### Scenario: An unmapped git step fails the check
- **WHEN** a shared skill instructs `git rebase -i` with no tool named beside it
- **THEN** the check exits non-zero naming that skill and the command

### Requirement: contexture publishes one plugin for every store
contexture's repository SHALL carry the Claude plugin `contexture` under `plugins/contexture/`, generated from the MCP render and listed by `.claude-plugin/marketplace.json` at its root. Its `version` SHALL equal the CLI's, and it SHALL carry no MCP server entry, credential, hook, local server or top-level `bin/` directory. `ctxr plugin build` SHALL write it without reading a store, and in a store that declares `mcp` also that store's ChatGPT plugin, with its connector.

#### Scenario: The plugin carries no connector
- **WHEN** `ctxr plugin build` runs outside any store
- **THEN** it writes the Claude plugin with the rendered skills and no MCP server entry, its version is the CLI's version, and no ChatGPT plugin is written

### Requirement: The committed plugin is checked against the render
A test SHALL fail, naming the first differing file, when the committed `plugins/contexture/` or `plugins/second-opinion/` differs from what `ctxr plugin build` writes, or when either's version differs from the package's, so a skill change cannot merge without the plugins it changes.

#### Scenario: The committed plugin is current
- **WHEN** the test suite runs on a commit whose skills, preamble and version match the committed `plugins/contexture/` and `plugins/second-opinion/`
- **THEN** the freshness test passes

#### Scenario: A skill change without a regenerated plugin fails
- **WHEN** a skill template changes and `plugins/contexture/` is not regenerated
- **THEN** the freshness test fails naming the differing skill file

#### Scenario: The second plugin is checked too
- **WHEN** the second-opinion skill's template changes and `plugins/second-opinion/` is not regenerated
- **THEN** the freshness test fails naming that plugin's skill file

### Requirement: The plugin's commands open its skills
The plugin SHALL carry a command for each entry of a declared map from command name to included skill. Each command's body SHALL be its skill's MCP render followed by the person's arguments; and its description SHALL mark it as a typed shortcut. A test SHALL fail, naming the command, when its skill is not one the plugin carries or its body differs from that skill's render.

#### Scenario: A command opens its skill
- **WHEN** the plugin is built
- **THEN** `commands/submit.md` carries the `ctxr-submit` render and a description beginning as a typed shortcut, and no frontmatter key beyond `description`

#### Scenario: A command naming a missing skill fails
- **WHEN** the command map names a skill the plugin does not include
- **THEN** the check fails naming that command

### Requirement: The shared skills are one text on both surfaces
The owned skills the plugin carries SHALL be one text, from one template, that an agent follows in a shell running `ctxr` or through the store's server's tools. Each SHALL open with one shared section saying how to tell the two apart and how a `ctxr` step, a path and a commit are done through the server. A store's copy and the plugin's copy SHALL differ only in store values, which the plugin names by placeholders. The second-opinion skill SHALL be one of them, since the store's server runs `ctxr second-opinion`. The upgrade and Circleback skills, which run other local programs, and the land and derived-artifacts skills SHALL stay out of it.

#### Scenario: A store's copy and the plugin's copy differ only in values
- **WHEN** a shared skill is rendered for a store and for the plugin
- **THEN** replacing each of the store's values in the store's copy by its placeholder yields the plugin's copy

#### Scenario: The plugin carries no shell-only skill
- **WHEN** the plugin is built
- **THEN** it carries the capture and second-opinion skills with the shared section, and not the upgrade or land skills

### Requirement: The plugin opens a second opinion by a typed command
The plugin's command map SHALL map `second-opinion` to `ctxr-second-opinion`, so `/contexture:second-opinion` opens that skill's render through the same check as every other command.

#### Scenario: The second-opinion command opens its skill
- **WHEN** the plugin is built
- **THEN** `commands/second-opinion.md` carries the `ctxr-second-opinion` render followed by the person's arguments

### Requirement: Each model CLI runs from a fresh home holding only its login
Where its run is confined (next requirement), `ctxr second-opinion` SHALL run each model CLI with a fresh temporary folder as both its `HOME` and its working directory, holding at the start only a copy of that CLI's declared login files, and SHALL remove the folder when the run ends. A login file the run changed SHALL be copied back over the original only when the original is unchanged since it was copied.

#### Scenario: A critic starts with only its login
- **WHEN** a confined critique runs with stub CLIs that list their `HOME`
- **THEN** each stub's `HOME` held only its own declared login file, it was the stub's working directory, and it no longer exists after the run

#### Scenario: A refreshed login is kept
- **WHEN** the stub `codex` rewrites its `auth.json` during a confined run, and the original was not changed meanwhile
- **THEN** the original `auth.json` holds the stub's rewrite after the run

### Requirement: A model CLI's run is confined to its folder where the kernel allows
Where `setpriv` applies Landlock rules, `ctxr second-opinion` SHALL wrap each model CLI so that it can read only the declared system paths, the CLI's install directory and its folder, and write only its folder. Where it cannot, the run SHALL use the real `HOME` and a scratch working directory as before. `preflight` SHALL run each CLI as a critique would, confinement included, and report whether it was confined and, if not, why.

#### Scenario: A confined critic cannot read outside its folder
- **WHEN** a critique runs on a machine whose `setpriv` supports Landlock, and the stub `codex` tries to read a file outside its folder
- **THEN** the read fails with a permission error, the stub reports it, and the critique completes

#### Scenario: An unconfined machine says so
- **WHEN** `ctxr second-opinion preflight` runs where `setpriv` has no Landlock support
- **THEN** it reports each CLI as not confined, with the reason, and its exit code is unaffected by that alone

### Requirement: The environment overrides the lineup for one run, and the source is reported
For a critic that runs its tool, a model or effort named in the command's own `CTXR_SECOND_OPINION_` environment variables SHALL win over the store's configuration for that run, in both tiers. `preflight`, and the manifest of a critique or a poll, SHALL name for each critic the model asked for and its source: the environment, the store's configuration, or the shipped default. A test runs the command against stub CLIs that record their arguments.

#### Scenario: The environment wins for one run
- **WHEN** store `ctx-a` writes the tool as a critic's route and a model for it, and the run's environment names a different model for that critic
- **THEN** the tool is asked for the environment's model, and the report names the environment as its source

#### Scenario: The report says where a model came from
- **WHEN** a critique completes in a store that writes the tool and a model for one critic, with no key and no lineup variable in the environment
- **THEN** the manifest records the store's configuration as that model's source and the shipped default as the source of the other two

### Requirement: An invalid lineup fails and is never substituted
The command SHALL NOT ask for another model when a CLI refuses the one resolved for it: that CLI is a failed critic, recorded with the CLI's own reason. A configuration naming a family or a route that contexture does not have SHALL fail to load, by the configuration schema, before any model CLI starts. A test covers each with stub CLIs.

#### Scenario: A refused model is a failed critic
- **WHEN** a stub CLI rejects the model the store configured for it
- **THEN** that critic is recorded as failed with the CLI's reason, and no other model is asked for

#### Scenario: An unknown CLI in the lineup is refused at load
- **WHEN** a store's configuration names a lineup entry for a family contexture does not have
- **THEN** loading the configuration fails naming that key, and no model CLI starts

### Requirement: An OpenRouter critic receives its prompt and nothing else
A request to OpenRouter SHALL carry the slug, the critic's own prompt as its only message, no tool definition, and no header or field naming the store, its operator or the machine. It SHALL be bounded by the same per-critic timeout as a model CLI. The answer's text and the model OpenRouter reports SHALL enter the manifest, the letters and the blind check exactly as a CLI's do. A test inspects the request a stub endpoint recorded.

#### Scenario: The request holds one prompt and no tools
- **WHEN** a critique routes one entry through a stub endpoint that records the request
- **THEN** the recorded body holds that critic's prompt as its single message and no tool definition, and it contains no text produced by another critic

#### Scenario: Nothing identifies the store
- **WHEN** the same request is recorded for a critique run in store `ctx-a`
- **THEN** no header and no body field other than the prompt carries the store's name, its path or the host's name

#### Scenario: A blind answer from OpenRouter does not count
- **WHEN** the stub endpoint returns a well-formed verdict whose findings cite nothing in the plan
- **THEN** that critique is marked blind in the manifest and excluded from the valid count

### Requirement: A failed OpenRouter critic is never replaced
A request that times out, cannot connect, is answered with an error status, or returns no text SHALL be recorded as a failed critic with its cause, taken from OpenRouter's own message where there is one. The command SHALL NOT start that entry's model CLI or ask for another slug in its place. A test covers each cause with a stub endpoint.

#### Scenario: A refused slug is a failed critic
- **WHEN** the stub endpoint answers a request with an error naming an unknown model
- **THEN** that critic is recorded as failed with the endpoint's message, that entry's stub CLI is never started, and no second request is made

#### Scenario: A request that outlasts the timeout fails
- **WHEN** the stub endpoint does not answer within the run's `--timeout`
- **THEN** that critic is recorded as failed naming the timeout, and the other critics' results are kept

### Requirement: The OpenRouter key is read from the environment and appears nowhere else
The command SHALL read the key from `OPENROUTER_API_KEY` in its own environment and from nowhere else, and SHALL place it only in the request's authorization header. No manifest, answer file, raw file, output stream or detached run's folder SHALL contain it. An entry routed through OpenRouter with no key set SHALL be a failed critic whose cause names the variable. A test searches everything a run wrote and printed for the stub key.

#### Scenario: The key reaches the endpoint and nothing else
- **WHEN** a detached critique routes one entry through a stub endpoint with a stub key set, and its result is fetched
- **THEN** the recorded request carries the key in its authorization header, and no file in the run's folder and no line the commands printed contains it

#### Scenario: A missing key fails that critic only
- **WHEN** store `ctx-a` routes one entry through OpenRouter and the environment sets no key
- **THEN** that critic is recorded as failed naming `OPENROUTER_API_KEY`, no request is made, and the two model CLIs still run

### Requirement: The OpenRouter key never reaches a model CLI
The environment allowlist SHALL withhold every `OPENROUTER_` variable from a model CLI, and the pass-through variable SHALL NOT be able to name one: naming it SHALL end the command with the usage code before any critic starts. The allowlist is the mechanism, and a test runs stub CLIs that record their environment.

#### Scenario: A CLI critic does not see the key
- **WHEN** a critique runs with `OPENROUTER_API_KEY` set, one entry routed through OpenRouter and two stub CLIs that record their environment
- **THEN** neither stub saw `OPENROUTER_API_KEY`

#### Scenario: The pass-through cannot name the key
- **WHEN** `CTXR_SECOND_OPINION_PASS_ENV=OPENROUTER_API_KEY` is set
- **THEN** the command exits with the usage code naming `OPENROUTER_API_KEY`, no CLI is started and no request is made

### Requirement: An OpenRouter request declines data collection
Every request to OpenRouter SHALL ask it to route only to providers that do not collect the prompt. A request OpenRouter refuses for that reason SHALL be a failed critic carrying OpenRouter's message. The request body is the mechanism, and a test inspects it at a stub endpoint.

#### Scenario: The request carries the refusal
- **WHEN** a poll routes one entry through a stub endpoint that records the request
- **THEN** the recorded body asks for providers that do not collect data

### Requirement: Preflight and the manifest name each critic's route
`preflight`, and the manifest of a critique or a poll, SHALL say for each critic whether it ran through its model CLI or through OpenRouter, beside the model asked for and its source. `preflight` SHALL check an OpenRouter entry by one request for the tier's slug, and SHALL report it down, naming the cause, when the key is missing or the request fails. A test covers both with a stub endpoint.

#### Scenario: The manifest records the route
- **WHEN** a critique completes in store `ctx-a`, which routes one entry through OpenRouter
- **THEN** the manifest records OpenRouter as that critic's route with its slug and the store's configuration as the source, and the model CLI as the route of the other two

#### Scenario: Preflight pings the tier's slug
- **WHEN** `ctxr second-opinion preflight --tier strong` runs in the same store with a stub endpoint
- **THEN** the endpoint receives one request naming the `strong` slug, and that entry is reported up, through OpenRouter, with the slug and its source

#### Scenario: Preflight reports a missing key
- **WHEN** the same preflight runs with no key set
- **THEN** that entry is reported down naming `OPENROUTER_API_KEY`, and the command exits with the failed-check code

### Requirement: The OpenRouter address can be named in the environment
When `CTXR_SECOND_OPINION_OPENROUTER_URL` is set, requests SHALL go to that address in place of OpenRouter's own, unchanged in shape. The address SHALL NOT be read from the store's configuration. A test sets it to a stub endpoint.

#### Scenario: The environment names the address
- **WHEN** the variable names a stub endpoint and a critique routes one entry through OpenRouter
- **THEN** the stub endpoint receives the request and no request goes to OpenRouter's own address

#### Scenario: The configuration cannot name the address
- **WHEN** a store's configuration carries an address key in its second-opinion lineup
- **THEN** loading the configuration fails naming that key, and no critic starts

### Requirement: The second-opinion skill explains the OpenRouter route
The rendered `ctxr-second-opinion` skill SHALL state how a store routes a critic through OpenRouter, in its configuration and nowhere else; that the key is set in the environment and never in the store; that a plan sent this way goes to OpenRouter and the provider behind it, which the report names; and that such a critic cannot act, so it stays in a run on a plan from someone else. These are skill-markdown conventions, asserted by a test over the rendered skill.

#### Scenario: The rendered skill covers the route
- **WHEN** the skill is rendered for a store
- **THEN** it names the lineup key for a critic's route, names `OPENROUTER_API_KEY` as an environment variable, says where a routed plan goes, and says a routed critic need not be left out of a run on someone else's plan

### Requirement: contexture publishes a plugin that carries only the second opinion
contexture's repository SHALL carry the Claude plugin `second-opinion` under `plugins/second-opinion/`, listed in the marketplace beside `contexture`. It SHALL carry the `ctxr-second-opinion` skill, as the `contexture` plugin carries it, one command `ask` that opens it, and no other skill, MCP server entry, credential or hook. `ctxr plugin build` SHALL write both plugins from one declared list, without reading a store.

#### Scenario: The plugin carries one skill
- **WHEN** `ctxr plugin build` runs outside any store
- **THEN** it writes `second-opinion/` with `skills/ctxr-second-opinion/SKILL.md` and `commands/ask.md`, no other skill, no MCP server entry, and the CLI's version

#### Scenario: A command that opens a missing skill fails
- **WHEN** the declared list gives the `second-opinion` plugin a command that opens `ctxr-capture`
- **THEN** the plugin-build check fails naming that plugin and command

#### Scenario: Both plugins carry the same skill text
- **WHEN** both plugins are built
- **THEN** `ctxr-second-opinion/SKILL.md` is byte-identical in the two

#### Scenario: The marketplace lists both
- **WHEN** the marketplace file is read
- **THEN** it lists `contexture` at `./plugins/contexture` and `second-opinion` at `./plugins/second-opinion`

### Requirement: The second-opinion skill names the server's tools
The rendered `ctxr-second-opinion` skill SHALL say which tool runs each `ctxr second-opinion` step through a server, that the plan goes in `plan` and the question in `prompt`, and that a run not ready in time returns an id which `second_opinion_result` fetches. The skill's own text SHALL NOT mention `@input` or an `input` field, and the shared opening section SHALL give them to `ctxr_write` alone. These are skill-markdown conventions, asserted by a test over the render and by the drift check.

#### Scenario: The rendered skill covers the tools
- **WHEN** the skill is rendered for the plugin
- **THEN** it names `second_opinion_preflight`, `second_opinion_critique`, `second_opinion_poll` and `second_opinion_result`, names the `plan` and `prompt` fields, and mentions `@input` once, in the opening section's sentence about `ctxr_write`

#### Scenario: The drift check passes on the move
- **WHEN** the drift check runs over the plugin's render of the second-opinion skill
- **THEN** it reports no finding: every `ctxr second-opinion` command the skill names is routed to a tool

### Requirement: The lineup is keyed by model family, and each family names how it is reached
The store's second-opinion lineup SHALL be keyed by the families `claude`, `gpt`, `gemini` and `grok`. Each family SHALL accept an optional route, `via`, whose values are the family's command-line tool, OpenRouter, or off. No key of the lineup has a default, and `ctxr init` writes none. The configuration schema refuses an unknown family, an unknown route and an unknown field when the configuration loads, naming the key. A test loads each case.

#### Scenario: A store writes one route
- **WHEN** store `ctx-a` writes OpenRouter as the route of `gemini` and nothing else
- **THEN** the loaded lineup holds that route for `gemini` and nothing for the other three families

#### Scenario: A written configuration carries no lineup
- **WHEN** `ctxr init` completes with every convention accepted
- **THEN** the written `contexture.yaml` holds no second-opinion lineup and no model from the shipped tables

#### Scenario: An unknown family or route fails the load
- **WHEN** store `ctx-b` writes a family the lineup does not have, or a route that is none of the three
- **THEN** any `ctxr` command that loads the configuration fails naming that key

### Requirement: A critic with no route written takes the machine's default
For a family with no route written, `ctxr second-opinion` SHALL send the critic through OpenRouter when the OpenRouter key variable is set and not empty in the command's environment, and SHALL run the family's tool otherwise. A family with no tool and no route is not in the lineup where no key is set. A written route SHALL win over the default in both directions. A test runs the command with stub tools and a stub endpoint, with and without the key.

#### Scenario: No key and nothing written
- **WHEN** a critique runs in a store that writes no lineup, with no key set
- **THEN** `claude`, `gpt` and `gemini` each run their tool, `grok` is not in the run, and the endpoint receives no request

#### Scenario: A key and nothing written
- **WHEN** the same critique runs with the key set
- **THEN** all four critics are answered through the endpoint, each with the model shipped for its family at the run's tier, and no tool is started

#### Scenario: A written route wins over the default
- **WHEN** store `ctx-a` writes the tool as the route of two families and OpenRouter for a third, and a critique runs with the key set
- **THEN** the two run their tools and the third is answered through the endpoint

#### Scenario: Outside a store the command still runs
- **WHEN** `ctxr second-opinion poll` runs in a directory that is not inside a store, with no key set
- **THEN** it asks each of the three tools for its shipped model and completes

#### Scenario: A written route to OpenRouter holds without a key
- **WHEN** store `ctx-a` writes OpenRouter as a family's route and a critique runs with no key set
- **THEN** that critic fails naming the key variable, the endpoint receives no request, and the other critics run

### Requirement: A critic that is off is in no run
A family whose route is written as off SHALL be left out of every run, and naming it in `--only` SHALL make the command exit with the usage code, saying it is off, before any tool starts or any request is made. A run whose lineup holds fewer than two critics SHALL be refused the same way. A test covers both.

#### Scenario: An off critic is named in `--only`
- **WHEN** store `ctx-a` writes off for `grok` and a preflight runs with `--only claude,grok`
- **THEN** it exits with the usage code saying `grok` is off, and no tool is started

#### Scenario: Too few critics are on
- **WHEN** store `ctx-b` writes off for two of the three families that have a tool, and a critique runs with no key set
- **THEN** it exits with the usage code naming the number of critics in the lineup, and no tool is started

### Requirement: The critics are named for their model families
The critics SHALL be named `claude`, `gpt`, `gemini` and `grok` wherever contexture names one: the lineup's keys, the values of `--only`, the per-critic environment variables, the manifest, `preflight` and the files a run writes. The tool that runs a critic keeps its vendor's name, used only to start it or in a message about the tool itself. A test reads a run's manifest and files with stub tools.

#### Scenario: A run reports its critics by family
- **WHEN** a critique completes with nothing written and no key set
- **THEN** the manifest names the critics `claude`, `gpt` and `gemini`, and the raw files are named for them

### Requirement: The spellings of release 0.45.0 are refused with their replacement
The lineup's tier-first keys, the critic names `codex` and `agy`, and the per-critic OpenRouter variable SHALL be refused and never read. The configuration schema refuses the old keys when the configuration loads. The command exits with the usage code, before any tool starts or any request is made, for an old critic name in `--only` and for a non-empty per-critic variable under an old name or of the removed kind. Each refusal names the replacement. A test covers each.

#### Scenario: The configuration is tier first
- **WHEN** store `ctx-a` writes a lineup with a tier as its first key
- **THEN** any `ctxr` command that loads the configuration fails, saying the lineup is keyed by model family

#### Scenario: The configuration uses an old critic name
- **WHEN** store `ctx-a` writes a lineup entry under `agy`
- **THEN** the load fails naming `gemini` as its name now

#### Scenario: The command line uses an old name
- **WHEN** `ctxr second-opinion preflight --only claude,agy` runs
- **THEN** it exits with the usage code naming `agy` and `gemini`, and no tool is started

#### Scenario: The environment uses an old variable
- **WHEN** a critique runs with a non-empty model variable under the name `codex`
- **THEN** it exits with the usage code naming that variable and its replacement, and no tool is started

#### Scenario: An old variable passed through empty is ignored
- **WHEN** a preflight runs with an old variable set to the empty string
- **THEN** the preflight runs as if the variable were absent

### Requirement: Grok is a fourth critic, reached through OpenRouter
`grok` SHALL be a critic with a role of its own in a critique, `verifier`, whose persona is a package template. It has no command-line tool: the configuration schema refuses the tool as its route, and naming it in `--only` where it is not in the lineup makes the command exit with the usage code, saying why. A critique needs two valid answers whatever the number of critics. A test runs four critics against a stub endpoint.

#### Scenario: Four critics answer
- **WHEN** a critique runs with the key set and nothing written
- **THEN** the manifest holds four critiques with the roles architect, skeptic, pragmatist and verifier, four lettered files are written, and each request carries that critic's own persona

#### Scenario: The tool is refused as Grok's route
- **WHEN** store `ctx-a` writes the tool as the route of `grok`
- **THEN** the load fails saying that family has no command-line tool

#### Scenario: Grok is named where it is not in the lineup
- **WHEN** a preflight runs with `--only claude,grok`, no key set and nothing written
- **THEN** it exits with the usage code saying `grok` runs through OpenRouter only and naming the key variable

### Requirement: contexture ships a model for every family, route and tier
The package SHALL carry a model for each family that has a tool, at each tier, and an OpenRouter model slug for each of the four families at each tier. Both tables are package content: no key of `contexture.yaml` defaults to them. A critic for which the store names no model SHALL be asked for the shipped one for its route and the run's tier. A unit test fails when a family lacks a tier or a slug lacks the `<vendor>/<model>` form.

#### Scenario: Every family has a model at every tier
- **WHEN** the tables are read
- **THEN** each of the four families gives one OpenRouter slug of the form `<vendor>/<model>` for each tier, and each family with a tool gives one tool model for each tier

#### Scenario: The shipped model follows the tier
- **WHEN** store `ctx-a` writes OpenRouter as a family's route and no model, and a critique runs at the default tier and again with `--tier fast`
- **THEN** the endpoint receives that family's shipped slug for each run's tier, and the manifest names the shipped default as the model's source

### Requirement: A written model applies at its tier, on the route written beside it
A family MAY name a model for a tier. A written model SHALL be asked for at that tier only, and the other tier keeps the shipped one. The configuration schema SHALL refuse, when the configuration loads, a model with no tool or OpenRouter route written beside it, and a model for the OpenRouter route that lacks the `<vendor>/<model>` form. A test covers each.

#### Scenario: A model is written for one tier
- **WHEN** store `ctx-a` writes OpenRouter as a family's route and a slug for the `strong` tier, and a critique runs at each tier
- **THEN** the endpoint receives the written slug at `strong` and the shipped slug at `fast`, and the manifest names the store's configuration as the source of the first

#### Scenario: A model is written with no route
- **WHEN** store `ctx-b` writes a model for a family and no route
- **THEN** the load fails naming that key and saying a model needs its route written beside it

#### Scenario: A model through OpenRouter is not a slug
- **WHEN** store `ctx-b` writes OpenRouter as a family's route and a model with no `/`
- **THEN** the load fails naming that key and the slug's form

### Requirement: The route is never chosen for one run
No environment variable and no option SHALL choose a critic's route for one run. A non-empty model variable for a critic that goes through OpenRouter, whether its route was written or is the default, SHALL make the command exit with the usage code before any tool starts or any request is made, naming the variable. For a critic that runs its tool, that variable SHALL name the tool's model as before. A test covers both with stub tools and a stub endpoint.

#### Scenario: A model variable cannot put a critic back on its tool
- **WHEN** store `ctx-a` writes OpenRouter as the route of `gemini`, and a critique runs there with that critic's model variable set
- **THEN** it exits with the usage code naming the variable, no tool is started and the endpoint receives no request

#### Scenario: The model variable still applies to a tool
- **WHEN** the same store writes the tool as the route of `gpt`, and a critique runs with that critic's model variable set
- **THEN** that tool is asked for the variable's model, and the manifest names the environment as the model's source

### Requirement: Reports say which route a critic took and what chose it
`preflight`, and the manifest of a critique or a poll, SHALL give for each critic its route, whether the configuration or the default chose that route, the model asked for, and whether the environment, the configuration or the shipped tables named that model. A test reads both reports after runs against stub tools and a stub endpoint.

#### Scenario: The manifest records what chose each route
- **WHEN** a critique completes in store `ctx-a`, which writes a route for some families, with the key set
- **THEN** the manifest records the configuration as the source of each written route and the default as the source of each of the others

#### Scenario: Preflight shows the model in use
- **WHEN** `ctxr second-opinion preflight` runs with the key set and nothing written
- **THEN** each of the four lines shows the shipped slug, that it is a shipped default, and that it ran through OpenRouter

### Requirement: A scheduled check reports a shipped slug that OpenRouter no longer lists
The repository SHALL carry a script that reads OpenRouter's public model list, with no key and no header naming the caller, and exits non-zero naming each shipped OpenRouter slug that the list does not hold. A scheduled workflow SHALL run it and keep one tracking issue open while it fails. The script SHALL NOT run as part of the test suite, which makes no network request.

#### Scenario: Every shipped slug is listed
- **WHEN** the script runs against a model list that holds every shipped slug
- **THEN** it exits 0

#### Scenario: A shipped slug is missing
- **WHEN** the script runs against a model list that lacks one shipped slug
- **THEN** it exits non-zero and names that slug and its family and tier

### Requirement: The second-opinion skill explains the lineup
The rendered `ctxr-second-opinion` skill SHALL name the four families and the three routes, state the default route with and without a key, state that a model is not written and where the one in use is shown, and print no model from the shipped OpenRouter table. These are skill-markdown conventions, asserted by a test over the rendered skill.

#### Scenario: The rendered skill covers the lineup
- **WHEN** the skill is rendered for a store
- **THEN** it names the four families, the three values of the route, what a family with no route does on a machine with a key and on one without, and `preflight` as where the model in use is shown, and it contains no slug from the shipped table

### Requirement: The second-opinion skill names the critics and their tools
The rendered `ctxr-second-opinion` skill SHALL say which tool each critic runs, name the fourth critic's stance, tell the agent to report a route that the default chose, and name no per-critic variable under a retired name or of the removed kind. These are skill-markdown conventions, asserted by a test over the rendered skill.

#### Scenario: The rendered skill names the critics and their tools
- **WHEN** the skill is rendered for a store
- **THEN** it says which tool `claude`, `gpt` and `gemini` each run, describes the stance Grok takes, names the report field that says the default chose a route, and names no per-critic OpenRouter variable and no variable under `codex` or `agy`
