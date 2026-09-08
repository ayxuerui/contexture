## ADDED Requirements

### Requirement: A skills path sitting on a harness's own branded directory is reported
When the store's configured skills path is identical to a declared harness-generation adapter's own declared skills directory, `ctxr lint` SHALL report it, naming that harness and the cross-harness canonical skills location. No bridge is created for a harness whose directory already equals the configured path, so a harness the store has not declared finds no skills at a branded path — a state the broken-bridge check cannot express, because it skips on exactly that equality.

This SHALL be an observation and SHALL NOT fail a run: a store that configures a branded skills path remains valid, keeps that path, and is never relocated. Where the store itself overrides a declared harness's skills directory to equal the configured skills path, nothing SHALL be reported — the store has chosen to have no bridge for that harness, which is a supported configuration rather than drift.

#### Scenario: A branded canonical path is reported
- **WHEN** a store's configured skills path is identical to the skills directory a declared harness's adapter declares for itself
- **THEN** `ctxr lint` reports it, naming that harness and the cross-harness canonical location, and `ctxr doctor` still passes

#### Scenario: The cross-harness canonical path is not reported
- **WHEN** a store's configured skills path is the cross-harness canonical skills location and a declared harness reads its own branded directory
- **THEN** nothing is reported, and that harness's directory is bridged to the configured path as usual

#### Scenario: A store-declared override is not reported
- **WHEN** a store overrides a declared harness's skills directory so that it equals the store's configured skills path
- **THEN** nothing is reported, because the store declared that this harness needs no bridge
