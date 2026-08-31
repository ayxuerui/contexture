## MODIFIED Requirements

### Requirement: The shipped skills carry decision procedures
contexture SHALL ship, as contexture-owned skills delivered by init and update, procedures for: placement, ingest orchestration, connection finding, connection proposal, rollup, session lifecycle, session capture, derived artifacts, and organize audit. Each SHALL state its decision rules against the store's configured taxonomy, contexts, and relation vocabulary — never a shipped profile's layer names or any real context name — and SHALL name the command that verifies each step it asks for.

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
- **THEN** every owned skill above is present at the configured procedures path with the managed header, and a second update reports nothing changed

### Requirement: The session-capture skill applies through the command
The owned session-capture skill SHALL instruct the agent to write the approved items to a proposal file and run `ctxr session capture --proposal <file>`, and to take its report from the command's output.

#### Scenario: Skill applies via the command
- **WHEN** an agent follows the rendered skill's Apply step
- **THEN** the only write instruction is the capture command, and the report step references its output

#### Scenario: Skill names resolved identity paths
- **WHEN** the rendered skill is generated for any store
- **THEN** it names no identity file or path — the skill's contract covers store notes only, and identity is no longer a concept the skill or the command it invokes knows about
