## MODIFIED Requirements

### Requirement: A store declares which note templates it installs
Configuration SHALL carry a note-templates path, `templates.path`, and a list of the templates a store installs, `templates.installed`. Both SHALL resolve to a shipped default when absent, so a store predating these keys parses and behaves as if it declared them. An empty list SHALL mean "install none", and SHALL cause `ctxr update` to remove any template contexture previously wrote whose delivered file still matches its recorded hash.

contexture SHALL package a library of note templates and install exactly those a store declares. The library is contexture's offer, not its assertion about what a store is: a store removes what it does not want by editing the list, and adds its own kinds as files the list does not name. This requirement is the only place the packaged library is enumerated; no other requirement may name a template.

A packaged template's content SHALL be fixed markdown, identical for every store that installs it — a template is a file to start a note from, not an artifact rendered per store. It follows that no configuration value appears inside one, and that two stores installing the same template get byte-identical files.

The library SHALL cover, at minimum: a base carrying the frontmatter and top-level heading every note in the store shares — the file a store copies to cut its own kinds — and, built on that base, a template for a synthesized idea carrying the store's relation sections, one for work with a stated end state, and templates for the recurring entities a knowledge store accumulates, at minimum a person and an organization. No command SHALL require a template to exist in order to run.

Every packaged template other than the base SHALL carry, in its frontmatter, a field naming the kind of note it is for, spelled with the template's own name. The base SHALL carry the same field empty, since a note started from it is of no particular kind and the base is the file a store copies to cut its own. No `ctxr` command SHALL read, validate, or select by that field: it records the kind a note was started from so that the agent's own content matching can find every note of a kind, and any further values in it are the store's. The generated entry document SHALL tell the agent, in the same place it names the configured templates path, to keep the field when starting a note and to use it to find notes by kind, and that no command filters by it.

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

#### Scenario: Every template but the base names its kind
- **WHEN** a freshly initialized store's installed templates are read
- **THEN** the base's kind field is empty, and every other template's kind field names exactly that template

#### Scenario: No command acts on the kind field
- **WHEN** a note's kind field is edited, emptied, or removed and any `ctxr` command runs
- **THEN** no finding names the field, and the note's membership and order in every retrieval result, its catalog section, and its graph edges are the same as before the edit
