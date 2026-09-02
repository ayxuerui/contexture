## ADDED Requirements

### Requirement: Rollup gathers only what the entity can see
`ctxr rollup gather <entity>` SHALL exclude, from the source set it returns, every note whose resolved visibility the entity note's own resolved visibility cannot see, and SHALL apply that exclusion before returning the set rather than leaving it to the caller. The entity note SHALL supply the requesting context; the command SHALL NOT accept a caller-supplied context for this purpose. Where the entity's own visibility cannot be resolved, the command SHALL return no sources rather than all of them.

#### Scenario: A source outside the entity's visibility is not gathered
- **WHEN** `ctxr rollup gather <entity>` runs and a note linking to that entity has a resolved visibility the entity's own resolved visibility cannot see
- **THEN** that note is absent from the returned source set, and its content is never presented for synthesis

#### Scenario: A source the entity can see is gathered
- **WHEN** a note linking to the entity has a resolved visibility the entity's resolved visibility can see
- **THEN** that note is present in the returned source set

#### Scenario: An unresolvable entity visibility gathers nothing
- **WHEN** `ctxr rollup gather <entity>` runs against an entity whose own visibility cannot be resolved
- **THEN** the command returns no sources, rather than treating the entity as able to see everything
