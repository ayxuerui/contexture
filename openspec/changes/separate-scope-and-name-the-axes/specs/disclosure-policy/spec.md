## MODIFIED Requirements

### Requirement: Ordered walls-before-allows evaluation
`contexture check <note> --audience <audience>` SHALL evaluate, in this fixed order, and SHALL stop at the first rung that produces a verdict: (1) any configured hard wall matching the note or the audience; (2) an explicit tag in the note's disclosure field matching the requested audience; (3) an internal-audience rule derived from the note's resolved visibility; (4) if none of the above produced a verdict, the external-audience default. A later rung SHALL NOT override a verdict already produced by an earlier rung. The frontmatter key read at rung 2 SHALL be the disclosure field defined by `context-store`, read from configuration rather than fixed by this capability.

#### Scenario: A hard wall overrides an explicit audience tag
- **WHEN** a note matches a configured hard wall and separately carries an explicit disclosure tag that would otherwise allow the requested audience
- **THEN** `check` returns the wall's verdict, and the explicit tag is not consulted

#### Scenario: An explicit tag allows before falling through to the default
- **WHEN** a note carries an explicit disclosure tag matching the requested audience and no hard wall applies
- **THEN** `check` returns ALLOW without reaching the external-audience default rung

#### Scenario: The tag is read from the configured key
- **WHEN** a store configures a disclosure field key other than the shipped default and a note carries its tag under that key
- **THEN** rung 2 consults that key, and a tag written under the shipped default key is not consulted
