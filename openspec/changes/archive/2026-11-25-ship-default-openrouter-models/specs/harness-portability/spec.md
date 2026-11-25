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

#### Scenario: Outside a store the command still runs
- **WHEN** `ctxr second-opinion poll` runs in a directory that is not inside a store, with no key set
- **THEN** it asks each of the three tools for its shipped model and completes

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

## MODIFIED Requirements

### Requirement: The second-opinion skill is an owned skill over external model CLIs
contexture SHALL ship `ctxr-second-opinion` as a contexture-owned skill delivered by init and update, carrying no supporting files and driving the `ctxr second-opinion` command group. The command SHALL offer two modes: *critique*, in which a written plan is sent to the critic roles — structure and coherence, failure modes and trust boundaries, simplicity and cost, and, where a fourth family is in the lineup, how the result will be checked — each backed by a different model family, reached through that family's command-line tool or through OpenRouter, as the lineup and the machine's default give; and *poll*, in which one question is sent to the same model families, optionally asking each to answer through two or three named taste lenses; and a *preflight* that checks each tool before anything is spent. `ctxr second-opinion` SHALL be the only `ctxr` command that invokes a model CLI or calls a model API. No other command's behavior SHALL depend on it or on those CLIs being present, it SHALL NOT be invoked by any command on the write path, and `ctxr verify` SHALL NOT report the CLIs. The critic contract, persona mandates and lens roster SHALL be shipped as package templates.

The command is the enforcing mechanism for the following, each covered by a test that runs it against stub CLIs on the executable search path:

- It SHALL run the critics concurrently, each model CLI in its own process, and each critic given only the plan and its own role — never another critic's output.
- It SHALL pass prompt content to each CLI on standard input or as a single argument vector element, never through a shell.
- It SHALL invoke each CLI with that tool's read-only or no-tools mode where one exists, and in an empty scratch directory as its working directory in every case.
- It SHALL give each CLI an environment built from a declared allowlist — the executable search path, home, locale and terminal variables, the model CLIs' own variable prefixes, proxy and certificate variables, its own `CTXR_SECOND_OPINION_` variables, and any names an operator lists in a declared pass-through variable, except the forge and contexture prefixes, which the pass-through cannot name — and no other variable of its own environment.
- It SHALL bound each critic by a timeout and record a critic that times out, exits non-zero, or returns output lacking the required verdict as failed, with the cause.
- It SHALL write each critique under a letter assigned in an order independent of the critic roster, record the letter-to-role-and-model mapping in a separate manifest, and record in that manifest the model each CLI reports having run where the CLI reports one.
- It SHALL mark a critique whose findings cite nothing the plan contains — no step it numbers and no text quoted from it — as blind and exclude it from the count of valid critiques, while a critique that approves with no findings SHALL remain valid.
- It SHALL exit with the failed-check status when fewer than two critiques are valid, so a partial result cannot be mistaken for a complete one, and with the usage status for invalid arguments or fewer than two requested critics.

The skill SHALL state when to critique, when to poll, and when to answer directly; SHALL instruct synthesis on the anonymized letters before the manifest is read; SHALL instruct that a dissent backed by cited evidence, and a rejection carrying a critical finding, are surfaced in their own sections rather than outvoted; SHALL disclose that a critic sharing the orchestrating agent's model family is a bias to name; and SHALL end in a hand-off that executes no step of the plan it critiqued. Those instructions are skill-markdown conventions, asserted by a test over the rendered skill, not guarantees the command can make.

#### Scenario: Update delivers the skill with its runner
- **WHEN** a store whose skill carries the earlier supporting-file runner runs `ctxr update`
- **THEN** the skill is present at the configured skills path with the managed header and names `ctxr second-opinion`, the earlier runner and prompt fragments beside it are removed, and a second update reports nothing changed

#### Scenario: Critics never see each other
- **WHEN** the command executes a critique against stub CLIs that record the input they receive
- **THEN** each stub received the plan and exactly one role's instructions, and none received text produced by another critic

#### Scenario: No shell stands between the plan and a critic
- **WHEN** the command executes a critique of a plan containing shell metacharacters, quotes, and a multi-kilobyte body
- **THEN** each stub CLI receives the plan byte-identical, and no shell process is spawned

#### Scenario: Results are anonymized
- **WHEN** the command completes a critique
- **THEN** the critique files are named by letter, contain no role or model name placed there by the command, and the letter-to-role-and-model mapping appears only in the manifest

#### Scenario: A failed critic is reported, not hidden
- **WHEN** one stub CLI exits non-zero and another exceeds the timeout
- **THEN** each of those critiques is recorded as failed naming its cause, and the command does not substitute another model for either

