## ADDED Requirements

### Requirement: Pending migrations apply in schema-version order
When a store's recorded schema version is more than one version behind the running release, `ctxr migrate` SHALL apply every pending migration in ascending schema-version order, and `ctxr migrate --dry-run` SHALL report them in that same order. A migration SHALL NOT be applied before one that precedes it, and a failure partway through SHALL leave the store at the last schema version whose migration completed, so that a re-run resumes at the correct point rather than reapplying or skipping one.

#### Scenario: Two pending migrations apply in order
- **WHEN** `ctxr migrate` runs against a store two schema versions behind the running release
- **THEN** the older migration is applied first, the newer second, and the recorded schema version afterwards matches the running release

#### Scenario: A dry run enumerates the chain
- **WHEN** `ctxr migrate --dry-run` runs against the same store
- **THEN** the output names both migrations in ascending order and applies neither

#### Scenario: A failure leaves a resumable version
- **WHEN** the second of two pending migrations fails partway
- **THEN** the recorded schema version reflects the first migration's completion, and re-running `ctxr migrate` attempts only the second
