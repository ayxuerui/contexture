## MODIFIED Requirements

### Requirement: A config key `StoreConfigSchema` doesn't recognize fails doctor by name
Because the store config schema is loose (`.passthrough()`, so a later package version's additive field never fails an existing store's configuration load), a key the schema doesn't declare would otherwise pass config loading silently. `doctor` SHALL fail this gap closed: it SHALL compare the loaded config's top-level keys against the schema's declared shape and fail, naming every key that isn't declared — whether from a schema version this old, a typo, or a capability retired in a later release.

#### Scenario: A retired capability's config key survives an upgrade
- **WHEN** `contexture.yaml` still declares a top-level key from a capability a later contexture version removed (for example, `identity`, retired when identity/memory moved to the harness)
- **THEN** `contexture doctor` fails, naming that key, rather than loading it silently and passing

#### Scenario: A config with only recognized top-level keys passes
- **WHEN** every top-level key in `contexture.yaml` is one `StoreConfigSchema` currently declares
- **THEN** this check passes
