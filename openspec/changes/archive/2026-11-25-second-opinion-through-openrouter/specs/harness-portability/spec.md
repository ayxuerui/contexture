# Spec Delta

## ADDED Requirements

### Requirement: A lineup entry may name an OpenRouter model
Each entry of a tier in the store's second-opinion lineup SHALL accept an optional OpenRouter model slug, with no shipped default. When an entry resolves to a slug, `ctxr second-opinion` SHALL answer that critic with one request to OpenRouter naming that slug and SHALL NOT start that entry's model CLI. An entry with no slug SHALL run its CLI as before. A test runs the command against stub CLIs and a stub endpoint that record what they receive.

#### Scenario: One entry is routed and the others are not
- **WHEN** store `ctx-a` names an OpenRouter slug for one entry in the `strong` tier and nothing else, and a critique runs there at the default tier
- **THEN** the stub endpoint received one request naming that slug, that entry's stub CLI was never started, and the other two stub CLIs were asked for their shipped defaults

#### Scenario: The other tier is unaffected
- **WHEN** the same store runs a critique with `--tier fast`
- **THEN** all three stub CLIs are started and the stub endpoint receives no request

#### Scenario: A store that names no slug runs as before
- **WHEN** store `ctx-b` declares no second-opinion lineup and a critique runs there
- **THEN** every critic is its model CLI and the stub endpoint receives no request

#### Scenario: A written configuration carries no slug
- **WHEN** `ctxr init` completes with every convention accepted
- **THEN** the written `contexture.yaml` names no OpenRouter slug

### Requirement: The environment routes one entry for one run
A non-empty `CTXR_SECOND_OPINION_<CLI>_OPENROUTER` SHALL route that entry through OpenRouter with the slug it holds, in both tiers, over the store's configuration. A non-empty `CTXR_SECOND_OPINION_<CLI>_MODEL` SHALL run that entry's CLI with that model even where the store names a slug for it. Both set for one entry SHALL end the command with the usage code, naming both, before any critic starts. A test covers each with stub CLIs and a stub endpoint.

#### Scenario: The environment routes an entry the store does not
- **WHEN** store `ctx-b` names no slug and the run's environment names one for an entry
- **THEN** the stub endpoint receives one request naming the environment's slug, and that entry's stub CLI is never started

#### Scenario: The environment puts an entry back on its CLI
- **WHEN** store `ctx-a` names a slug for an entry and the run's environment names a CLI model for the same entry
- **THEN** that entry's stub CLI is asked for the environment's model, and the stub endpoint receives no request

#### Scenario: Both variables for one entry are refused
- **WHEN** the environment names both a slug and a CLI model for one entry
- **THEN** the command exits with the usage code naming both variables, no CLI is started and no request is made

### Requirement: An OpenRouter critic receives its prompt and nothing else
A request to OpenRouter SHALL carry the slug, the critic's own prompt as its only message, no tool definition, and no header or field naming the store, its operator or the machine. It SHALL be bounded by the same per-critic timeout as a model CLI. The answer's text and the model OpenRouter reports SHALL enter the manifest, the letters and the blind check exactly as a CLI's do. A test inspects the request a stub endpoint recorded.

#### Scenario: The request holds one prompt and no tools
- **WHEN** a critique routes one entry through a stub endpoint that records the request
- **THEN** the recorded body holds that critic's prompt as its single message and no tool definition, and it contains no text produced by another critic

#### Scenario: Nothing identifies the store
- **WHEN** the same request is recorded for a critique run in store `ctx-a`
- **THEN** no header and no body field other than the prompt carries the store's name, its path or the host's name

#### Scenario: A blind answer from OpenRouter does not count
- **WHEN** the stub endpoint returns a well-formed verdict whose findings cite nothing in the plan
- **THEN** that critique is marked blind in the manifest and excluded from the valid count

### Requirement: A failed OpenRouter critic is never replaced
A request that times out, cannot connect, is answered with an error status, or returns no text SHALL be recorded as a failed critic with its cause, taken from OpenRouter's own message where there is one. The command SHALL NOT start that entry's model CLI or ask for another slug in its place. A test covers each cause with a stub endpoint.

