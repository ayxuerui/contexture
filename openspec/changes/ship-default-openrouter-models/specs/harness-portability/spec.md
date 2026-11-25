# Spec Delta

## ADDED Requirements

### Requirement: The lineup is keyed by model family, and each family names how it is reached
The store's second-opinion lineup SHALL be keyed by the families `claude`, `gpt`, `gemini` and `grok`. Each family SHALL accept an optional route, `via`, whose values are the family's command-line tool, OpenRouter, or off. No key of the lineup has a default, and `ctxr init` writes none. The configuration schema refuses an unknown family, an unknown route and an unknown field when the configuration loads, naming the key. A test loads each case.

#### Scenario: A store writes one route
- **WHEN** store `ctx-a` writes OpenRouter as the route of `gemini` and nothing else
- **THEN** the loaded lineup holds that route for `gemini` and nothing for the other three families

#### Scenario: A written configuration carries no lineup
- **WHEN** `ctxr init` completes with every convention accepted
- **THEN** the written `contexture.yaml` holds no second-opinion lineup and no model from the shipped tables

#### Scenario: An unknown family or route fails the load
- **WHEN** store `ctx-b` writes a family the lineup does not have, or a route that is none of the three
- **THEN** any `ctxr` command that loads the configuration fails naming that key

### Requirement: A critic with no route written takes the machine's default
For a family with no route written, `ctxr second-opinion` SHALL send the critic through OpenRouter when the OpenRouter key variable is set and not empty in the command's environment, and SHALL run the family's tool otherwise. A family with no tool and no route is not in the lineup where no key is set. A written route SHALL win over the default in both directions. A test runs the command with stub tools and a stub endpoint, with and without the key.

#### Scenario: No key and nothing written
- **WHEN** a critique runs in a store that writes no lineup, with no key set
- **THEN** `claude`, `gpt` and `gemini` each run their tool, `grok` is not in the run, and the endpoint receives no request

#### Scenario: A key and nothing written
- **WHEN** the same critique runs with the key set
- **THEN** all four critics are answered through the endpoint, each with the model shipped for its family at the run's tier, and no tool is started

#### Scenario: A written route wins over the default
- **WHEN** store `ctx-a` writes the tool as the route of two families and OpenRouter for a third, and a critique runs with the key set
- **THEN** the two run their tools and the third is answered through the endpoint

#### Scenario: A written route to OpenRouter holds without a key
- **WHEN** store `ctx-a` writes OpenRouter as a family's route and a critique runs with no key set
- **THEN** that critic fails naming the key variable, the endpoint receives no request, and the other critics run

### Requirement: A critic that is off is in no run
A family whose route is written as off SHALL be left out of every run, and naming it in `--only` SHALL make the command exit with the usage code, saying it is off, before any tool starts or any request is made. A run whose lineup holds fewer than two critics SHALL be refused the same way. A test covers both.

#### Scenario: An off critic is named in `--only`
- **WHEN** store `ctx-a` writes off for `grok` and a preflight runs with `--only claude,grok`
- **THEN** it exits with the usage code saying `grok` is off, and no tool is started

#### Scenario: Too few critics are on
- **WHEN** store `ctx-b` writes off for two of the three families that have a tool, and a critique runs with no key set
- **THEN** it exits with the usage code naming the number of critics in the lineup, and no tool is started

### Requirement: The critics are named for their model families
The critics SHALL be named `claude`, `gpt`, `gemini` and `grok` wherever contexture names one: the lineup's keys, the values of `--only`, the per-critic environment variables, the manifest, `preflight` and the files a run writes. The tool that runs a critic keeps its vendor's name, used only to start it or in a message about the tool itself. A test reads a run's manifest and files with stub tools.

#### Scenario: A run reports its critics by family
- **WHEN** a critique completes with nothing written and no key set
- **THEN** the manifest names the critics `claude`, `gpt` and `gemini`, and the raw files are named for them

