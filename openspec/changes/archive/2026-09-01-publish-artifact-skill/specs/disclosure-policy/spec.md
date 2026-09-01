## ADDED Requirements

### Requirement: A set of verdicts aggregates to its most restrictive member
Any command that evaluates the tri-state disclosure verdict for more than one note as a single unit
SHALL compute an aggregate verdict by most-restrictive-member ordering — DENY outranks ASK, which
outranks ALLOW — and SHALL exit with the distinct exit code corresponding to that aggregate, using the
same three exit codes the single-note tri-state already defines. This ordering is defined once, here,
for reuse by any such command rather than redefined per caller.

#### Scenario: One DENY among many ALLOWs is the aggregate
- **WHEN** a set of per-note verdicts contains at least one DENY and any number of ALLOW verdicts
- **THEN** the aggregate verdict is DENY

#### Scenario: An ASK among ALLOWs, with no DENY present, is the aggregate
- **WHEN** a set of per-note verdicts contains at least one ASK, no DENY, and any number of ALLOW verdicts
- **THEN** the aggregate verdict is ASK

#### Scenario: All-ALLOW aggregates to ALLOW
- **WHEN** every verdict in a set is ALLOW
- **THEN** the aggregate verdict is ALLOW
