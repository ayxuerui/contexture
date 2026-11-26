# Spec Delta

## ADDED Requirements

### Requirement: Every critic reviews a plan in all four roles
A critique SHALL send each critic in the run the instructions of the four roles `architect`, `skeptic`, `pragmatist` and `verifier`, and SHALL ask for one answer that carries one verdict and one section for each role. No role belongs to a model family. A critique whose answer lacks a section for one of the four roles SHALL be recorded as failed, naming the role. The manifest SHALL record, for each critique, the number of findings in each role's section. A test runs the command against stub tools and a stub endpoint that record what they receive.

#### Scenario: Each critic receives the four roles
- **WHEN** a critique runs with four critics in the lineup
- **THEN** each of the four requests carries the instructions of all four roles and the plan, and the manifest gives each critique a count of findings for each of the four roles

#### Scenario: A run of two critics still covers the four roles
- **WHEN** a critique runs with `--only claude,gpt`
- **THEN** both critics receive the instructions of all four roles, and each valid critique holds four role sections

#### Scenario: An answer that skips a role is failed
- **WHEN** a stub critic returns a verdict and sections for three of the four roles
- **THEN** that critique is recorded as failed, its cause names the missing role, and it is excluded from the count of valid critiques

### Requirement: The order of the roles differs between critics and is recorded
The four role sections SHALL be given to each critic in an order that is a rotation of the roster of roles, chosen from the plan's bytes and the critic's name, so that the same plan gives the same critic the same order on every run. The manifest SHALL record the order for each critique. A unit test covers the choice of rotation, and a test of the command reads the order from the manifest and from the request the stub received.

#### Scenario: The same plan gives the same order
- **WHEN** a critique of one plan runs twice with the same critics
- **THEN** each critic's request lists the roles in the same order both times, and that order is the one the manifest records for it

#### Scenario: Each role comes first for some critic and plan
- **WHEN** the rotation is computed for the four critics over a set of sample plans
- **THEN** each of the four roles is first in at least one of the orders, and every order is a rotation of the roster

### Requirement: A critique may carry up to five findings in each role
The critic contract, a package template, SHALL allow at most five findings in each role's section, SHALL state that a role with nothing to report is answered with `None.` and one sentence of reasoning, and SHALL keep the instruction to prefer one strong finding to several weak ones. A critique that approves with every role's section empty SHALL remain valid. These are template conventions asserted by a test over the rendered prompt; the command does not discard a sixth finding.

#### Scenario: The rendered prompt states the limit
- **WHEN** the critique prompt is rendered for any critic
- **THEN** it states a limit of five findings for each role, and that `None.` is a valid answer for a role

#### Scenario: An approval with four empty sections is valid
- **WHEN** a stub critic returns `APPROVE` with `None.` under each of the four roles
- **THEN** the critique is recorded as valid with no findings

### Requirement: The second-opinion skill tells the agent how to weigh findings across critics
The rendered `ctxr-second-opinion` skill SHALL say that each reviewer covers four roles in one answer, SHALL tell the agent to group findings by the defect they name across letters and roles before weighing them, SHALL tell the agent to check a finding that only one letter raised against the plan and to state whether it holds, and SHALL say that agreement between letters sets the order to look in and is not proof. These are skill-markdown conventions, asserted by a test over the rendered skill.

#### Scenario: The rendered skill covers lone findings and agreement
- **WHEN** the skill is rendered for a store
- **THEN** it states that each reviewer answers in four role sections, tells the agent to group findings by defect, tells the agent to check a finding raised by one letter alone against the plan, and says that agreement between letters is not proof

### Requirement: The repository carries a harness that measures a critique against seeded plans
The repository SHALL carry seeded plans, each with an answer key of planted defects, and a script that sends each plan to the lineup's model families through OpenRouter under the shipped critique prompt and under a comparison setup of one request for each role, has three model families judge each finding against the key without being told the setup or the role a defect was planted for, and writes a report of the share of planted defects found for each critic and for the critics together. The script SHALL take the shipped prompt from the built package, SHALL send no header that names the caller, and SHALL NOT run as part of the test suite, which makes no network request. Its prompt assembly and its scoring SHALL be covered by unit tests that use recorded answers.

#### Scenario: The harness measures the shipped prompt
- **WHEN** the script's requests for the shipped setup are assembled for a seeded plan
- **THEN** each request's prompt is the one `ctxr second-opinion critique` builds for that critic and plan

#### Scenario: A judge is not told the setup
- **WHEN** the judge prompt is assembled for a review from either setup
- **THEN** it holds the plan, the planted defects under ids that carry no role, and the findings under labels that carry no role and no setup

#### Scenario: Recorded answers score to a known result
- **WHEN** the scoring runs over recorded answers and recorded judgements for one seeded plan
- **THEN** it reports the share of planted defects found for each critic and for the critics together, equal to the values the test states

#### Scenario: The test suite makes no request
- **WHEN** `npm test` runs with no OpenRouter key set
- **THEN** it passes, and the harness script was not started

## MODIFIED Requirements

