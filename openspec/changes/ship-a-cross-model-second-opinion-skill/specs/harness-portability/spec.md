## ADDED Requirements

### Requirement: Owned skills may carry supporting files
A contexture-owned skill SHALL be able to ship packaged files beside its `SKILL.md`, inside the same skill directory at the configured skills path. `ctxr init` and `ctxr update` SHALL write each supporting file byte-identical to the packaged copy, and SHALL write nothing when every file already matches. An owned skill directory — one whose `SKILL.md` carries the managed header — SHALL belong to contexture as a whole, exactly as the managed `SKILL.md` already does: `ctxr update` SHALL make its contents match the installed version's package, removing any file in it the package does not ship and naming each removed path in its report. Supporting files carry no marker of their own; the managed header on `SKILL.md` is what makes the directory contexture's, and a directory without it SHALL never be touched. When the whole skill stops being shipped, its directory SHALL be removed with every file in it, as the managed skill copy is today. The enforcing mechanism is the skill sync that init and update both run, exercised by a test that writes a supporting file, drops it from the package, and asserts its removal.

#### Scenario: Init delivers a skill's supporting files
- **WHEN** `ctxr init` runs against a fresh store and the installed version ships an owned skill with supporting files
- **THEN** that skill's directory at the configured skills path contains its `SKILL.md` with the managed header and each supporting file byte-identical to the packaged copy

#### Scenario: Update removes a supporting file the package dropped
- **WHEN** a store carries an owned skill's supporting file from an earlier version, the installed version no longer ships that file, and `ctxr update` runs
- **THEN** the file is removed, every file the installed version still ships is present and current, and the command reports the change

#### Scenario: A file the package does not ship is removed and named
- **WHEN** an owned skill's directory contains a file the installed version does not ship, whether left by an earlier version or added by hand, and `ctxr update` runs
- **THEN** the file is removed and the command's report names its path

#### Scenario: A directory without the managed header is never touched
- **WHEN** an operator-authored skill directory whose `SKILL.md` carries no managed header holds files of any name and `ctxr update` runs
- **THEN** every file in it is byte-identical afterwards and none is reported

#### Scenario: A current skill with supporting files makes update a no-op
- **WHEN** `ctxr update` runs twice in a row against a store whose owned skills and their supporting files already match the installed version
- **THEN** the second run writes no bytes and reports nothing changed

#### Scenario: A copy-bridged harness receives the supporting files
- **WHEN** a store declares a harness whose skills directory is bridged by copy rather than symlink
- **THEN** that harness's copy of the skill directory contains the same supporting files as the canonical one

### Requirement: The second-opinion skill is an owned skill over external model CLIs
contexture SHALL ship `ctxr-second-opinion` as a contexture-owned skill delivered by init and update, carrying its runner as a supporting file that is invoked with `node` and depends on nothing outside the Node standard library. The skill SHALL offer two modes: *critique*, in which a written plan is sent to three critic roles — structure and coherence, failure modes and trust boundaries, and simplicity and cost — each backed by a different model family's command-line tool; and *poll*, in which one question is sent to the same model families, optionally asking each to answer through two or three named taste lenses. No `ctxr` command SHALL invoke a model CLI, and no command's behavior SHALL depend on the skill or on those CLIs being present; `ctxr verify` SHALL NOT report them, because the skill is not on the write path.

The runner is the enforcing mechanism for the following, each covered by a test that runs it against stub CLIs on the executable search path:

- It SHALL run the critics concurrently, each in its own process and each given only the plan and its own role — never another critic's output.
- It SHALL pass prompt content to each CLI on standard input or as a single argument vector element, never through a shell.
- It SHALL invoke each CLI with that tool's read-only or no-tools mode where one exists, and in an empty scratch directory as its working directory in every case.
- It SHALL bound each critic by a timeout and record a critic that times out, exits non-zero, or returns output lacking the required verdict as failed, with the cause.
- It SHALL write each critique under a letter assigned in an order independent of the critic roster, record the letter-to-role-and-model mapping in a separate manifest, and record in that manifest the model each CLI reports having run where the CLI reports one.
- It SHALL mark a critique whose findings cite no step the plan contains as blind and exclude it from the count of valid critiques.
- It SHALL exit with a distinct status when fewer than two critiques are valid, so a partial result cannot be mistaken for a complete one.

