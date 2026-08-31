## Purpose

Extends the disclosure-policy capability (see `bootstrap-contexture-core`): the internal-audience rung consults the same context→visible-values mapping context-visibility defines, and hard-wall rules gain the expressiveness the proven walls-before-allows ladder needs.

## ADDED Requirements

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
