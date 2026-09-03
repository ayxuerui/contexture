## MODIFIED Requirements

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

#### Scenario: Publish delegates both halves of the craft rather than inventing either
- **WHEN** an agent follows the publish skill past the point where the page's form is chosen
- **THEN** it is instructed to take the page's visual language from the design-focused craft skill the store carries and its explanatory prose from the reader-calibration craft skill the store carries, rather than inventing either

#### Scenario: Publish keeps the reader's level distinct from the disclosure audience
- **WHEN** the publish skill instructs an agent to pitch a page's prose at a reader
- **THEN** it states that the reader's level of existing knowledge is not the audience the disclosure gate evaluates, that a level of knowledge is never passed to the gate as an audience, and that pitching the prose more plainly never widens what the page may contain

#### Scenario: Update delivers the expanded skill set to an existing store
- **WHEN** a store initialized before this change runs the update command
- **THEN** every owned skill above is present at the configured skills path with the managed header, and a second update reports nothing changed
