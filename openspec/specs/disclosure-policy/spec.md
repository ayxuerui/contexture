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

### Requirement: The internal-audience rung consults the context mapping
When `contexture check` reaches the internal-audience rung (rung 3), it SHALL return ALLOW when the note's resolved visibility is a member of the requesting internal audience's configured visible-values list (identity default when unconfigured), and DENY otherwise. It SHALL NOT require raw equality between the resolved visibility and the audience name.

#### Scenario: A shared visibility value allows multiple internal audiences
- **WHEN** internal audiences `ctx-a` and `ctx-b` are each configured to see the value `ctx-shared`, and a note's resolved visibility is `ctx-shared`, and no hard wall or explicit tag applies
- **THEN** `check --audience ctx-a` and `check --audience ctx-b` each return ALLOW at the internal-audience rung

### Requirement: Hard walls may ask, match every audience, and exempt audiences
A hard-wall rule SHALL support a verdict of ASK in addition to ALLOW and DENY, reported via the same distinct exit code as every other ASK verdict. A rule MAY declare that it matches every audience rather than one named audience, and MAY declare a list of exempted audiences the rule does not apply to. Walls remain evaluated before every other rung, first match wins, exactly as already required.

#### Scenario: A wall asks for every audience except one
- **WHEN** a wall on a note's path matches every audience, exempts `ctx-a`, and carries the ASK verdict
- **THEN** `check --audience ctx-b` against that note returns ASK with the wall as the deciding rung, while `check --audience ctx-a` proceeds past the wall to the later rungs

#### Scenario: An ASK wall short-circuits an explicit tag
- **WHEN** a note under an ASK wall also carries an explicit audience tag matching the requested (non-exempt) audience
- **THEN** `check` returns ASK — the wall's verdict — and the explicit tag is not consulted

### Requirement: A leak scan uses markers and the context mapping
Configuration MAY map a context to marker patterns. `ctxr lint` SHALL report a finding for every marker match whose context cannot see the containing note under the configured context mapping, naming the note, the context, and the matched text; `ctxr check <note> --scan` SHALL report the same findings for one note. With no markers configured the check SHALL produce no findings.

#### Scenario: A marker leaks across the wall
- **WHEN** a marker for `ctx-b` matches inside a note whose resolved visibility is visible only to `ctx-a`
- **THEN** lint reports a leak finding for that note naming `ctx-b`

#### Scenario: A marker inside its own context is not a leak
- **WHEN** the same marker matches inside a note that `ctx-b` can see
- **THEN** no finding is reported

#### Scenario: No markers, no findings
- **WHEN** the configuration declares no markers
- **THEN** lint reports no leak findings for any note

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
