## ADDED Requirements

### Requirement: A harness-generation adapter declares where that harness reads skills
A harness-generation adapter at interface version 2 SHALL declare the store-relative directory the harness it represents reads skills from. Contexture SHALL treat that declaration as the location to bridge to the store's canonical skills directory, and SHALL NOT derive it by inspecting the host machine. A store MAY override an adapter's declared directory in its own adapter declaration, so a harness configured to read a different location — including the canonical one directly, needing no bridge — is expressible without changing the adapter. `adapters.compatibility` SHALL report a configured harness-generation adapter whose interface version is below 2, and the commands that write skills SHALL refuse to run it per the existing version-mismatch rule rather than guessing a directory for it.

#### Scenario: The declared directory is what gets bridged
- **WHEN** a store declares a harness-generation adapter whose declared skills directory differs from the configured skills path
- **THEN** that directory is bridged to the configured skills path, taken verbatim from the adapter's declaration

#### Scenario: A store overrides an adapter's directory
- **WHEN** a store's adapter declaration names its own skills directory for that harness
- **THEN** the store's value is used instead of the adapter's default, and a value equal to the configured skills path results in no bridge being created

#### Scenario: A stale harness adapter is reported
- **WHEN** a configured harness-generation adapter declares interface version 1
- **THEN** `doctor` reports an `adapters.compatibility` finding naming it, before any command relies on it for a skills directory

### Requirement: Generating a harness entry file is optional at interface version 2
A harness-generation adapter at interface version 2 SHALL be permitted to declare no entry file and no entry-file rendering, so a harness that reads the canonical entry document directly can be expressed without inventing a redundant wrapper file for it. Contexture SHALL generate an entry file for exactly those adapters that declare one, and the absence of a declaration SHALL NOT be treated as an error or a degraded configuration.

#### Scenario: A skills-only adapter writes no entry file
- **WHEN** a store declares a harness-generation adapter that declares a skills directory but no entry file
- **THEN** no harness entry file is generated for it, no error is reported, and its skills directory still receives every skill

#### Scenario: An adapter that declares an entry file still gets one
- **WHEN** a store declares a harness-generation adapter that declares an entry file
- **THEN** that file is generated exactly as before this change
