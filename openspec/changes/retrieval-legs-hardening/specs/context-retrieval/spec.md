## MODIFIED Requirements

### Requirement: Leg-routing guidance is documented
The store's procedure documentation SHALL state which retrieval leg to use for which kind of question, and SHALL make explicit that the catalog and the graph are artifacts contexture builds and maintains, to be consulted before falling back to direct content matching: structural questions (what connects to what) route to `graph query`; open conceptual questions route to the catalog first; known-literal or entity questions route to the agent's own direct content matching, scoped by the store's exclusion configuration and, where useful, narrowed first to a catalog section or graph neighborhood. The same routing SHALL additionally be available as a command that classifies a supplied question and reports the leg it routes to and the reason, so the contract is verifiable rather than resting on documentation alone.

#### Scenario: Routing guidance names the CLI-maintained tools
- **WHEN** an agent reads the store's retrieval procedure documentation
- **THEN** it finds an explicit statement that the catalog and the graph are contexture-built-and-maintained artifacts to consult first, plus which leg answers a structural, a conceptual, and a literal question

#### Scenario: The routing command and the documentation agree
- **WHEN** the routing command is invoked with a structural question, a conceptual question, and a known-literal question in turn
- **THEN** it routes them to the graph, the catalog, and direct content matching respectively, matching what the procedure documentation states

#### Scenario: Routing is deterministic and offline
- **WHEN** the routing command is invoked twice with the same question
- **THEN** it returns the same leg and reason both times, having made no network request and no model call

## ADDED Requirements

### Requirement: A note is reachable by its declared aliases
A note MAY declare alternative names in a configured frontmatter field. The graph build SHALL index every declared alias, and link resolution SHALL resolve a link written as an alias to the note declaring it. Two notes declaring the same alias, or a note declaring an alias that collides with another note's identity, SHALL fail the build non-zero naming both notes, by the same identity-collision rule the build already applies.

#### Scenario: A link written as an alias resolves
- **WHEN** a note declares an alias and another note links to that alias
- **THEN** the graph records an edge to the declaring note, and the link is not reported as dangling

#### Scenario: A colliding alias fails the build
- **WHEN** two notes declare the same alias, or a note's alias equals another note's resolved identity
- **THEN** `graph build` exits non-zero naming both notes and does not write the graph artifact

#### Scenario: Aliases are authored, never inferred
- **WHEN** the graph build runs over a note with no alias field
- **THEN** no alias is generated for it from its title, path, or content

### Requirement: Demotion is distinct from exclusion
Configuration MAY declare a path prefix demoted. A note under a demoted prefix SHALL remain retrievable — present in the catalog, present in the graph, and returned by every leg — but SHALL be ordered after all non-demoted results wherever a leg returns an ordered list. Exclusion, which removes a path from retrieval entirely, SHALL remain a separate declaration; no path SHALL be both, and a store declaring a path both ways SHALL fail `doctor` non-zero naming the path.

#### Scenario: A demoted note still surfaces, ordered last
- **WHEN** a leg returns a result set containing one note under a demoted prefix and one not
- **THEN** both are returned and the demoted note is ordered after the other

#### Scenario: Demotion is not exclusion
- **WHEN** a note under a demoted prefix would satisfy a catalog coverage check
- **THEN** it has a catalog entry and the coverage check passes, exactly as for a non-demoted note

#### Scenario: A path declared both ways fails doctor
- **WHEN** configuration lists the same path prefix as both excluded and demoted
- **THEN** `ctxr doctor` reports a failing check naming that path
