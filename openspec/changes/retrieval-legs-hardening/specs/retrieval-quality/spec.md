## Purpose

Measures whether the store's retrieval legs find what exists and withhold what they must, so that the no-ranker design is evaluated against evidence rather than asserted. Provides a fixture corpus with known-correct answers, the metrics computed over it, and which of those metrics fail a run rather than merely reporting.

## ADDED Requirements

### Requirement: A fixture corpus carries gold annotations
The store's test material SHALL include a fixture corpus in which each query fixture declares the set of notes a correct retrieval would return, and each note's visibility and scope are declared. The corpus SHALL be version-controlled alongside the specifications it exercises, and adding a fixture SHALL require no change to the evaluation mechanism.

#### Scenario: A fixture declares its own expected result
- **WHEN** the evaluation runs over the fixture corpus
- **THEN** each query fixture's expected note set is read from the fixture itself, not from a separately maintained answer key that could drift from it

#### Scenario: Adding a fixture requires no code change
- **WHEN** a new query fixture and its expected note set are added to the corpus
- **THEN** the next evaluation run includes it without any change to the evaluation command

### Requirement: A recall-miss is measured and reported
The evaluation SHALL compute, over the fixture corpus, the proportion of query fixtures for which a note in the fixture's expected set was returned by no retrieval leg. It SHALL report the rate and SHALL name each missed note and the fixture that expected it, so a miss is actionable rather than a number.

#### Scenario: A miss is named, not just counted
- **WHEN** a fixture expects a note that no leg returns
- **THEN** the report names that note and that fixture, and the recall-miss rate reflects it

#### Scenario: Full recall reports zero
- **WHEN** every fixture's expected notes are returned by at least one leg
- **THEN** the reported recall-miss rate is zero and no note is named

### Requirement: A leak gates at zero
The evaluation SHALL compute the number of results in which a note surfaced to a requesting context whose configured visible values do not include that note's resolved visibility, or to a request that did not name a scope the note's isolating scope requires. The evaluation command SHALL exit non-zero if this count is greater than zero, naming each offending note, context, and leg. Unlike the recall-miss rate, this count SHALL NOT be reportable as an acceptable non-zero baseline.

#### Scenario: A single leak fails the run
- **WHEN** any leg returns a note to a context that cannot see its resolved visibility
- **THEN** the evaluation exits non-zero, naming the note, the context, and the leg

#### Scenario: A clean run exits zero
- **WHEN** no leg returns a note outside the requesting context's visible values or outside the requested scope
- **THEN** the leak count is zero and the evaluation exits zero on that metric

### Requirement: Baselines are committed and compared
The evaluation SHALL write its metrics to a version-controlled baseline file in a stable, diff-readable form carrying no timestamp, and SHALL compare a run against the committed baseline. A run whose recall-miss rate is worse than the baseline SHALL exit non-zero naming the regression; a run that improves it SHALL report the improvement and leave the baseline for a human to update deliberately.

#### Scenario: A regression is caught as a diff
- **WHEN** a change worsens the recall-miss rate against the committed baseline
- **THEN** the evaluation exits non-zero naming the metric, the baseline value, and the new value

#### Scenario: The baseline is byte-stable
- **WHEN** the evaluation runs twice against an unchanged store and corpus
- **THEN** the two baseline outputs are byte-identical

#### Scenario: An improvement does not silently move the goalposts
- **WHEN** a run improves the recall-miss rate
- **THEN** the run reports the improvement and the committed baseline file is unchanged until a human updates it
