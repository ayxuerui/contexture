## ADDED Requirements

### Requirement: A shipped taxonomy profile may declare its own archive destination
A shipped taxonomy profile SHALL be able to declare the archive destination that suits its layers, and `init` SHALL seed `organize.archive_destination` from the resolved profile's declaration. A profile that declares none, and a custom taxonomy definition, SHALL fall back to the shipped default. The declaration SHALL live with the profile definitions, so no other component learns a shipped layer name.

#### Scenario: A profile with a retirement layer seeds its own destination
- **WHEN** a store is initialized with a profile whose layers include a retirement layer and which declares an archive destination
- **THEN** the store's `organize.archive_destination` is that destination, not the shipped fallback

#### Scenario: A profile without one falls back
- **WHEN** a store is initialized with a profile that declares no archive destination, or with a custom taxonomy definition
- **THEN** the store's `organize.archive_destination` is the shipped fallback
