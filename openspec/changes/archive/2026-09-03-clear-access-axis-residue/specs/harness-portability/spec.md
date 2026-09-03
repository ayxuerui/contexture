## MODIFIED Requirements

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

#### Scenario: Publish delegates both halves of the craft rather than inventing either
- **WHEN** an agent follows the publish skill past the point where the page's form is chosen
- **THEN** it is instructed to take the page's visual language from the design-focused craft skill the store carries and its explanatory prose from the reader-calibration craft skill the store carries, rather than inventing either

#### Scenario: Publish keeps the reader's level distinct from the disclosure audience
- **WHEN** the publish skill instructs an agent to pitch a page's prose at a reader
- **THEN** it states that how much a reader already knows is a question about register alone, that it is never a reason to put more on the page, and that writing an explanation more plainly never widens what the page may contain — naming no audience selector and no gate, the store having none to name

#### Scenario: Update delivers the expanded skill set to an existing store
- **WHEN** a store initialized before this change runs the update command
- **THEN** every owned skill above is present at the configured skills path with the managed header, and a second update reports nothing changed


## ADDED Requirements

### Requirement: An owned skill names only affordances the CLI provides
Every contexture-owned skill SHALL instruct its steps using only commands and options the CLI registers. A long option named alongside a contexture command in a rendered owned skill SHALL resolve against the option table that command registers, and a skill naming an option no command accepts SHALL fail a check rather than ship. The enforcing mechanism is a test over the rendered skill set that resolves each such option against the CLI's own registration, so a skill cannot outlive the affordance it documents.

#### Scenario: A skill naming a removed option fails the check
- **WHEN** an owned skill instructs a step by naming a contexture command together with a long option that command does not register
- **THEN** the check exits non-zero, naming the skill and the option

#### Scenario: A skill naming only registered options passes
- **WHEN** every long option an owned skill names alongside a contexture command is one that command registers
- **THEN** the check passes, and an option named for a tool other than contexture is outside what the check resolves

#### Scenario: The selector-required message offers only selectors the command accepts
- **WHEN** `ctxr publish gather` is invoked with no subject selector
- **THEN** it exits with the usage code and its message names exactly the selectors the command registers