#### Scenario: A blind critique does not count
- **WHEN** a stub CLI returns a well-formed verdict whose findings cite no step and quote no text present in the plan
- **THEN** the critique is marked blind in the manifest and excluded from the valid count

#### Scenario: Fewer than two valid critiques is a partial result
- **WHEN** only one of three critiques is valid
- **THEN** the command exits with the failed-check status, distinct from both success and a usage error

#### Scenario: The rendered skill hands off without executing
- **WHEN** the skill is rendered for a store
- **THEN** it instructs synthesizing on letters before reading the manifest, carries sections for evidence-backed dissent and for critical rejections, names the orchestrator's model-family bias, and ends by presenting the synthesis without executing any step of the critiqued plan

#### Scenario: No command depends on the model CLIs
- **WHEN** none of the model CLIs is on the executable search path and `ctxr verify`, `ctxr doctor`, and `ctxr update` run
- **THEN** each behaves exactly as it does when the CLIs are present, and none names them

### Requirement: The environment overrides the lineup for one run, and the source is reported
For a critic that runs its tool, a model or effort named in the command's own `CTXR_SECOND_OPINION_` environment variables SHALL win over the store's configuration for that run, in both tiers. `preflight`, and the manifest of a critique or a poll, SHALL name for each critic the model asked for and its source: the environment, the store's configuration, or the shipped default. A test runs the command against stub CLIs that record their arguments.

#### Scenario: The environment wins for one run
- **WHEN** store `ctx-a` writes the tool as a critic's route and a model for it, and the run's environment names a different model for that critic
- **THEN** the tool is asked for the environment's model, and the report names the environment as its source

#### Scenario: The report says where a model came from
- **WHEN** a critique completes in a store that writes the tool and a model for one critic, with no key and no lineup variable in the environment
- **THEN** the manifest records the store's configuration as that model's source and the shipped default as the source of the other two

### Requirement: An invalid lineup fails and is never substituted
The command SHALL NOT ask for another model when a CLI refuses the one resolved for it: that CLI is a failed critic, recorded with the CLI's own reason. A configuration naming a family or a route that contexture does not have SHALL fail to load, by the configuration schema, before any model CLI starts. A test covers each with stub CLIs.

#### Scenario: A refused model is a failed critic
- **WHEN** a stub CLI rejects the model the store configured for it
- **THEN** that critic is recorded as failed with the CLI's reason, and no other model is asked for

#### Scenario: An unknown CLI in the lineup is refused at load
- **WHEN** a store's configuration names a lineup entry for a family contexture does not have
- **THEN** loading the configuration fails naming that key, and no model CLI starts

### Requirement: The second-opinion skill explains the OpenRouter route
The rendered `ctxr-second-opinion` skill SHALL state how a store routes a critic through OpenRouter, in its configuration and nowhere else; that the key is set in the environment and never in the store; that a plan sent this way goes to OpenRouter and the provider behind it, which the report names; and that such a critic cannot act, so it stays in a run on a plan from someone else. These are skill-markdown conventions, asserted by a test over the rendered skill.

#### Scenario: The rendered skill covers the route
- **WHEN** the skill is rendered for a store
- **THEN** it names the lineup key for a critic's route, names `OPENROUTER_API_KEY` as an environment variable, says where a routed plan goes, and says a routed critic need not be left out of a run on someone else's plan

## REMOVED Requirements

### Requirement: The second opinion's lineup is store configuration with shipped defaults
**Reason**: The lineup is no longer tier first, and no key of it has a schema default. The family-first block, the default route, the shipped tables and a written model are each a requirement of this change.
**Migration**: A store that wrote `second_opinion.<tier>.<cli>.model` writes `second_opinion.<family>.via: cli` with the model under `strong` or `fast`. A store that wrote nothing changes nothing.

### Requirement: A lineup entry may name an OpenRouter model
**Reason**: The route is a property of the family, written as `via`, and holds at both tiers. A model slug is no longer what routes a critic, and one ships for every family and tier.
**Migration**: A store that wrote `second_opinion.<tier>.<cli>.openrouter` writes `second_opinion.<family>.via: openrouter`, and the slug under `strong` or `fast` only where it wants one other than the shipped.

### Requirement: The environment routes one entry for one run
**Reason**: The route is never chosen for one run. The per-critic OpenRouter variable is removed, and a model variable no longer moves a critic back to its tool.
**Migration**: Remove `CTXR_SECOND_OPINION_<CLI>_OPENROUTER` from the environment and write `second_opinion.<family>.via` in the store's configuration. To leave a critic out of one run, use `--only`.
