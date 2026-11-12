## MODIFIED Requirements

### Requirement: Content matching is a direct agent leg, not a CLI command
Literal or entity-level content matching SHALL be performed by the agent directly against the store's files, using its own tooling. contexture SHALL NOT provide a CLI command that wraps or duplicates direct content matching. The store's exclusion configuration SHALL be declared once, in `contexture.yaml` (per the context-store capability), in a form an agent can read and apply to its own search without invoking contexture.

The one exception is a client with no access to the store's files: the remote-access capability's `find` and `Grep` tools MAY perform literal and regular-expression matching on that client's behalf. They SHALL match only notes the store's note enumeration admits, SHALL order by path, and SHALL emit no score or other relevance measure, so they stand in for the client's own leg without becoming a ranker. They are tools of the remote surface, not CLI commands.

#### Scenario: No content-matching command exists
- **WHEN** the CLI's command surface is enumerated
- **THEN** no command performs content matching on the agent's behalf

#### Scenario: Exclusions are usable without invoking contexture
- **WHEN** an agent reads `contexture.yaml` before running its own content-matching search
- **THEN** the declared exclusion path list is present in that single file, in a form the agent can apply directly to its own search

#### Scenario: The remote stand-in ranks nothing
- **WHEN** the remote surface's `find` or `Grep` returns notes matching a text or a pattern
- **THEN** they are ordered by path, no field carries a score, and no excluded note is among them