### Requirement: The spellings of release 0.45.0 are refused with their replacement
The lineup's tier-first keys, the critic names `codex` and `agy`, and the per-critic OpenRouter variable SHALL be refused and never read. The configuration schema refuses the old keys when the configuration loads. The command exits with the usage code, before any tool starts or any request is made, for an old critic name in `--only` and for a non-empty per-critic variable under an old name or of the removed kind. Each refusal names the replacement. A test covers each.

#### Scenario: The configuration is tier first
- **WHEN** store `ctx-a` writes a lineup with a tier as its first key
- **THEN** any `ctxr` command that loads the configuration fails, saying the lineup is keyed by model family

#### Scenario: The configuration uses an old critic name
- **WHEN** store `ctx-a` writes a lineup entry under `agy`
- **THEN** the load fails naming `gemini` as its name now

#### Scenario: The command line uses an old name
- **WHEN** `ctxr second-opinion preflight --only claude,agy` runs
- **THEN** it exits with the usage code naming `agy` and `gemini`, and no tool is started

#### Scenario: The environment uses an old variable
- **WHEN** a critique runs with a non-empty model variable under the name `codex`
- **THEN** it exits with the usage code naming that variable and its replacement, and no tool is started

#### Scenario: An old variable passed through empty is ignored
- **WHEN** a preflight runs with an old variable set to the empty string
- **THEN** the preflight runs as if the variable were absent

### Requirement: Grok is a fourth critic, reached through OpenRouter
`grok` SHALL be a critic with a role of its own in a critique, `verifier`, whose persona is a package template. It has no command-line tool: the configuration schema refuses the tool as its route, and naming it in `--only` where it is not in the lineup makes the command exit with the usage code, saying why. A critique needs two valid answers whatever the number of critics. A test runs four critics against a stub endpoint.

#### Scenario: Four critics answer
- **WHEN** a critique runs with the key set and nothing written
- **THEN** the manifest holds four critiques with the roles architect, skeptic, pragmatist and verifier, four lettered files are written, and each request carries that critic's own persona

#### Scenario: The tool is refused as Grok's route
- **WHEN** store `ctx-a` writes the tool as the route of `grok`
- **THEN** the load fails saying that family has no command-line tool

#### Scenario: Grok is named where it is not in the lineup
- **WHEN** a preflight runs with `--only claude,grok`, no key set and nothing written
- **THEN** it exits with the usage code saying `grok` runs through OpenRouter only and naming the key variable

### Requirement: contexture ships a model for every family, route and tier
The package SHALL carry a model for each family that has a tool, at each tier, and an OpenRouter model slug for each of the four families at each tier. Both tables are package content: no key of `contexture.yaml` defaults to them. A critic for which the store names no model SHALL be asked for the shipped one for its route and the run's tier. A unit test fails when a family lacks a tier or a slug lacks the `<vendor>/<model>` form.

#### Scenario: Every family has a model at every tier
- **WHEN** the tables are read
- **THEN** each of the four families gives one OpenRouter slug of the form `<vendor>/<model>` for each tier, and each family with a tool gives one tool model for each tier

#### Scenario: The shipped model follows the tier
- **WHEN** store `ctx-a` writes OpenRouter as a family's route and no model, and a critique runs at the default tier and again with `--tier fast`
- **THEN** the endpoint receives that family's shipped slug for each run's tier, and the manifest names the shipped default as the model's source

### Requirement: A written model applies at its tier, on the route written beside it
A family MAY name a model for a tier. A written model SHALL be asked for at that tier only, and the other tier keeps the shipped one. The configuration schema SHALL refuse, when the configuration loads, a model with no tool or OpenRouter route written beside it, and a model for the OpenRouter route that lacks the `<vendor>/<model>` form. A test covers each.

#### Scenario: A model is written for one tier
- **WHEN** store `ctx-a` writes OpenRouter as a family's route and a slug for the `strong` tier, and a critique runs at each tier
- **THEN** the endpoint receives the written slug at `strong` and the shipped slug at `fast`, and the manifest names the store's configuration as the source of the first

