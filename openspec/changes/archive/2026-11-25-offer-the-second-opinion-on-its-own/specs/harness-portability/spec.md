# Spec Delta

## ADDED Requirements

### Requirement: contexture publishes a plugin that carries only the second opinion
contexture's repository SHALL carry the Claude plugin `second-opinion` under `plugins/second-opinion/`, listed in the marketplace beside `contexture`. It SHALL carry the `ctxr-second-opinion` skill, as the `contexture` plugin carries it, one command `ask` that opens it, and no other skill, MCP server entry, credential or hook. `ctxr plugin build` SHALL write both plugins from one declared list, without reading a store.

#### Scenario: The plugin carries one skill
- **WHEN** `ctxr plugin build` runs outside any store
- **THEN** it writes `second-opinion/` with `skills/ctxr-second-opinion/SKILL.md` and `commands/ask.md`, no other skill, no MCP server entry, and the CLI's version

#### Scenario: A command that opens a missing skill fails
- **WHEN** the declared list gives the `second-opinion` plugin a command that opens `ctxr-capture`
- **THEN** the plugin-build check fails naming that plugin and command

#### Scenario: Both plugins carry the same skill text
- **WHEN** both plugins are built
- **THEN** `ctxr-second-opinion/SKILL.md` is byte-identical in the two

#### Scenario: The marketplace lists both
- **WHEN** the marketplace file is read
- **THEN** it lists `contexture` at `./plugins/contexture` and `second-opinion` at `./plugins/second-opinion`

### Requirement: The second-opinion skill names the server's tools
The rendered `ctxr-second-opinion` skill SHALL say which tool runs each `ctxr second-opinion` step through a server, that the plan goes in `plan` and the question in `prompt`, and that a run not ready in time returns an id which `second_opinion_result` fetches. The skill's own text SHALL NOT mention `@input` or an `input` field, and the shared opening section SHALL give them to `ctxr_write` alone. These are skill-markdown conventions, asserted by a test over the render and by the drift check.

#### Scenario: The rendered skill covers the tools
- **WHEN** the skill is rendered for the plugin
- **THEN** it names `second_opinion_preflight`, `second_opinion_critique`, `second_opinion_poll` and `second_opinion_result`, names the `plan` and `prompt` fields, and mentions `@input` once, in the opening section's sentence about `ctxr_write`

#### Scenario: The drift check passes on the move
- **WHEN** the drift check runs over the plugin's render of the second-opinion skill
- **THEN** it reports no finding: every `ctxr second-opinion` command the skill names is routed to a tool

## MODIFIED Requirements

### Requirement: The committed plugin is checked against the render
A test SHALL fail, naming the first differing file, when the committed `plugins/contexture/` or `plugins/second-opinion/` differs from what `ctxr plugin build` writes, or when either's version differs from the package's, so a skill change cannot merge without the plugins it changes.

#### Scenario: The committed plugin is current
- **WHEN** the test suite runs on a commit whose skills, preamble and version match the committed `plugins/contexture/` and `plugins/second-opinion/`
- **THEN** the freshness test passes

#### Scenario: A skill change without a regenerated plugin fails
- **WHEN** a skill template changes and `plugins/contexture/` is not regenerated
- **THEN** the freshness test fails naming the differing skill file

#### Scenario: The second plugin is checked too
- **WHEN** the second-opinion skill's template changes and `plugins/second-opinion/` is not regenerated
- **THEN** the freshness test fails naming that plugin's skill file
