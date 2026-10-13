## ADDED Requirements

### Requirement: The research skill keeps delegated, comparative and deliverable-bound research grounded
The shipped research skill SHALL instruct the agent to:
- tell any agent it delegates a search to that every figure the delegate could not verify against a fetched source is marked as unverified, and keep those marks, with a verification-status note at the top, in anything that reaches the store;
- score open-source options, when the question compares products or tools, on the same axes and at the same depth as commercial ones;
- when the request includes a report or a published page, stop gathering once the sources are mapped, the key claims extracted and the gaps named, and write the synthesis note before building the artifact from it.

These are skill-markdown conventions: nothing inspects a delegate's output for the marks.

#### Scenario: Delegated figures stay marked
- **WHEN** the research skill is rendered
- **THEN** it tells the agent to have a delegate mark every figure it could not verify, and to keep the marks and a verification-status note in anything filed

#### Scenario: Open-source is its own axis
- **WHEN** the research skill is rendered
- **THEN** it tells the agent to score open-source options at the same depth as commercial ones when comparing products or tools

#### Scenario: The synthesis note precedes the artifact
- **WHEN** the research skill is rendered
- **THEN** it tells the agent, when a report or published page is asked for, to write the synthesis note first and build the artifact from it
