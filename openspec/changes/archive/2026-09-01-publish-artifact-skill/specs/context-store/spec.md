## MODIFIED Requirements

### Requirement: Tool-owned files default to one home directory
A newly initialized store SHALL place tool-owned files under a single hidden home directory at the store root: authored-but-tool-owned content (the catalog, skill pack, published pages) in tracked subdirectories, and derived artifacts in a cache subdirectory that is the store's default declared derived path (and therefore gitignored by init's managed block). Every one of these locations SHALL remain individually configurable, and every component SHALL read the location from configuration — a store configured with other paths (including the previous root-level defaults) SHALL keep working without migration. The published-pages subdirectory, like the catalog and skill pack, SHALL be excluded from every retrieval leg by default, since a published page is authored-but-tool-owned output, never a note.

#### Scenario: A fresh init leaves the root uncontaminated
- **WHEN** `contexture init` runs in a directory
- **THEN** the catalog and skill pack are created under the home directory's tracked subdirectories, the derived cache subdirectory is the sole default gitignored derived path, and the only new root-level entries are the config file, the canonical entry document, and the home directory itself

#### Scenario: A store with legacy root-level paths keeps working
- **WHEN** a store's configuration declares root-level catalog/skill paths from before this change
- **THEN** every command reads and writes those configured locations unchanged, with no migration required

#### Scenario: The default published-pages path is excluded from retrieval
- **WHEN** a freshly initialized store's default configuration is used unmodified
- **THEN** no retrieval leg (catalog, graph, content matching) surfaces a file under the published-pages subdirectory, the same as for the catalog and skill pack subdirectories
