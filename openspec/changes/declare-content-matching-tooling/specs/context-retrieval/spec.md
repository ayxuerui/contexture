## MODIFIED Requirements

### Requirement: Content matching is a direct agent leg, not a CLI command
Literal or entity-level content matching SHALL be performed by the agent directly against the store's files, using its own tooling. contexture SHALL NOT provide a CLI command that wraps or duplicates direct content matching. The store's exclusion configuration SHALL be declared once, in `contexture.yaml` (per the context-store capability), in a form an agent can read and apply to its own search without invoking contexture.

A store MAY additionally declare, in `contexture.yaml`, which tool serves this leg — for example a plain recursive matcher such as `ripgrep`, or an indexed searcher such as `qmd`. That declaration exists solely to be read: contexture SHALL NOT invoke it, SHALL NOT require it, SHALL NOT verify that it is installed, and SHALL NOT change any of its own behavior based on it. A store that declares nothing SHALL behave identically to one that does.

#### Scenario: No content-matching command exists
- **WHEN** the CLI's command surface is enumerated
- **THEN** no command performs content matching on the agent's behalf

#### Scenario: Exclusions are usable without invoking contexture
- **WHEN** an agent reads `contexture.yaml` before running its own content-matching search
- **THEN** the declared exclusion path list is present in that single file, in a form the agent can apply directly to its own search

#### Scenario: A declared tool is reported to the agent, never run
- **WHEN** a store declares the tool serving its content-matching leg and an agent consults the store's retrieval guidance
- **THEN** the declared tool is named there, and no contexture command has invoked, validated, or depended on it

#### Scenario: Declaring nothing changes nothing
- **WHEN** a store's `contexture.yaml` declares no content-matching tool
- **THEN** every command behaves exactly as it does for a store that declares one, and the store's configuration still parses
