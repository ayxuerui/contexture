## Purpose

Extends the harness-portability capability (see `owned-skills-expansion`): the owned skills consume the configured relation vocabulary and the graph document rather than describing them in prose.

## ADDED Requirements

### Requirement: Owned skills read the vocabulary and the graph document from configuration
The connection-proposal skill SHALL group proposals by the relation vocabulary declared in configuration and fall back to a single group when it is empty; the connection-finding and ingest-orchestration skills SHALL direct the agent to the graph document at its configured path for cluster context; and the generated entry document's retrieval section SHALL name that path. No skill SHALL hardcode a relation name.

#### Scenario: Vocabulary flows into the proposal skill
- **WHEN** a store's configuration declares the relation names `supports` and `contradicts`
- **THEN** the rendered connection-proposal skill lists those two groups and no other relation name

#### Scenario: Empty vocabulary yields one group
- **WHEN** a store declares no relation vocabulary
- **THEN** the rendered skill instructs a single group and names no relation