#### Scenario: A refused slug is a failed critic
- **WHEN** the stub endpoint answers a request with an error naming an unknown model
- **THEN** that critic is recorded as failed with the endpoint's message, that entry's stub CLI is never started, and no second request is made

#### Scenario: A request that outlasts the timeout fails
- **WHEN** the stub endpoint does not answer within the run's `--timeout`
- **THEN** that critic is recorded as failed naming the timeout, and the other critics' results are kept

### Requirement: The OpenRouter key is read from the environment and appears nowhere else
The command SHALL read the key from `OPENROUTER_API_KEY` in its own environment and from nowhere else, and SHALL place it only in the request's authorization header. No manifest, answer file, raw file, output stream or detached run's folder SHALL contain it. An entry routed through OpenRouter with no key set SHALL be a failed critic whose cause names the variable. A test searches everything a run wrote and printed for the stub key.

#### Scenario: The key reaches the endpoint and nothing else
- **WHEN** a detached critique routes one entry through a stub endpoint with a stub key set, and its result is fetched
- **THEN** the recorded request carries the key in its authorization header, and no file in the run's folder and no line the commands printed contains it

#### Scenario: A missing key fails that critic only
- **WHEN** store `ctx-a` routes one entry through OpenRouter and the environment sets no key
- **THEN** that critic is recorded as failed naming `OPENROUTER_API_KEY`, no request is made, and the two model CLIs still run

### Requirement: The OpenRouter key never reaches a model CLI
The environment allowlist SHALL withhold every `OPENROUTER_` variable from a model CLI, and the pass-through variable SHALL NOT be able to name one: naming it SHALL end the command with the usage code before any critic starts. The allowlist is the mechanism, and a test runs stub CLIs that record their environment.

#### Scenario: A CLI critic does not see the key
- **WHEN** a critique runs with `OPENROUTER_API_KEY` set, one entry routed through OpenRouter and two stub CLIs that record their environment
- **THEN** neither stub saw `OPENROUTER_API_KEY`

#### Scenario: The pass-through cannot name the key
- **WHEN** `CTXR_SECOND_OPINION_PASS_ENV=OPENROUTER_API_KEY` is set
- **THEN** the command exits with the usage code naming `OPENROUTER_API_KEY`, no CLI is started and no request is made

### Requirement: An OpenRouter request declines data collection
Every request to OpenRouter SHALL ask it to route only to providers that do not collect the prompt. A request OpenRouter refuses for that reason SHALL be a failed critic carrying OpenRouter's message. The request body is the mechanism, and a test inspects it at a stub endpoint.

#### Scenario: The request carries the refusal
- **WHEN** a poll routes one entry through a stub endpoint that records the request
- **THEN** the recorded body asks for providers that do not collect data

### Requirement: Preflight and the manifest name each critic's route
`preflight`, and the manifest of a critique or a poll, SHALL say for each critic whether it ran through its model CLI or through OpenRouter, beside the model asked for and its source. `preflight` SHALL check an OpenRouter entry by one request for the tier's slug, and SHALL report it down, naming the cause, when the key is missing or the request fails. A test covers both with a stub endpoint.

#### Scenario: The manifest records the route
- **WHEN** a critique completes in store `ctx-a`, which routes one entry through OpenRouter
- **THEN** the manifest records OpenRouter as that critic's route with its slug and the store's configuration as the source, and the model CLI as the route of the other two

#### Scenario: Preflight pings the tier's slug
- **WHEN** `ctxr second-opinion preflight --tier strong` runs in the same store with a stub endpoint
- **THEN** the endpoint receives one request naming the `strong` slug, and that entry is reported up, through OpenRouter, with the slug and its source

#### Scenario: Preflight reports a missing key
- **WHEN** the same preflight runs with no key set
- **THEN** that entry is reported down naming `OPENROUTER_API_KEY`, and the command exits with the failed-check code

