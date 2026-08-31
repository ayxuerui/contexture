## Purpose

Extends the agent-identity capability (see `bootstrap-contexture-core`): the three identity roles resolve to configurable paths, identity files are entry-delimited, and entries are edited by command. Identity remains files — never a harness-specific memory mechanism.

## ADDED Requirements

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
