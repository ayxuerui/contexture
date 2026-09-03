## ADDED Requirements

### Requirement: `init` creates the capture tier and excludes it from retrieval
`ctxr init` SHALL create the configured inbox directory and SHALL seed the configured capture root into the store's retrieval exclusions, so a freshly initialized store has somewhere to capture into and captures are not retrievable from the first commit. Both values SHALL be read from configuration; no component may hardcode either directory name. An existing store SHALL reach the same state through a named migration rather than through operator action, and that migration SHALL adopt the shipped inbox default only where the store's value still sat at the previous shipped default, preserving an operator-chosen value verbatim.

#### Scenario: A fresh store can be captured into
- **WHEN** `ctxr init` completes in an empty directory
- **THEN** the configured inbox directory exists, and the configured capture root is present in the store's retrieval exclusions

#### Scenario: Re-running init changes nothing
- **WHEN** `ctxr init` is run again against a store whose inbox directory already exists and whose exclusions already name the capture root
- **THEN** it reports the store already initialized and writes no duplicate exclusion entry

#### Scenario: An operator-chosen inbox survives migration
- **WHEN** a store whose inbox path was set to something other than the previous shipped default is migrated
- **THEN** its inbox path is left exactly as the operator set it, and only the capture root and the retrieval exclusion are added
