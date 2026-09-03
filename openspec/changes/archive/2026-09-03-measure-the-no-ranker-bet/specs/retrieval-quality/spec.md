## Purpose

Measures whether the store's retrieval legs return what its own structure makes reachable and withhold what its configuration excludes, so that the decision to ship no ranker is evaluated against evidence rather than asserted. Provides a fixture corpus with known-correct answers, the metrics computed over it, and which of those metrics fail a run rather than merely reporting.

## ADDED Requirements

### Requirement: A fixture corpus carries gold annotations
The project's test material SHALL include a fixture corpus in which each query fixture declares the entry selector and hop budget a correct retrieval would use, the set of notes a correct retrieval would return, and the vocabulary a reader looking for that set would plausibly search by. The corpus SHALL be version-controlled alongside the specifications it exercises, and adding a fixture SHALL require no change to the evaluation mechanism.

#### Scenario: A fixture declares its own expected result
- **WHEN** the evaluation runs over the fixture corpus
- **THEN** each fixture's entry selector, hop budget and expected note set are read from the fixture itself, not from a separately maintained answer key that could drift from it

#### Scenario: A fixture declares the vocabulary a reader would search by
- **WHEN** a fixture is read
- **THEN** it carries the terms a reader looking for its expected notes would plausibly use, so gloss coverage can be computed against something other than the notes' own wording

#### Scenario: Adding a fixture requires no code change
- **WHEN** a new fixture and its expected note set are added to the corpus
- **THEN** the next evaluation run includes it without any change to the evaluation mechanism

### Requirement: Enumeration-seam respect gates at zero
The evaluation SHALL compute the number of results, across every retrieval leg contexture computes, naming a note the store's own note enumeration does not admit. It SHALL exit non-zero if that count is greater than zero, naming each offending note and the leg that returned it. This count SHALL NOT be recordable as an acceptable non-zero baseline. The evaluation SHALL additionally assert, independently of the corpus, that only an enumerated set of modules reads notes from the filesystem, so a leg added later that bypasses the enumeration fails without waiting for a fixture that covers it.

#### Scenario: A single escaped note fails the run
- **WHEN** any leg returns a note the store's enumeration does not admit
- **THEN** the evaluation exits non-zero, naming the note and the leg

#### Scenario: A module reading notes outside the enumerated set fails the run
- **WHEN** a module not on the enumerated list reads notes from the filesystem
- **THEN** the evaluation exits non-zero naming that module, whether or not any fixture exercises it

#### Scenario: The gate has something to catch
- **WHEN** the fixture corpus is validated
- **THEN** it contains at least one note the exclusion configuration withholds, so a leg that stopped filtering would fail rather than find nothing to fail on

#### Scenario: A clean run exits zero on this metric
- **WHEN** no leg returns a note outside the enumeration and no unlisted module reads notes
- **THEN** the count is zero and the evaluation exits zero on that metric

### Requirement: Reachability is measured and reported
The evaluation SHALL compute, over the fixture corpus, the proportion of fixtures for which a note in the expected set was not returned by the pass from that fixture's declared entry selector at its declared hop budget. It SHALL report the rate and SHALL name each unreached note together with the fixture that expected it, so a miss is actionable rather than a number.

#### Scenario: A miss is named, not just counted
- **WHEN** a fixture expects a note the pass does not return at the declared hop budget
- **THEN** the report names that note and that fixture, and the reachability figure reflects it

#### Scenario: Full reachability reports zero misses
- **WHEN** every fixture's expected notes are returned at its declared hop budget
- **THEN** the reported miss rate is zero and no note is named

#### Scenario: Reachability is measured at the fixture's own budget
- **WHEN** two fixtures declare different hop budgets
- **THEN** each is evaluated at the budget it declares, and neither is measured at a budget the evaluation chose for it

### Requirement: Gloss vocabulary coverage is measured in three states
The evaluation SHALL compute, for each note in a fixture's expected set, whether that note's authored catalog gloss shares a term with the fixture's declared vocabulary, whether the note's body shares one where the gloss does not, or whether neither does. It SHALL report these three states separately and SHALL NOT combine them into a single figure, so a thin catalog is distinguishable from a corpus that genuinely lacks the vocabulary.

#### Scenario: A gloss sharing no term with the fixture's vocabulary is named
- **WHEN** an expected note's authored gloss shares no term with its fixture's declared vocabulary
- **THEN** the report names that note and that fixture

#### Scenario: A body carrying the vocabulary is distinguished from one that does not
- **WHEN** an expected note's gloss lacks the vocabulary and its body carries it
- **THEN** that note is reported in a different state from one whose body also lacks it

#### Scenario: The three states are reported separately, never summed
- **WHEN** the evaluation reports gloss vocabulary coverage
- **THEN** the three states appear as distinct figures, and no single combined coverage number replaces them

### Requirement: Baselines are committed and compared
The evaluation SHALL write its metrics to a version-controlled baseline file in a stable, diff-readable form carrying no timestamp, and SHALL compare each run against the committed baseline. A run whose reachability or gloss coverage is worse than the baseline SHALL exit non-zero naming the metric, the baseline value, and the new value. A run that improves a metric SHALL report the improvement and SHALL leave the committed baseline unchanged for a human to update deliberately.

#### Scenario: A regression is caught as a diff
- **WHEN** a change worsens a baselined metric against the committed baseline
- **THEN** the evaluation exits non-zero naming the metric, the baseline value, and the new value

#### Scenario: The baseline is byte-stable
- **WHEN** the evaluation runs twice against an unchanged store and corpus
- **THEN** the two baseline outputs are byte-identical and carry no timestamp

#### Scenario: An improvement does not silently move the goalposts
- **WHEN** a run improves a baselined metric
- **THEN** the run reports the improvement and the committed baseline file is unchanged until a human updates it
