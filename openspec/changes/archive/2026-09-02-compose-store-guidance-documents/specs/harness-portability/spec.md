## ADDED Requirements

### Requirement: A shipped baseline convention is delivered into the guidance directory and refreshed by update
A store SHALL carry a contexture-owned baseline convention file at a fixed filename under the configured guidance directory, rendered from the store's own configuration (the visibility field and its resolution order, configured directory defaults, the disclosure ladder, the configured relation vocabulary, archiving, git and session rules, directory-scoped convention discovery) — never a shipped profile's or one deployment's names. `init` SHALL write it; the update command SHALL rewrite it to match a fresh render whenever the template or the store's configuration changed, and SHALL leave every other file in the guidance directory (including the operator's own) untouched. Both SHALL be byte-stable when nothing has changed. The file SHALL be discoverable by the same mechanism that scans and inlines every other convention document into the generated entry document, requiring no composition step of its own.

#### Scenario: A fresh init delivers the baseline convention
- **WHEN** `contexture init` runs
- **THEN** the configured guidance path contains the baseline convention file, and it is inlined into the generated entry document's conventions section alongside any other file present

#### Scenario: A configuration change refreshes the baseline convention on update
- **WHEN** a store's configuration changes in a way that affects the baseline convention's rendered content (for example, a new hard wall) and the update command runs
- **THEN** the baseline convention file is rewritten to reflect the change, and the entry document's conventions section reflects it after regeneration

#### Scenario: A second update with nothing changed is a no-op
- **WHEN** the update command runs twice in a row with no configuration or template change between runs
- **THEN** the second run reports no change to the baseline convention file

### Requirement: An operator convention file is seeded with prompts only
`init` SHALL seed one operator-authored convention file in the guidance directory, containing heading prompts for content specific to the store (placement distinctions, content style, tag vocabulary, store context) and no invented content. Once the file exists, it SHALL never be rewritten by `init` or the update command.

#### Scenario: The seed is not overwritten on a later init or update
- **WHEN** an operator has edited the seeded convention file and `init` or the update command runs again
- **THEN** the file's content is unchanged

### Requirement: A size budget with defined behavior at the limit
The entry document's inlined conventions section SHALL have a configured maximum size (`harness.convention_max_bytes`, defaulting to a shipped constant) in `contexture.yaml`. `contexture doctor` SHALL fail when the section's rendered size exceeds that maximum, naming the current size and the configured budget.

#### Scenario: An oversized conventions section fails doctor
- **WHEN** the entry document's inlined conventions section's rendered size exceeds its configured maximum
- **THEN** `contexture doctor` reports a failing check naming the current size and the configured budget

#### Scenario: A store with no override uses the shipped default
- **WHEN** a store's `contexture.yaml` declares no `harness.convention_max_bytes`
- **THEN** the check measures the section against the shipped default budget
