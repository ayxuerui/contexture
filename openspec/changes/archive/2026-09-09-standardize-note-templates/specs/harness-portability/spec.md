## ADDED Requirements

### Requirement: A store declares which note templates it installs
Configuration SHALL carry a note-templates path, `templates.path`, and a list of the templates a store installs, `templates.installed`. Both SHALL resolve to a shipped default when absent, so a store predating these keys parses and behaves as if it declared them. An empty list SHALL mean "install none", and SHALL cause `ctxr update` to remove any template contexture previously wrote whose delivered file still matches its recorded hash.

contexture SHALL package a library of note templates and install exactly those a store declares. The library is contexture's offer, not its assertion about what a store is: a store removes what it does not want by editing the list, and adds its own kinds as files the list does not name. This requirement is the only place the packaged library is enumerated; no other requirement may name a template.

A packaged template's content SHALL be fixed markdown, identical for every store that installs it — a template is a file to start a note from, not an artifact rendered per store. It follows that no configuration value appears inside one, and that two stores installing the same template get byte-identical files.

The library SHALL cover, at minimum: a base carrying the frontmatter and top-level heading every note in the store shares — the file a store copies to cut its own kinds — and, built on that base, a template for a synthesized idea carrying the store's relation sections, one for work with a stated end state, and templates for the recurring entities a knowledge store accumulates, at minimum a person and an organization. No command SHALL require a template to exist in order to run.

#### Scenario: A store predating the configuration keys gets the defaults
- **WHEN** a `contexture.yaml` written before these keys existed is read
- **THEN** it resolves to the shipped path and the shipped installed list, with nothing for the store to run

#### Scenario: Init installs the declared set
- **WHEN** `ctxr init` completes on a store using the default configuration
- **THEN** the configured templates path contains every template the shipped list names, including the base

#### Scenario: An empty list opts out and removes what contexture installed
- **WHEN** a store's configuration declares an empty installed list and `ctxr update` runs
- **THEN** every unmodified template contexture previously wrote is removed, and no command's behavior changes

#### Scenario: Every packaged template builds on the base
- **WHEN** a freshly initialized store's installed templates are read
- **THEN** every one of them carries the base template's frontmatter keys and its top-level heading, and adds only sections of its own

#### Scenario: Two stores get byte-identical templates
- **WHEN** two stores with different configurations install the same packaged template
- **THEN** the delivered files are byte-identical

#### Scenario: No command depends on a template
- **WHEN** every file is removed from a store's templates path and any contexture command runs
- **THEN** the command behaves exactly as it did before, and no check fails for the absence

### Requirement: Installed note templates are refreshed by update
`ctxr init` SHALL write the declared templates to the configured path, and `ctxr update` SHALL bring each one to the installed version. Both SHALL be byte-stable when nothing has changed, and both SHALL leave every other file at that path — the store's own note kinds — untouched.

#### Scenario: Update refreshes a drifted copy and leaves the store's own kinds alone
- **WHEN** an installed template in a store differs from the packaged version, a store-authored template sits alongside it, and `ctxr update` runs
- **THEN** the installed template is rewritten, the store-authored file is byte-identical, and an immediately repeated update reports nothing changed

#### Scenario: A template added to the declared list arrives on update
- **WHEN** a store adds a packaged template's name to its installed list and `ctxr update` runs
- **THEN** that template is written to the configured path, and nothing else at that path changes

### Requirement: An installed note template carries a record that identifies it
Each installed note template SHALL be accompanied by a machine-readable record written by contexture at the templates path, naming each template contexture delivered and a content hash of the delivered file. contexture SHALL treat a file at that path as one it manages if and only if that record names it, so a file the record does not name is store-authored and is never rewritten, removed, or reported as drifted. The record SHALL be the sole ownership mark, because a marker inside a template's bytes would be copied into every note started from it.

#### Scenario: The record accompanies the installed set
- **WHEN** the declared templates are written into a store
- **THEN** the templates path contains a record naming each delivered template and its content hash

#### Scenario: A file the record does not name is left alone
- **WHEN** `ctxr update` runs against a store holding a template at that path that the record does not name
- **THEN** that file is not rewritten, not removed, and not reported as drifted

#### Scenario: A template dropped from the library is removed only when unmodified
- **WHEN** the installed version no longer packages a template the store's record names, and `ctxr update` runs
- **THEN** the file is removed if its hash still matches the record, and otherwise left on disk and reported

### Requirement: A locally modified installed note template is preserved and reported, never overwritten
When an installed note template's delivered file no longer matches the content hash in its record, `ctxr update` SHALL leave that file unchanged and SHALL report the divergence naming the template. When the hash still matches and a fresh render differs, update SHALL rewrite the file and update the record. When the hash matches and a fresh render is identical, update SHALL write nothing.

#### Scenario: An operator's edit survives an update
- **WHEN** an operator edits an installed note template and `ctxr update` runs
- **THEN** the edited file is byte-identical afterwards and the command's output names that template as locally modified

#### Scenario: An unmodified template is refreshed
- **WHEN** a store's installed template still matches its recorded hash and the packaged version renders differently
- **THEN** `ctxr update` rewrites it and updates the record

#### Scenario: A current set makes update a no-op
- **WHEN** `ctxr update` runs twice against a store whose installed templates are current
- **THEN** the second run writes no bytes and reports nothing changed for them

### Requirement: The shipped skills distinguish starting a note from extending one
The rendered placement, ingest-orchestration and session-capture skills SHALL direct the agent to start a new note from a template at the configured templates path and to substitute the placeholder vocabulary as it does so, rather than to infer a shape by imitating sibling notes. For a note that already exists, the same skills SHALL direct the agent to extend it in place — preserving existing content — rather than to restart it from a template. The generated entry document SHALL name the configured templates path, so an agent reaches the templates without reading the CLI.

Choosing which template fits a note SHALL remain the agent's judgment, informed where a directory states its own default in the `README.md` that the baseline conventions already direct an agent to read before working in that directory. No configuration key SHALL bind a template to a taxonomy layer: a layer is a placement axis and holds notes of many kinds, so a per-layer default would be wrong for most of what a layer contains.

#### Scenario: The placement skill names the templates path
- **WHEN** a store's skills are rendered
- **THEN** the placement skill instructs the agent to start from a template at the store's configured templates path, and no rendered skill instructs the agent to infer a new note's shape solely by imitating siblings

#### Scenario: The capture skill splits create from append
- **WHEN** the session-capture skill is rendered
- **THEN** its create path names a template as the starting point and its append path directs the agent to extend the existing note, preserving its content

#### Scenario: A directory's own default is honoured
- **WHEN** a directory's `README.md` states which template notes in it start from
- **THEN** the rendered placement skill directs the agent to that README before choosing, and contexture reads no template binding from configuration

#### Scenario: The entry document names the path
- **WHEN** the entry document is generated for a store
- **THEN** it names the store's configured templates path
