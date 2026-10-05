## MODIFIED Requirements

### Requirement: Contexture-owned skills are copied into the store and refreshed by update
The shipped skills SHALL be contexture-owned: their canonical content ships with the tool, and a store SHALL carry a full copy of each at the configured skills path in the skill layout (`<slug>/SKILL.md`), marked as managed. `init` SHALL write them, together with every other contexture-owned file the update command brings current, including each declared harness's adapter outputs; a dedicated update command SHALL bring every contexture-owned file in a store — generated entry-document sections, managed ignore blocks, hooks, skill copies, and adapter outputs — to the installed tool version without touching operator-authored content. Both SHALL be byte-stable when nothing has changed.

#### Scenario: Update refreshes a drifted copy and leaves operator content alone
- **WHEN** a contexture-owned skill copy differs from the installed version and an operator-authored skill sits alongside it, and the update command runs
- **THEN** the contexture-owned copy is rewritten to the installed version, the operator skill is byte-identical, and an immediately repeated update reports nothing changed

### Requirement: The operator declares which harnesses a store targets, at setup
`ctxr init` SHALL accept a non-interactive option naming the harnesses to configure, and SHALL prompt for them when run interactively without one, recording the selection in the store's configuration as declared adapters. Selecting none SHALL be permitted and SHALL leave the store with the canonical skills directory and no bridged harness. Contexture SHALL NOT infer the selection from what is installed on the machine.

`ctxr init` SHALL generate the outputs of every declared harness adapter in the same run that records the selection, and SHALL commit every output it writes with the initial store scaffold, so a harness pointed at a freshly initialized store loads the store's entry document without any further command. A file the adapter generates nothing for SHALL NOT be created. Running `ctxr init` against an already-initialized store SHALL bring the declared adapters' outputs current exactly as the update command does.

#### Scenario: Harnesses are named non-interactively
- **WHEN** `ctxr init` runs with the harness option naming two harnesses
- **THEN** both are recorded as declared adapters in the generated configuration and both are bridged, with no prompt shown

#### Scenario: An interactive run prompts before writing
- **WHEN** `ctxr init` runs in an interactive terminal with no harness option
- **THEN** it presents the selectable harnesses and records the operator's choice before writing the configuration

#### Scenario: Selecting no harness is valid
- **WHEN** `ctxr init` runs selecting no harness
- **THEN** skills are written to the canonical skills directory, no harness directory is created, no harness entry file is written, and the command exits successfully

#### Scenario: A harness that declares an entry file gets it in the initial commit
- **WHEN** `ctxr init` runs non-interactively on an empty directory selecting a harness whose adapter declares an entry file
- **THEN** that entry file exists at the store root containing the managed import of `AGENTS.md`, it is tracked in the commit `init` creates, it is listed among the files `init` reports as created, and the working tree is clean afterwards

#### Scenario: A harness that reads the entry document directly gets no entry file
- **WHEN** `ctxr init` runs selecting only a harness whose adapter declares no entry file
- **THEN** no harness entry file is written, its skills directory is still bridged, and the command exits successfully

#### Scenario: Nothing is created for an adapter that contributes nothing
- **WHEN** `ctxr init` runs selecting a harness whose adapter emits no permission config for a store that has none
- **THEN** no permission config file is created, and none is named among the created files or in the initial commit

#### Scenario: Re-running init restores a missing entry file
- **WHEN** an initialized store declares a harness whose adapter declares an entry file, that file is absent, and `ctxr init` runs against the store again
- **THEN** the entry file is written with the managed import of `AGENTS.md`, no configuration is rewritten, no commit is created, and a further `ctxr init` changes nothing

## ADDED Requirements

### Requirement: A freshly initialized store is already current
A store produced by `ctxr init` SHALL already hold every contexture-owned file at the installed tool version, so the update command run immediately afterwards, with the same tool version, SHALL report nothing changed. This SHALL hold whichever taxonomy and harness selection `init` was given. It is enforced by an automated test that initializes a store and then runs the update command against it. A contexture-owned file that `init` omits, or writes differently from the update command, fails that test.

#### Scenario: Update after init is a no-op
- **WHEN** `ctxr init` runs non-interactively on an empty directory selecting a harness whose adapter declares an entry file, and the update command runs immediately afterwards
- **THEN** the update command reports nothing changed, and the working tree is still clean

#### Scenario: Update after a no-harness init is a no-op
- **WHEN** `ctxr init` runs selecting no harness, and the update command runs immediately afterwards
- **THEN** the update command reports nothing changed, and no harness entry file exists