#### Scenario: A model is written with no route
- **WHEN** store `ctx-b` writes a model for a family and no route
- **THEN** the load fails naming that key and saying a model needs its route written beside it

#### Scenario: A model through OpenRouter is not a slug
- **WHEN** store `ctx-b` writes OpenRouter as a family's route and a model with no `/`
- **THEN** the load fails naming that key and the slug's form

### Requirement: The route is never chosen for one run
No environment variable and no option SHALL choose a critic's route for one run. A non-empty model variable for a critic that goes through OpenRouter, whether its route was written or is the default, SHALL make the command exit with the usage code before any tool starts or any request is made, naming the variable. For a critic that runs its tool, that variable SHALL name the tool's model as before. A test covers both with stub tools and a stub endpoint.

#### Scenario: A model variable cannot put a critic back on its tool
- **WHEN** store `ctx-a` writes OpenRouter as the route of `gemini`, and a critique runs there with that critic's model variable set
- **THEN** it exits with the usage code naming the variable, no tool is started and the endpoint receives no request

#### Scenario: The model variable still applies to a tool
- **WHEN** the same store writes the tool as the route of `gpt`, and a critique runs with that critic's model variable set
- **THEN** that tool is asked for the variable's model, and the manifest names the environment as the model's source

### Requirement: Reports say which route a critic took and what chose it
`preflight`, and the manifest of a critique or a poll, SHALL give for each critic its route, whether the configuration or the default chose that route, the model asked for, and whether the environment, the configuration or the shipped tables named that model. A test reads both reports after runs against stub tools and a stub endpoint.

#### Scenario: The manifest records what chose each route
- **WHEN** a critique completes in store `ctx-a`, which writes a route for some families, with the key set
- **THEN** the manifest records the configuration as the source of each written route and the default as the source of each of the others

#### Scenario: Preflight shows the model in use
- **WHEN** `ctxr second-opinion preflight` runs with the key set and nothing written
- **THEN** each of the four lines shows the shipped slug, that it is a shipped default, and that it ran through OpenRouter

### Requirement: A scheduled check reports a shipped slug that OpenRouter no longer lists
The repository SHALL carry a script that reads OpenRouter's public model list, with no key and no header naming the caller, and exits non-zero naming each shipped OpenRouter slug that the list does not hold. A scheduled workflow SHALL run it and keep one tracking issue open while it fails. The script SHALL NOT run as part of the test suite, which makes no network request.

#### Scenario: Every shipped slug is listed
- **WHEN** the script runs against a model list that holds every shipped slug
- **THEN** it exits 0

#### Scenario: A shipped slug is missing
- **WHEN** the script runs against a model list that lacks one shipped slug
- **THEN** it exits non-zero and names that slug and its family and tier

### Requirement: The second-opinion skill explains the lineup
The rendered `ctxr-second-opinion` skill SHALL name the four families and the three routes, state the default route with and without a key, state that a model is not written and where the one in use is shown, and print no model from the shipped OpenRouter table. These are skill-markdown conventions, asserted by a test over the rendered skill.

#### Scenario: The rendered skill covers the lineup
- **WHEN** the skill is rendered for a store
- **THEN** it names the four families, the three values of the route, what a family with no route does on a machine with a key and on one without, and `preflight` as where the model in use is shown, and it contains no slug from the shipped table

### Requirement: The second-opinion skill names the critics and their tools
The rendered `ctxr-second-opinion` skill SHALL say which tool each critic runs, name the fourth critic's stance, tell the agent to report a route that the default chose, and name no per-critic variable under a retired name or of the removed kind. These are skill-markdown conventions, asserted by a test over the rendered skill.

#### Scenario: The rendered skill names the critics and their tools
- **WHEN** the skill is rendered for a store
- **THEN** it says which tool `claude`, `gpt` and `gemini` each run, describes the stance Grok takes, names the report field that says the default chose a route, and names no per-critic OpenRouter variable and no variable under `codex` or `agy`
