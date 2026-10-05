## MODIFIED Requirements

### Requirement: `AGENTS.md` is the canonical entry document
Every context store SHALL carry an `AGENTS.md` file at its root that is the canonical, harness-agnostic entry document for the store — its fundamentals, its current mission when one is configured, and its full operating conventions, inlined rather than referenced, with no harness-specific extras. A harness-specific entry file (for example, one named for a particular agent product) SHALL contain nothing beyond an import of `AGENTS.md` plus that harness's own extras, and SHALL NOT duplicate canonical content.

#### Scenario: A harness-specific entry file only imports
- **WHEN** a store's `contexture.yaml` declares a harness-specific entry filename
- **THEN** `contexture doctor` fails if that file contains convention text not present in `AGENTS.md`, and passes when it contains only the import plus harness-specific extras

#### Scenario: Reading only `AGENTS.md` is sufficient
- **WHEN** an agent with no harness-specific context reads `AGENTS.md` at a store's root
- **THEN** it finds the root-resolution rule, the frontmatter schema pointer, the write-path rule, a statement that agent identity, persona, and the agent's conversational recall of the user and of itself belong to its harness while subject-matter knowledge belongs to this store, the store's current mission when one is configured, and the store's full operating conventions, without needing to read any other file

#### Scenario: The canonical section names the mission document when configured
- **WHEN** a store's `contexture.yaml` declares `organize.mission_path` and the entry document is regenerated
- **THEN** the canonical section names that path as a document to load at session start, alongside the root-resolution rule, the frontmatter schema pointer, and the write-path rule — immediately followed by the "Mission" section carrying that document's full inlined body

#### Scenario: No mission pointer when unconfigured
- **WHEN** a store declares no `organize.mission_path` and the entry document is regenerated
- **THEN** the canonical section names no mission document, and regenerating again reports no change

### Requirement: The canonical section states the harness/store identity boundary
The canonical section SHALL state, on every store regardless of configuration, that agent identity, persona, and the agent's conversational recall — what it remembers of the user and of itself across sessions — are the harness's responsibility, not the store's, and that subject-matter knowledge, including knowledge worth retrieving in a later session, is the store's — the store holds knowledge and skills. This statement SHALL reference paths (the skills path) rather than inlining any identity content, and SHALL NOT introduce a configuration key, command, or adapter kind for identity.

#### Scenario: The boundary statement is present on every store
- **WHEN** the entry document is generated for a store, regardless of what its `contexture.yaml` declares
- **THEN** the canonical section states that identity, persona, and the agent's conversational recall belong to the harness, not the store, states that subject-matter knowledge belongs to the store, and names no identity file or path of its own

#### Scenario: A second generation is byte-stable
- **WHEN** the entry document is regenerated against unchanged configuration
- **THEN** the boundary statement's text is unchanged and regeneration reports no change
