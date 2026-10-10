## ADDED Requirements

### Requirement: Codex and Antigravity are built-in harnesses that read the canonical locations
contexture SHALL ship a built-in harness-generation adapter for Codex, identified as `codex`, and one for Antigravity, identified as `antigravity`, each selectable at `ctxr init` both interactively and through the non-interactive harness option. Each SHALL declare the cross-harness canonical skills location as its skills directory and SHALL declare no entry file, because each harness reads `AGENTS.md` at the store root and discovers skills at that location natively. The `codex` adapter SHALL declare an entry-document read limit of 32,768 bytes and the `antigravity` adapter one of 24,000 bytes, the sizes past which each harness was observed to stop reading. The non-interactive harness option's help text SHALL list every selectable harness, taken from the same list the interactive prompt presents, so neither can name a harness the other omits.

#### Scenario: A store targeting Codex gains no entry file and no bridge
- **WHEN** `ctxr init` runs with the harness option naming `codex`, on a store whose skills path is the cross-harness canonical location
- **THEN** the configuration declares the `codex` adapter, every owned and vendored skill is written to the canonical skills directory, no harness entry file is written, no bridged directory is created, and the command exits successfully

#### Scenario: A store targeting Antigravity gains no entry file and no bridge
- **WHEN** `ctxr init` runs with the harness option naming `antigravity`, on a store whose skills path is the cross-harness canonical location
- **THEN** the configuration declares the `antigravity` adapter, no harness entry file is written, no bridged directory is created, and the command exits successfully

#### Scenario: A store whose skills path is elsewhere bridges the canonical location for them
- **WHEN** a store whose configured skills path is not the cross-harness canonical location declares `codex`
- **THEN** the cross-harness canonical location is bridged to the configured skills path, exactly as for any harness whose directory differs from it

#### Scenario: Every selectable harness is named in the option's help
- **WHEN** an operator reads the help for `ctxr init`
- **THEN** the harness option's description names every harness the interactive prompt offers, including `codex` and `antigravity`

### Requirement: The entry document is checked against each declared harness's read limit
`ctxr lint` SHALL report, for each declared harness that has an effective entry-document read limit, when the store's `AGENTS.md` is larger than that limit, naming the harness, the document's size in bytes, the limit, and the first generated section of `AGENTS.md` that the limit falls inside — the section from which that harness stops reading. This SHALL be an observation and SHALL NOT fail a run: the store's content is valid, and the limit is a property of the harness and of how its operator has configured it, which the store cannot observe. Nothing SHALL be reported for a harness whose limit the document fits within, or for a harness with no effective limit.

#### Scenario: An entry document past a harness's limit is reported
- **WHEN** a store declares `antigravity`, sets no override, and its `AGENTS.md` is 30,000 bytes with the 24,000th byte falling inside the "Store conventions" section
- **THEN** `ctxr lint` reports `antigravity`, a size of 30,000 bytes, a limit of 24,000, and the "Store conventions" section, and `ctxr doctor` still passes

#### Scenario: Each harness is judged against its own limit
- **WHEN** a store declares both `codex` and `antigravity` and its `AGENTS.md` is 28,000 bytes
- **THEN** `ctxr lint` reports `antigravity` and does not report `codex`

#### Scenario: An operator who raised a harness's limit records it and is not reported
- **WHEN** a store's declaration for `codex` overrides its entry-document read limit to 65,536 bytes and `AGENTS.md` is 50,000 bytes
- **THEN** nothing is reported for `codex`

#### Scenario: A harness that reads the whole document is never reported
- **WHEN** a store declares only `claude-code` and its `AGENTS.md` is 100,000 bytes
- **THEN** `ctxr lint` reports nothing about the entry document's size

#### Scenario: A store with no generated entry document is skipped
- **WHEN** a store declares `codex` and its `AGENTS.md` has not been generated
- **THEN** the check reports nothing and is recorded as skipped, naming `ctxr update` as the way to generate it

## MODIFIED Requirements

### Requirement: A skills path sitting on a harness's own branded directory is reported
When the store's configured skills path is identical to a declared harness-generation adapter's own declared skills directory, and that directory is not the cross-harness canonical skills location, `ctxr lint` SHALL report it, naming that harness and the cross-harness canonical skills location. No bridge is created for a harness whose directory already equals the configured path, so a harness the store has not declared finds no skills at a branded path — a state the broken-bridge check cannot express, because it skips on exactly that equality. An adapter that declares the cross-harness canonical location itself reads the location every other harness is bridged to, which is not branded, and SHALL NOT be reported on that account.

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

#### Scenario: A harness that reads the canonical location natively is not reported
- **WHEN** a store's configured skills path is the cross-harness canonical skills location and a declared harness's adapter declares that same location as its own skills directory
- **THEN** nothing is reported for that harness, and no bridge is created for it
