## ADDED Requirements

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

## REMOVED Requirements

### Requirement: Owned skills read the vocabulary and the graph document from configuration
**Reason**: Its premise no longer holds. The requirement was built around a vocabulary a store declared in configuration, which is why it specified a fallback for the vocabulary being empty — a state that cannot occur now that the vocabulary is fixed and shipped. Keeping it would leave a specified behaviour ("fall back to a single group when it is empty") with no reachable input.

**Migration**: Replaced in full by "Owned skills render the relation vocabulary and read the graph document from configuration", above, which carries forward every other obligation unchanged — the graph-document path for connection-finding and ingest-orchestration, the entry document naming that path, and the prohibition on a skill hardcoding a relation name — and adds the requirement that each name is rendered with its definition.
