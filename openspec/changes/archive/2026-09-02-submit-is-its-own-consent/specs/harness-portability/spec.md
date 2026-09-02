## MODIFIED Requirements

### Requirement: The shipped skills carry decision procedures
contexture SHALL ship, as contexture-owned skills delivered by init and update, skills for: placement, ingest orchestration, connection finding, connection proposal, rollup, mission, session lifecycle, session capture, derived artifacts, organize audit, and publish. Each SHALL state its decision rules against the store's configured taxonomy, contexts, and relation vocabulary — never a shipped profile's layer names or any real context name — and SHALL name the command that verifies each step it asks for.

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
- **THEN** a merge and a worktree reclaim are each preceded by an explicit confirmation step, a push and a pull-request open are not (the request to submit is itself that consent), and the skill instructs a re-scan of git state before any plan and a verification of side effects before any retry

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
