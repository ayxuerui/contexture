## MODIFIED Requirements

### Requirement: Leg-routing guidance is documented
The store's skill documentation SHALL state which retrieval leg to use for which kind of question, and SHALL make explicit that the catalog and the graph are artifacts contexture builds and maintains, to be consulted before falling back to direct content matching: structural questions (what connects to what) route to `graph query`; open conceptual questions route to the catalog first; known-literal or entity questions route to the agent's own direct content matching, scoped by the store's exclusion configuration and, where useful, narrowed first to a catalog section or graph neighborhood.

#### Scenario: Routing guidance names the CLI-maintained tools
- **WHEN** an agent reads the store's retrieval skill documentation
- **THEN** it finds an explicit statement that the catalog and the graph are contexture-built-and-maintained artifacts to consult first, plus which leg answers a structural, a conceptual, and a literal question