The skill SHALL state when to critique, when to poll, and when to answer directly; SHALL instruct synthesis on the anonymized letters before the manifest is read; SHALL instruct that a dissent backed by cited evidence, and a rejection carrying a critical finding, are surfaced in their own sections rather than outvoted; SHALL disclose that a critic sharing the orchestrating agent's model family is a bias to name; and SHALL end in a hand-off that executes no step of the plan it critiqued. Those instructions are skill-markdown conventions, asserted by a test over the rendered skill, not guarantees the runner can make.

#### Scenario: Update delivers the skill with its runner
- **WHEN** a store initialized before this change runs `ctxr update`
- **THEN** the skill is present at the configured skills path with the managed header, its runner and prompt fragments beside it, and a second update reports nothing changed

#### Scenario: Critics never see each other
- **WHEN** the runner executes a critique against stub CLIs that record the input they receive
- **THEN** each stub received the plan and exactly one role's instructions, and none received text produced by another critic

#### Scenario: No shell stands between the plan and a critic
- **WHEN** the runner executes a critique of a plan containing shell metacharacters, quotes, and a multi-kilobyte body
- **THEN** each stub CLI receives the plan byte-identical, and no shell process is spawned

#### Scenario: Results are anonymized
- **WHEN** the runner completes a critique
- **THEN** the critique files are named by letter, contain no role or model name placed there by the runner, and the letter-to-role-and-model mapping appears only in the manifest

#### Scenario: A failed critic is reported, not hidden
- **WHEN** one stub CLI exits non-zero and another exceeds the timeout
- **THEN** each of those critiques is recorded as failed naming its cause, and the runner does not substitute another model for either

#### Scenario: A blind critique does not count
- **WHEN** a stub CLI returns a well-formed verdict whose findings cite no step present in the plan
- **THEN** the critique is marked blind in the manifest and excluded from the valid count

#### Scenario: Fewer than two valid critiques is a partial result
- **WHEN** only one of three critiques is valid
- **THEN** the runner exits with the partial-result status, distinct from both success and a usage error

#### Scenario: The rendered skill hands off without executing
- **WHEN** the skill is rendered for a store
- **THEN** it instructs synthesizing on letters before reading the manifest, carries sections for evidence-backed dissent and for critical rejections, names the orchestrator's model-family bias, and ends by presenting the synthesis without executing any step of the critiqued plan

#### Scenario: No command depends on the model CLIs
- **WHEN** none of the model CLIs is on the executable search path and `ctxr verify`, `ctxr doctor`, and `ctxr update` run
- **THEN** each behaves exactly as it does when the CLIs are present, and none names them

## MODIFIED Requirements

### Requirement: An owned skill names only affordances the CLI provides
Every contexture command and option a contexture-owned skill instructs SHALL be one the CLI registers. A long option named alongside a contexture command in a rendered owned skill SHALL resolve against the option table that command registers, and a skill naming an option no command accepts SHALL fail a check rather than ship. A skill MAY also instruct tools other than contexture — `git`, `gh`, `node`, or a model CLI a skill's own runner drives — and those tools' options are outside what this check resolves. The enforcing mechanism is a test over the rendered skill set that resolves each such option against the CLI's own registration, so a skill cannot outlive the affordance it documents.

#### Scenario: A skill naming a removed option fails the check
- **WHEN** an owned skill instructs a step by naming a contexture command together with a long option that command does not register
- **THEN** the check exits non-zero, naming the skill and the option

#### Scenario: A skill naming only registered options passes
- **WHEN** every long option an owned skill names alongside a contexture command is one that command registers
- **THEN** the check passes, and an option named for a tool other than contexture is outside what the check resolves

#### Scenario: The selector-required message offers only selectors the command accepts
- **WHEN** `ctxr publish gather` is invoked with no subject selector
- **THEN** it exits with the usage code and its message names exactly the selectors the command registers
