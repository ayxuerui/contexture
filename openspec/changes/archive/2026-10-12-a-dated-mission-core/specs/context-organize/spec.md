## ADDED Requirements

### Requirement: Lint reports a stale or past-due mission
`ctxr lint`'s rollup-staleness observation SHALL apply the mission rule (elapsed time since the recorded rollup timestamp exceeding `organize.rollup_stale_days`, or no timestamp at all) to the configured mission document, as `ctxr rollup stale` already does, so every lint run surfaces a stale mission rather than only an explicit staleness query. `ctxr lint` SHALL also report, as an observation, every date in the mission document's body that follows the word "due" (case-insensitively) and is earlier than the current date, naming the date and the line it appears on.

#### Scenario: Lint names a stale mission
- **WHEN** the configured mission document's recorded rollup timestamp is 18 days old and `organize.rollup_stale_days` is 7
- **THEN** `ctxr lint` reports the mission document as stale

#### Scenario: Lint names a past-due action in the mission
- **WHEN** the mission document's body contains "Due: 2026-09-18" and the current date is 2026-10-11
- **THEN** `ctxr lint` reports 2026-09-18 as past due, naming the line, and `ctxr doctor` still passes

#### Scenario: Future dates are not reported
- **WHEN** the mission document's body contains "due 2026-10-28" and the current date is 2026-10-11
- **THEN** no past-due finding is reported for that date
