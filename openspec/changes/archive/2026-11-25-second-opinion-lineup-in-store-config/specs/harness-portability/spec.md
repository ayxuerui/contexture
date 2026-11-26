# Spec Delta

## ADDED Requirements

### Requirement: The second opinion's lineup is store configuration with shipped defaults
In a store, `ctxr second-opinion` SHALL read each model CLI's model, and its effort where the CLI takes one, from the store's configuration, per tier. The configuration schema SHALL declare a shipped default for every model and for every effort contexture ships; an effort left to the CLI's own default SHALL stay optional with none. Outside a store the command SHALL run on the shipped defaults. A test runs the command against stub CLIs that record their arguments.

#### Scenario: A store names one model and keeps the rest
- **WHEN** store `ctx-a` configures a model for one CLI in the `strong` tier and nothing else, and a critique runs there at the default tier
- **THEN** that CLI is asked for the configured model, the other two for their shipped defaults, and a run with `--tier fast` asks all three for the shipped `fast` defaults

#### Scenario: A store that names nothing follows the shipped lineup
- **WHEN** store `ctx-b` declares no second-opinion lineup and a critique runs there
- **THEN** every CLI is asked for its shipped default

#### Scenario: Outside a store the command still runs
- **WHEN** `ctxr second-opinion poll` runs in a directory that is not inside a store
- **THEN** it asks every CLI for its shipped default and completes

#### Scenario: A written configuration omits the shipped lineup
- **WHEN** `ctxr init` completes with every convention accepted
- **THEN** the written `contexture.yaml` carries no second-opinion lineup

### Requirement: The environment overrides the lineup for one run, and the source is reported
A model or effort named in the command's own `CTXR_SECOND_OPINION_` environment variables SHALL win over the store's configuration for that run, in both tiers. `preflight`, and the manifest of a critique or a poll, SHALL name for each CLI the model asked for and its source: the environment, the store's configuration, or the shipped default. A test runs the command against stub CLIs that record their arguments.

#### Scenario: The environment wins for one run
- **WHEN** store `ctx-a` configures a model for a CLI and the run's environment names a different model for that CLI
- **THEN** the CLI is asked for the environment's model, and the report names the environment as its source

#### Scenario: The report says where a model came from
- **WHEN** a critique completes in a store that configures one CLI's model, with no lineup variable in the environment
- **THEN** the manifest records the store's configuration as that model's source and the shipped default as the source of the other two

### Requirement: An invalid lineup fails and is never substituted
The command SHALL NOT ask for another model when a CLI refuses the one resolved for it: that CLI is a failed critic, recorded with the CLI's own reason. A configuration naming a tier or a model CLI that contexture does not have SHALL fail to load, by the configuration schema, before any model CLI starts. A test covers each with stub CLIs.

#### Scenario: A refused model is a failed critic
- **WHEN** a stub CLI rejects the model the store configured for it
- **THEN** that critic is recorded as failed with the CLI's reason, and no other model is asked for

#### Scenario: An unknown CLI in the lineup is refused at load
- **WHEN** a store's configuration names a lineup entry for a CLI contexture does not run
- **THEN** loading the configuration fails naming that key, and no model CLI starts
