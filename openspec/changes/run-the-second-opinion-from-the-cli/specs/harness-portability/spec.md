## MODIFIED Requirements

### Requirement: The second-opinion skill is an owned skill over external model CLIs
contexture SHALL ship `ctxr-second-opinion` as a contexture-owned skill delivered by init and update, carrying no supporting files and driving the `ctxr second-opinion` command group. The command SHALL offer two modes: *critique*, in which a written plan is sent to three critic roles — structure and coherence, failure modes and trust boundaries, and simplicity and cost — each backed by a different model family's command-line tool; and *poll*, in which one question is sent to the same model families, optionally asking each to answer through two or three named taste lenses; and a *preflight* that checks each tool before anything is spent. `ctxr second-opinion` SHALL be the only `ctxr` command that invokes a model CLI. No other command's behavior SHALL depend on it or on those CLIs being present, it SHALL NOT be invoked by any command on the write path, and `ctxr verify` SHALL NOT report the CLIs. The critic contract, persona mandates and lens roster SHALL be shipped as package templates.

The command is the enforcing mechanism for the following, each covered by a test that runs it against stub CLIs on the executable search path:

- It SHALL run the critics concurrently, each in its own process and each given only the plan and its own role — never another critic's output.
- It SHALL pass prompt content to each CLI on standard input or as a single argument vector element, never through a shell.
- It SHALL invoke each CLI with that tool's read-only or no-tools mode where one exists, and in an empty scratch directory as its working directory in every case.
- It SHALL give each CLI an environment built from a declared allowlist — the executable search path, home, locale and terminal variables, the model CLIs' own variable prefixes, proxy and certificate variables, its own `CTXR_SECOND_OPINION_` variables, and any names an operator lists in a declared pass-through variable — and no other variable of its own environment.
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

## ADDED Requirements

### Requirement: No secret in the environment reaches a model CLI
`ctxr second-opinion` SHALL NOT pass to a model CLI any environment variable outside its declared allowlist, so a forge token, an App credential or its file path present in its own environment is never visible to a critic. A preflight that fails SHALL name the variables it withheld, never their values.

#### Scenario: A forge credential is withheld
- **WHEN** the command runs with `GH_TOKEN`, `CONTEXTURE_GITHUB_APP_PRIVATE_KEY_FILE` and `ANTHROPIC_API_KEY` set, against stub CLIs that record their environment
- **THEN** each stub saw `ANTHROPIC_API_KEY` and neither of the other two

#### Scenario: An operator passes a variable through
- **WHEN** `CTXR_SECOND_OPINION_PASS_ENV=CORP_CONFIG` and `CORP_CONFIG` are set
- **THEN** each stub saw `CORP_CONFIG`
