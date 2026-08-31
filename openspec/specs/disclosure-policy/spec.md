# disclosure-policy Specification

## Purpose

Governs whether a note's content may be disclosed to an external party in an output an agent is producing — orthogonal to visibility, evaluated per intended use, and defaulting to asking a human rather than failing closed or open.

## Requirements

### Requirement: Ordered walls-before-allows evaluation
`contexture check <note> --audience <audience>` SHALL evaluate, in this fixed order, and SHALL stop at the first rung that produces a verdict: (1) any configured hard wall matching the note or the audience; (2) an explicit audience tag on the note matching the requested audience; (3) an internal-audience rule derived from the note's resolved visibility; (4) if none of the above produced a verdict, the external-audience default. A later rung SHALL NOT override a verdict already produced by an earlier rung.

#### Scenario: A hard wall overrides an explicit audience tag
- **WHEN** a note matches a configured hard wall and separately carries an explicit audience tag that would otherwise allow the requested audience
- **THEN** `check` returns the wall's verdict, and the explicit tag is not consulted

#### Scenario: An explicit tag allows before falling through to the default
- **WHEN** a note carries an explicit audience tag matching the requested audience and no hard wall applies
- **THEN** `check` returns ALLOW without reaching the external-audience default rung

### Requirement: Tri-state verdict with distinct exit codes
`contexture check` SHALL return exactly one of three verdicts — ALLOW, DENY, or ASK — each reported via a distinct, documented exit code, and SHALL print the verdict and the rung that produced it.

#### Scenario: Unmatched external audience defaults to ASK, not DENY or ALLOW
- **WHEN** a note carries no explicit audience tag, no hard wall applies, and the requested audience is external
- **THEN** `check` returns ASK with its own distinct exit code, not silently defaulting to DENY or ALLOW

#### Scenario: Exit codes are distinguishable in a script
- **WHEN** `check` is invoked from a script that branches on exit code
- **THEN** ALLOW, DENY, and ASK each produce a different exit code, documented and stable across versions

### Requirement: External disclosure is never derived from visibility alone
A verdict for an external (non-internal) audience SHALL NOT be produced solely from the note's resolved visibility. An internal-audience verdict (rung 3) MAY be derived from visibility; an external-audience verdict SHALL require an explicit audience tag or a human answer to an ASK.

#### Scenario: Broad internal visibility does not imply external disclosure
- **WHEN** a note's resolved visibility is one that multiple internal contexts can see, and the requested audience is external with no explicit tag
- **THEN** `check` does not return ALLOW on the basis of the visibility alone; it returns ASK
