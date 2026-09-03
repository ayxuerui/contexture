## REMOVED Requirements

### Requirement: The visibility field's frontmatter key is configurable with a shipped default
**Reason**: The `context-visibility` capability is retired, so there is no field left for this requirement to name. This requirement existed to make renaming the key "a config-default change plus a migration, never a spec or code rewrite" — machinery that has now outlived the field it protected.
**Migration**: `fields.visibility` is removed from `contexture.yaml` by the `drop-access-axes` migration. Notes keep whatever key they already carry, unread (`design.md` D3), so the value is preserved for a P2 model rather than deleted. `openspec/config.yaml`'s three authoring rules binding this key — the provisional-name rule, the one-place rule, and the archive-time literal-key audit — are removed with it.

## MODIFIED Requirements

### Requirement: Note frontmatter schema
A note SHALL be a markdown file whose optional YAML frontmatter may declare, among configured fields: a title and a creation date. A note with no frontmatter SHALL be treated as valid content; contexture SHALL NOT add frontmatter to an existing note without an explicit request to do so.

#### Scenario: Note with no frontmatter is valid
- **WHEN** `contexture lint` scans a note that has no YAML frontmatter block at all
- **THEN** the note is not reported as malformed

#### Scenario: Frontmatter is not silently added
- **WHEN** a contexture write operation (e.g. `rollup write`, `archive`) modifies a note that has no frontmatter
- **THEN** the operation does not introduce a frontmatter block unless the operation's own contract (e.g. ingest, which the context-ingest capability defines) requires one
