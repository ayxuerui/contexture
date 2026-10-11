## ADDED Requirements

### Requirement: The shipped skills carry the operating guidance every store would otherwise restate
Guidance that holds for any store SHALL ship in contexture's owned skills and generated sections, not be left to each store's conventions:

- **The submit skill** SHALL name the routes a pull request takes and instruct the agent to state which one it took and why:
  - a session pull request (the session's work plus its approved capture);
  - an own pull request (a new skill, a structural or entry-document change, a large refactor);
  - a housekeeping pull request (batched small appends, never folded into unrelated work).

  It SHALL instruct the agent, during its re-scan, to check for stale rollups on the entities the session touched and to offer the rollup skill without running it unasked. It SHALL state that the pull-request body answers why, what changed, the route, verification, and follow-ups.
- **The second-opinion skill** SHALL state that a critique is required before implementing a change that is architectural, irreversible, or touches a confidentiality boundary, run before the work rather than after it. It SHALL state that the verdict lands in the pull-request body, which with its commit is the decision record, with no separate governance step.
- **The derived-artifacts skill** SHALL state:
  - that a flagged gloss is confirmed by reviewing it and stripping its frozen hash marker once, so the next catalog build stamps a fresh one, and that editing the gloss alone does not clear the finding;
  - that the graph is a per-checkout cache built at the point of use when `ctxr doctor` reports it stale, never on a schedule.
- **The entry document's retrieval section** SHALL state what to do when a literal search finds nothing: use the vocabulary the note would use, expand acronyms, and walk the graph from the nearest note found.

#### Scenario: Submit names its routes and the body's questions
- **WHEN** the submit skill is rendered for any store
- **THEN** it names the session, own, and housekeeping routes, tells the agent to state its route, and names why, what changed, route, verification, and follow-ups as the questions the body answers

#### Scenario: Submit checks rollups without running them
- **WHEN** the submit skill's re-scan step is read
- **THEN** it instructs `ctxr rollup stale` for the entities the session touched and offering `ctxr-rollup`, and forbids running a rollup unasked

#### Scenario: A critique is required before an irreversible change
- **WHEN** the second-opinion skill is rendered
- **THEN** it states that a critique is required before an architectural, irreversible, or confidentiality-boundary change and that the verdict lands in the pull-request body

#### Scenario: Confirming a stale gloss is documented
- **WHEN** the derived-artifacts skill is rendered
- **THEN** it states that a flagged gloss is confirmed by stripping its hash marker once and rebuilding, that editing the gloss alone does not clear the finding, and that the graph is built at the point of use rather than on a schedule

#### Scenario: Retrieval names its fallback for a search that finds nothing
- **WHEN** the entry document's retrieval section is generated
- **THEN** it tells the agent to retry with the note's own vocabulary, expand acronyms, and walk the graph from the nearest note found
