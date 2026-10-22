## MODIFIED Requirements

### Requirement: The capture tier is retained and excluded from retrieval
Captures SHALL live under a configured capture root, within which a configured inbox path holds material that has not yet been ingested. The capture root SHALL be seeded into the store's retrieval exclusions, so no file beneath it is a note: it is returned by no retrieval leg, takes no catalog entry, and contributes no graph node. The capture root SHALL be tracked in version control and SHALL NOT be declared a derived path — a retained capture is provenance, not regenerable output.

The one exception is the remote-access capability's `find` tool, which SHALL list matching captures in a field of its own, apart from notes and labelled as unfiled, so that a member without file access can learn whether material is already captured — the same search the capture procedure asks a local agent to run before writing. The remote surface's `Read` MAY likewise return a capture its caller names by path, marked as a capture; naming a file is not retrieving it. A capture listed or read there SHALL remain no note: it SHALL NOT be returned among `find`'s notes, SHALL NOT seed or appear in the retrieval pass, and SHALL take no catalog entry and no graph node.

#### Scenario: A capture is not a note
- **WHEN** a markdown file sits under the configured capture root
- **THEN** listing the store's notes does not return it, `catalog check` does not report it as missing an entry, and the graph contains no node for it

#### Scenario: The capture tier is tracked, not ignored
- **WHEN** a store is initialized
- **THEN** the configured capture root appears in neither the store's derived-path declaration nor any generated ignore region, so captures are committed with the notes that cite them

#### Scenario: An unfiled capture is visible to the remote lookup but stays no note
- **WHEN** a capture sits under the inbox path and the remote surface's `find` matches its text
- **THEN** it is listed in `find`'s unfiled field only, and the retrieval pass refuses it as a seed
