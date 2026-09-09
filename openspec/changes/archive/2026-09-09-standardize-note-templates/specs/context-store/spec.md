## ADDED Requirements

### Requirement: A note template is a starting shape, never a note
A store SHALL carry note templates — markdown files a note is started from — under a single configured path. A file under that path SHALL NOT be treated as a note by any component: it SHALL be excluded from note enumeration and therefore from every retrieval leg, the catalog's coverage invariant, the graph, and every lint finding computed over notes, on the same footing as the skill pack and the guidance directory. A template SHALL be an ordinary markdown file with no contexture-authored ownership marker in its bytes, because a template's bytes are copied into a note and any marker would be copied with them.

The templates path SHALL be a location contexture owns for the purposes of the write-path gate, so a store running the strict writable-path allowlist can edit its own templates without declaring the path a second time.

#### Scenario: A template is not enumerated as a note
- **WHEN** a store holds a markdown file under its configured templates path and a retrieval leg, the catalog build, or the graph build runs
- **THEN** that file is absent from the result, and the catalog reports no coverage gap for it

#### Scenario: A template carries no ownership marker
- **WHEN** a shipped note template is installed into a store
- **THEN** its bytes contain no contexture-authored ownership header, so a note started from it inherits none

#### Scenario: A strict allowlist still permits editing a store's own templates
- **WHEN** a store declares a writable-path allowlist that does not name the templates path, and a write to a file under that path is evaluated by the path gate
- **THEN** the write is sanctioned, the same as a write to the catalog, the skill pack, or the guidance directory

### Requirement: A note template's placeholder vocabulary
A note template MAY carry placeholders for values known only when a note is started. The vocabulary SHALL be exactly `{{title}}` and `{{date}}`, spelled in double braces, and this requirement is the only place it is enumerated — no other requirement may name a placeholder. No contexture command SHALL expand a placeholder: substitution is the agent's, performed as it starts the note, which is why the form chosen renders literally in a markdown viewer rather than as emphasis.

A store MAY be reported a note that reached it with a placeholder from this vocabulary left unsubstituted. Such a report SHALL be a lint finding, never a doctor failure, and SHALL match only the enumerated vocabulary — text in double braces that is not one of these names SHALL NOT be reported, since a note may legitimately quote another tool's syntax.

#### Scenario: An unsubstituted placeholder is reported by lint
- **WHEN** a note under a taxonomy layer contains the text `{{title}}` and `ctxr lint` runs
- **THEN** the note is reported, and `ctxr doctor` still exits zero for that reason alone

#### Scenario: Foreign double-brace syntax is not reported
- **WHEN** a note contains double-braced text that is not one of the enumerated placeholder names
- **THEN** `ctxr lint` reports nothing for it

#### Scenario: No command expands a placeholder
- **WHEN** any contexture command writes to a note whose body contains an enumerated placeholder
- **THEN** the placeholder is byte-identical afterwards

## MODIFIED Requirements

### Requirement: Tool-owned files default to one home directory
A newly initialized store SHALL place tool-owned files under a single hidden home directory at the store root: authored-but-tool-owned content (the catalog, skill pack, published pages, note templates) in tracked subdirectories, and derived artifacts in a cache subdirectory that is the store's default declared derived path (and therefore gitignored by init's managed block). Every one of these locations SHALL remain individually configurable, and every component SHALL read the location from configuration — a store configured with other paths (including the previous root-level defaults) SHALL keep working without migration. The published-pages and note-template subdirectories, like the catalog and skill pack, SHALL be excluded from every retrieval leg by default, since a published page is authored-but-tool-owned output and a note template is the shape a note starts from — neither is a note.

#### Scenario: A fresh init leaves the root uncontaminated
- **WHEN** `contexture init` runs in a directory
- **THEN** the catalog, skill pack and note templates are created under the home directory's tracked subdirectories, the derived cache subdirectory is the sole default gitignored derived path, and the only new root-level entries are the config file, the canonical entry document, and the home directory itself

#### Scenario: A store with legacy root-level paths keeps working
- **WHEN** a store's configuration declares root-level catalog/skill paths from before this change
- **THEN** every command reads and writes those configured locations unchanged, with no migration required

#### Scenario: The default published-pages path is excluded from retrieval
- **WHEN** a freshly initialized store's default configuration is used unmodified
- **THEN** no retrieval leg (catalog, graph, content matching) surfaces a file under the published-pages subdirectory, the same as for the catalog and skill pack subdirectories

#### Scenario: The default note-template path is excluded from retrieval
- **WHEN** a freshly initialized store's default configuration is used unmodified
- **THEN** no retrieval leg surfaces a file under the note-template subdirectory, and a store that configures the path elsewhere gets the same exclusion at the configured location
