## ADDED Requirements

### Requirement: Catalog sections carry a retrieval tier
Each catalog section SHALL record a retrieval tier, declared in configuration with a shipped default applied to any section that declares none. A leg that returns an ordered list of catalog entries SHALL order entries from higher-tier sections before entries from lower-tier ones, and SHALL preserve its existing ordering within a tier. A tier SHALL NOT remove an entry from the catalog or from any coverage check.

#### Scenario: Sections order by tier
- **WHEN** an ordered catalog read spans a section declared at a higher tier and one declared at a lower tier
- **THEN** entries from the higher-tier section appear before entries from the lower-tier section

#### Scenario: An undeclared section takes the shipped default
- **WHEN** a section declares no tier
- **THEN** it is ordered at the shipped default tier rather than being ordered last or omitted

#### Scenario: A tier never hides an entry
- **WHEN** a section is declared at the lowest available tier
- **THEN** its entries still appear in `catalog show` and still satisfy the catalog coverage check
