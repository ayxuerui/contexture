## ADDED Requirements

### Requirement: A shipped note template is refreshed unconditionally
`ctxr update` SHALL rewrite every installed note template whose name the packaged library uses, to the packaged version, regardless of any local edit. A shipped template is contexture's: it is a starting shape rather than content, so an edit to one is not operator work to be preserved but a divergence from the shape every store is meant to share. Update SHALL be byte-stable — a template already matching the packaged version SHALL not be rewritten — and that determination SHALL be made by comparing the file to the bytes it should have, requiring no stored hash.

A store wanting a variant SHALL keep it under a name the packaged library does not use, which contexture never reads, rewrites, or removes. That is the supported way to hold a house shape, and the only one.

#### Scenario: A local edit does not survive an update
- **WHEN** an operator edits an installed note template and `ctxr update` runs
- **THEN** the file is restored to the packaged version, and no finding reports it as locally modified

#### Scenario: A current set makes update a no-op
- **WHEN** `ctxr update` runs twice against a store whose installed templates are current
- **THEN** the second run writes no bytes and reports nothing changed for them

#### Scenario: A store's own kind is untouched
- **WHEN** a store keeps a template at the templates path under a name the packaged library does not use, and `ctxr update` runs
- **THEN** that file is byte-identical afterwards, and is neither removed nor reported

## MODIFIED Requirements

### Requirement: An installed note template carries a record that identifies it
Each installed note template SHALL be accompanied by a machine-readable record written by contexture at the templates path, naming every template contexture delivered. The record exists so a template can be removed when the store stops declaring it, or when the packaged library stops carrying it — nothing else remembers that a given file was contexture's. It SHALL NOT record a content hash: ownership follows the packaged library's names rather than a file's contents, and byte-stability is decided by comparing the file to the bytes it should have.

A file at the templates path whose name the packaged library does not use SHALL be treated as store-authored: never read, rewritten, removed, or reported.

#### Scenario: The record accompanies the installed set
- **WHEN** the declared templates are written into a store
- **THEN** the templates path contains a record naming each delivered template

#### Scenario: A file the record does not name is left alone
- **WHEN** `ctxr update` runs against a store holding a template at that path under a name the packaged library does not use
- **THEN** that file is not rewritten, not removed, and not reported as drifted

#### Scenario: A template dropped from the library is removed only when unmodified
- **WHEN** the installed version no longer packages a template the store's record names, and `ctxr update` runs
- **THEN** the file is removed, whether or not it was edited locally — a shipped template carries nothing an operator is entitled to keep, and leaving an edited copy of a retired template behind would leave a name contexture no longer explains

## REMOVED Requirements

### Requirement: A locally modified installed note template is preserved and reported, never overwritten
**Reason**: The contract was borrowed from vendored skills, where it holds for a reason that does not apply here — contexture may not modify a file it did not author. contexture authors every shipped note template, and a template is a starting shape rather than content, so there is no operator work inside one to preserve. What the requirement produced instead was a store that silently stopped receiving improvements to any template it had once touched, and a `doctor` finding that turns every future fix into a divergence report.

**Migration**: Replaced by "A shipped note template is refreshed unconditionally", above. A store holding an edited shipped template has that edit overwritten on its next `ctxr update`; to keep the variant, copy it to a name the packaged library does not use, which contexture never touches. The `templates.locally_modified` finding is removed with the requirement.