### Requirement: The second-opinion skill is an owned skill over external model CLIs
contexture SHALL ship `ctxr-second-opinion` as a contexture-owned skill delivered by init and update, carrying no supporting files and driving the `ctxr second-opinion` command group. The command SHALL offer two modes: *critique*, in which a written plan is sent to critics, each backed by a different model family and reached through that family's command-line tool or through OpenRouter, as the lineup and the machine's default give, and each reviewing the plan in four roles — structure and coherence, failure modes and trust boundaries, simplicity and cost, and how the result will be checked; and *poll*, in which one question is sent to the same model families, optionally asking each to answer through two or three named taste lenses; and a *preflight* that checks each tool before anything is spent. `ctxr second-opinion` SHALL be the only `ctxr` command that invokes a model CLI or calls a model API. No other command's behavior SHALL depend on it or on those CLIs being present, it SHALL NOT be invoked by any command on the write path, and `ctxr verify` SHALL NOT report the CLIs. The critic contract, persona mandates and lens roster SHALL be shipped as package templates.

The command is the enforcing mechanism for the following, each covered by a test that runs it against stub CLIs on the executable search path:

- It SHALL run the critics concurrently, each model CLI in its own process, and each critic given only the plan and the roles' instructions — never another critic's output.
- It SHALL pass prompt content to each CLI on standard input or as a single argument vector element, never through a shell.
- It SHALL invoke each CLI with that tool's read-only or no-tools mode where one exists, and in an empty scratch directory as its working directory in every case.
- It SHALL give each CLI an environment built from a declared allowlist — the executable search path, home, locale and terminal variables, the model CLIs' own variable prefixes, proxy and certificate variables, its own `CTXR_SECOND_OPINION_` variables, and any names an operator lists in a declared pass-through variable, except the forge and contexture prefixes, which the pass-through cannot name — and no other variable of its own environment.
- It SHALL bound each critic by a timeout and record a critic that times out, exits non-zero, or returns output lacking the required verdict as failed, with the cause.
- It SHALL write each critique under a letter assigned in an order independent of the critic roster, record the letter-to-critic-and-model mapping in a separate manifest, and record in that manifest the model each CLI reports having run where the CLI reports one.
- It SHALL mark a critique whose findings cite nothing the plan contains — no step it numbers and no text quoted from it — as blind and exclude it from the count of valid critiques, while a critique that approves with no findings SHALL remain valid.
- It SHALL exit with the failed-check status when fewer than two critiques are valid, so a partial result cannot be mistaken for a complete one, and with the usage status for invalid arguments or fewer than two requested critics.

The skill SHALL state when to critique, when to poll, and when to answer directly; SHALL instruct synthesis on the anonymized letters before the manifest is read; SHALL instruct that a dissent backed by cited evidence, and a rejection carrying a critical finding, are surfaced in their own sections rather than outvoted; SHALL disclose that a critic sharing the orchestrating agent's model family is a bias to name; and SHALL end in a hand-off that executes no step of the plan it critiqued. Those instructions are skill-markdown conventions, asserted by a test over the rendered skill, not guarantees the command can make.

#### Scenario: Update delivers the skill with its runner
- **WHEN** a store whose skill carries the earlier supporting-file runner runs `ctxr update`
- **THEN** the skill is present at the configured skills path with the managed header and names `ctxr second-opinion`, the earlier runner and prompt fragments beside it are removed, and a second update reports nothing changed

#### Scenario: Critics never see each other
- **WHEN** the command executes a critique against stub CLIs that record the input they receive
- **THEN** each stub received the plan and the instructions of the four roles, and none received text produced by another critic

#### Scenario: No shell stands between the plan and a critic
- **WHEN** the command executes a critique of a plan containing shell metacharacters, quotes, and a multi-kilobyte body
- **THEN** each stub CLI receives the plan byte-identical, and no shell process is spawned

#### Scenario: Results are anonymized
- **WHEN** the command completes a critique
- **THEN** the critique files are named by letter, contain no critic or model name placed there by the command, and the letter-to-critic-and-model mapping appears only in the manifest

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

### Requirement: Grok is a fourth critic, reached through OpenRouter
`grok` SHALL be a fourth critic in a critique and a poll. It has no command-line tool: the configuration schema refuses the tool as its route, and naming it in `--only` where it is not in the lineup makes the command exit with the usage code, saying why. A critique needs two valid answers whatever the number of critics. A test runs four critics against a stub endpoint.

#### Scenario: Four critics answer
- **WHEN** a critique runs with the key set and nothing written
- **THEN** the manifest holds four critiques, one for each family, none of them carrying a role of its own, and four lettered files are written

#### Scenario: The tool is refused as Grok's route
- **WHEN** store `ctx-a` writes the tool as the route of `grok`
- **THEN** the load fails saying that family has no command-line tool

#### Scenario: Grok is named where it is not in the lineup
- **WHEN** a preflight runs with `--only claude,grok`, no key set and nothing written
- **THEN** it exits with the usage code saying `grok` runs through OpenRouter only and naming the key variable

### Requirement: The second-opinion skill names the critics and their tools
The rendered `ctxr-second-opinion` skill SHALL say which tool each critic runs, say that Grok has no tool and is reached through OpenRouter, tell the agent to report a route that the default chose, name no per-critic variable under a retired name or of the removed kind, and give no critic a role of its own. These are skill-markdown conventions, asserted by a test over the rendered skill.

#### Scenario: The rendered skill names the critics and their tools
- **WHEN** the skill is rendered for a store
- **THEN** it says which tool `claude`, `gpt` and `gemini` each run, says that Grok is reached through OpenRouter only, names the report field that says the default chose a route, names no per-critic OpenRouter variable and no variable under `codex` or `agy`, and pairs no role with a critic
