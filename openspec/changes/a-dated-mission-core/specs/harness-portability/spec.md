## ADDED Requirements

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

## MODIFIED Requirements

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
