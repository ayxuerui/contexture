## MODIFIED Requirements

### Requirement: Placement is driven by configured taxonomy, not a hardcoded layout
The store's placement skill SHALL determine a new note's layer and folder using the taxonomy declared in `contexture.yaml` — its set of top-level layers and their declared defaults — and SHALL NOT assume any specific named layout is present.

#### Scenario: Placement works under a non-default taxonomy
- **WHEN** a store's `contexture.yaml` declares a taxonomy other than the shipped default profile
- **THEN** the placement skill's decision steps still resolve to a valid layer and folder within that configured taxonomy
