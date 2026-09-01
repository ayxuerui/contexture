## MODIFIED Requirements

### Requirement: `AGENTS.md` is the canonical entry document
Every context store SHALL carry an `AGENTS.md` file at its root that is the canonical, harness-agnostic index of the store's conventions and procedures. A harness-specific entry file (for example, one named for a particular agent product) SHALL contain nothing beyond an import of `AGENTS.md` plus that harness's own extras, and SHALL NOT duplicate canonical content.

#### Scenario: A harness-specific entry file only imports
- **WHEN** a store's `contexture.yaml` declares a harness-specific entry filename
- **THEN** `contexture doctor` fails if that file contains convention text not present in `AGENTS.md`, and passes when it contains only the import plus harness-specific extras

#### Scenario: Reading only `AGENTS.md` is sufficient
- **WHEN** an agent with no harness-specific context reads `AGENTS.md` at a store's root
- **THEN** it finds the root-resolution rule, the frontmatter schema pointer, the write-path rule, a statement that agent identity and durable cross-session memory belong to its harness rather than to this store, and an index of every store procedure, without needing to read any other file

#### Scenario: The canonical section names the mission document when configured
- **WHEN** a store's `contexture.yaml` declares `organize.mission_path` and the entry document is regenerated
- **THEN** the canonical section names that path as a document to load at session start, alongside the root-resolution rule, the frontmatter schema pointer, and the write-path rule

#### Scenario: No mission pointer when unconfigured
- **WHEN** a store declares no `organize.mission_path` and the entry document is regenerated
- **THEN** the canonical section names no mission document, and regenerating again reports no change

### Requirement: The shipped skills carry decision procedures
contexture SHALL ship, as contexture-owned skills delivered by init and update, procedures for: placement, ingest orchestration, connection finding, connection proposal, rollup, mission, session lifecycle, session capture, derived artifacts, and organize audit. Each SHALL state its decision rules against the store's configured taxonomy, contexts, and relation vocabulary — never a shipped profile's layer names or any real context name — and SHALL name the command that verifies each step it asks for.

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
- **THEN** every owned skill above is present at the configured procedures path with the managed header, and a second update reports nothing changed

## ADDED Requirements

### Requirement: The canonical section states the harness/store identity boundary
The canonical section SHALL state, on every store regardless of configuration, that agent identity, persona, and durable cross-session memory are the harness's responsibility, not the store's — the store holds knowledge and procedures. This statement SHALL reference paths (the procedures path) rather than inlining any identity content, and SHALL NOT introduce a configuration key, command, or adapter kind for identity.

#### Scenario: The boundary statement is present on every store
- **WHEN** the entry document is generated for a store, regardless of what its `contexture.yaml` declares
- **THEN** the canonical section states that identity and durable cross-session memory belong to the harness, not the store, and names no identity file or path of its own

#### Scenario: A second generation is byte-stable
- **WHEN** the entry document is regenerated against unchanged configuration
- **THEN** the boundary statement's text is unchanged and regeneration reports no change

### Requirement: The session-lifecycle skill reflects external workspace ownership
When a store's configuration declares `session.workspaces_external: true`, the rendered session-lifecycle skill SHALL state that session worktrees are provided by an external process and that the procedure MUST NOT create, switch, unlock, remove, or prune one. When the key is false or unset, the rendered skill SHALL retain its existing worktree-lifecycle instructions unchanged.

#### Scenario: External ownership is stated in the rendered skill
- **WHEN** a store declares `session.workspaces_external: true` and the session-lifecycle skill is rendered
- **THEN** the rendered text states that worktrees are externally provided and instructs against creating, switching, unlocking, removing, or pruning one

#### Scenario: Default rendering is unchanged
- **WHEN** a store declares no `session.workspaces_external` key (or declares it `false`) and the session-lifecycle skill is rendered
- **THEN** the rendered text is identical to a store initialized before this change