### Requirement: The OpenRouter address can be named in the environment
When `CTXR_SECOND_OPINION_OPENROUTER_URL` is set, requests SHALL go to that address in place of OpenRouter's own, unchanged in shape. The address SHALL NOT be read from the store's configuration. A test sets it to a stub endpoint.

#### Scenario: The environment names the address
- **WHEN** the variable names a stub endpoint and a critique routes one entry through OpenRouter
- **THEN** the stub endpoint receives the request and no request goes to OpenRouter's own address

#### Scenario: The configuration cannot name the address
- **WHEN** a store's configuration carries an address key in its second-opinion lineup
- **THEN** loading the configuration fails naming that key, and no critic starts

### Requirement: The second-opinion skill explains the OpenRouter route
The rendered `ctxr-second-opinion` skill SHALL state how a store routes a lineup entry through OpenRouter and how one run is routed from the environment; that the key is set in the environment and never in the store; that a plan sent this way goes to OpenRouter and the provider behind it, which the report names; and that such an entry cannot act, so it stays in a run on a plan from someone else. These are skill-markdown conventions, asserted by a test over the rendered skill.

#### Scenario: The rendered skill covers the route
- **WHEN** the skill is rendered for a store
- **THEN** it names the lineup key and the environment variable for a slug, names `OPENROUTER_API_KEY` as an environment variable, says where a routed plan goes, and says a routed entry need not be left out of a run on someone else's plan

## MODIFIED Requirements

### Requirement: The second-opinion skill is an owned skill over external model CLIs
contexture SHALL ship `ctxr-second-opinion` as a contexture-owned skill delivered by init and update, carrying no supporting files and driving the `ctxr second-opinion` command group. The command SHALL offer two modes: *critique*, in which a written plan is sent to three critic roles — structure and coherence, failure modes and trust boundaries, and simplicity and cost — each backed by a different model family, reached through that family's command-line tool or, where the lineup names an OpenRouter model for it, through OpenRouter; and *poll*, in which one question is sent to the same model families, optionally asking each to answer through two or three named taste lenses; and a *preflight* that checks each tool before anything is spent. `ctxr second-opinion` SHALL be the only `ctxr` command that invokes a model CLI or calls a model API. No other command's behavior SHALL depend on it or on those CLIs being present, it SHALL NOT be invoked by any command on the write path, and `ctxr verify` SHALL NOT report the CLIs. The critic contract, persona mandates and lens roster SHALL be shipped as package templates.

The command is the enforcing mechanism for the following, each covered by a test that runs it against stub CLIs on the executable search path:

- It SHALL run the critics concurrently, each model CLI in its own process, and each critic given only the plan and its own role — never another critic's output.
- It SHALL pass prompt content to each CLI on standard input or as a single argument vector element, never through a shell.
- It SHALL invoke each CLI with that tool's read-only or no-tools mode where one exists, and in an empty scratch directory as its working directory in every case.
- It SHALL give each CLI an environment built from a declared allowlist — the executable search path, home, locale and terminal variables, the model CLIs' own variable prefixes, proxy and certificate variables, its own `CTXR_SECOND_OPINION_` variables, and any names an operator lists in a declared pass-through variable, except the forge and contexture prefixes, which the pass-through cannot name — and no other variable of its own environment.
- It SHALL bound each critic by a timeout and record a critic that times out, exits non-zero, or returns output lacking the required verdict as failed, with the cause.
- It SHALL write each critique under a letter assigned in an order independent of the critic roster, record the letter-to-role-and-model mapping in a separate manifest, and record in that manifest the model each CLI reports having run where the CLI reports one.
- It SHALL mark a critique whose findings cite nothing the plan contains — no step it numbers and no text quoted from it — as blind and exclude it from the count of valid critiques, while a critique that approves with no findings SHALL remain valid.
- It SHALL exit with the failed-check status when fewer than two critiques are valid, so a partial result cannot be mistaken for a complete one, and with the usage status for invalid arguments or fewer than two requested CLIs.

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
