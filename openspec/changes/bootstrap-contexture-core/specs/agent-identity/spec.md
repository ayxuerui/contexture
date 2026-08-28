## Purpose

Provides a place for durable context an agent should carry into every session — its posture, durable facts about the world, durable facts about the user — kept distinct from retrievable knowledge and injected into each harness by an adapter rather than baked into the store's retrieval path.

## ADDED Requirements

### Requirement: Identity content is excluded from retrieval
Identity files (agent posture and durable memory) SHALL live under a path declared in the store's retrieval exclusion configuration. No CLI-computed retrieval leg (catalog or graph) SHALL surface identity content as a result.

#### Scenario: Identity content does not appear in the catalog or graph
- **WHEN** `catalog build` or `graph build` runs over a store containing identity files
- **THEN** neither the catalog nor the graph contains an entry or node for those files

### Requirement: Identity content is portable; wire format is harness-owned
The store SHALL keep identity content in a documented, harness-neutral form. A given harness MAY require its own serialization (format, size limits, delimiters) for how it consumes that content; such a harness-specific format SHALL be treated as owned by that harness's adapter, not as a property of the store's canonical identity content.

#### Scenario: The same identity content serves two harnesses
- **WHEN** two different harness adapters each generate their own injected representation from the same canonical identity files
- **THEN** both representations carry the same underlying facts, even though their serialized forms differ

### Requirement: Injection is performed by adapters
Delivering identity content into a running agent's context SHALL be the responsibility of a harness adapter (per the adapters capability), not of core contexture retrieval or CLI commands. Core SHALL provide the canonical identity files and SHALL NOT itself inject them into any particular harness's runtime.

#### Scenario: No harness-specific injection code in core
- **WHEN** `contexture adapters generate` is run for a given harness
- **THEN** the harness-specific injection mechanism (a symlink, a config entry, or equivalent) is produced by that harness's adapter, and removing the adapter removes the injection mechanism without touching the canonical identity files
