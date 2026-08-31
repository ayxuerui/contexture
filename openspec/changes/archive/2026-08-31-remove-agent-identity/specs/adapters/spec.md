## MODIFIED Requirements

### Requirement: One contract for every adapter kind
An adapter, regardless of kind (harness generation, forge), SHALL be discoverable via a declared registration mechanism, SHALL declare which capability interface(s) it implements and at which version, and SHALL be independently addable, removable, and upgradable without modifying core contexture code.

#### Scenario: Two adapter kinds share the same discovery mechanism
- **WHEN** a harness-generation adapter and a forge adapter are both registered in `contexture.yaml`
- **THEN** both are discovered and validated using the same underlying discovery mechanism, not two separate ones
