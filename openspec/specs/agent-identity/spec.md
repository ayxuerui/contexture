# agent-identity Specification

## Purpose

Provides a place for durable context an agent should carry into every session — its posture, durable facts about the world, durable facts about the user — kept distinct from retrievable knowledge and injected into each harness by an adapter rather than baked into the store's retrieval path.

## Requirements

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

### Requirement: The canonical entry document references identity
The generated portion of `AGENTS.md` SHALL include a section that names the store's identity files (at their configured location) and instructs an agent to load them at session start. The section SHALL reference the files by path, not inline their content, and SHALL be regenerated when the configured identity path changes.

#### Scenario: A harness with no adapter still discovers identity
- **WHEN** an agent harness with no identity-injection adapter reads only `AGENTS.md` at a store's root
- **THEN** it finds the identity files' paths and the instruction to load them at session start, without any harness-specific mechanism

#### Scenario: Identity content is not duplicated into the entry document
- **WHEN** the identity section of `AGENTS.md` is generated
- **THEN** it contains file references and the load instruction only — editing an identity file requires no regeneration of `AGENTS.md`

### Requirement: Identity roles resolve to configurable paths
Configuration MAY bind each identity role (posture, world facts, user facts) to a store-relative path; an unbound role SHALL resolve to its canonical file under the configured identity directory. Every operation that reads, creates, injects, indexes, or edits identity SHALL use the resolved path, and the retrieval-exclusion invariant SHALL be checked against each resolved path rather than the identity directory alone.

#### Scenario: Default binding preserves today's layout
- **WHEN** a store declares no identity file bindings
- **THEN** the three roles resolve to their canonical files under the identity directory, identically to a store created before this capability

#### Scenario: A role bound outside the identity directory
- **WHEN** a store binds the world-facts role to a path under a directory its runtime links into
- **THEN** initialization ensures that file there, identity injection reads it from there, and the exclusion invariant fails if that path is retrievable

### Requirement: Identity files are edited as entries
An identity file SHALL be treated as a sequence of entries separated by a configured delimiter line (default: an empty line). `ctxr identity add --file <role>` SHALL append an entry; `ctxr identity replace --file <role> --match <text>` and `ctxr identity remove --file <role> --match <text>` SHALL act on the single entry containing the match and SHALL refuse, writing nothing, when zero or more than one entry matches.

#### Scenario: Add appends an entry
- **WHEN** `identity add` runs against a file with two entries
- **THEN** the file has three entries and the first two are byte-identical

#### Scenario: Ambiguous replace refuses
- **WHEN** two entries contain the match text
- **THEN** the command exits with a distinct error and the file is unchanged

#### Scenario: A custom delimiter
- **WHEN** a store configures a non-blank delimiter line and its file uses it
- **THEN** add, replace, and remove operate on the entries that delimiter defines
