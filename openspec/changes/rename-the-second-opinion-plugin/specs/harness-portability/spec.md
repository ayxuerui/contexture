# Spec Delta

## MODIFIED Requirements

### Requirement: The committed plugin is checked against the render
A test SHALL fail, naming the first differing file, when the committed `plugins/contexture/` or `plugins/contexture-second-opinion/` differs from what `ctxr plugin build` writes, or when either's version differs from the package's, so a skill change cannot merge without the plugins it changes.

#### Scenario: The committed plugin is current
- **WHEN** the test suite runs on a commit whose skills, preamble and version match the committed `plugins/contexture/` and `plugins/contexture-second-opinion/`
- **THEN** the freshness test passes

#### Scenario: A skill change without a regenerated plugin fails
- **WHEN** a skill template changes and `plugins/contexture/` is not regenerated
- **THEN** the freshness test fails naming the differing skill file

#### Scenario: The second plugin is checked too
- **WHEN** the second-opinion skill's template changes and `plugins/contexture-second-opinion/` is not regenerated
- **THEN** the freshness test fails naming that plugin's skill file

### Requirement: contexture publishes a plugin that carries only the second opinion
contexture's repository SHALL carry the Claude plugin `contexture-second-opinion` under `plugins/contexture-second-opinion/`, listed in the marketplace beside `contexture`. It SHALL carry the `ctxr-second-opinion` skill, as the `contexture` plugin carries it, one command `ask` that opens it, and no other skill, MCP server entry, credential or hook. `ctxr plugin build` SHALL write both plugins from one declared list, without reading a store.

#### Scenario: The plugin carries one skill
- **WHEN** `ctxr plugin build` runs outside any store
- **THEN** it writes `contexture-second-opinion/` with `skills/ctxr-second-opinion/SKILL.md` and `commands/ask.md`, no other skill, no MCP server entry, and the CLI's version

#### Scenario: A command that opens a missing skill fails
- **WHEN** the declared list gives the `contexture-second-opinion` plugin a command that opens `ctxr-capture`
- **THEN** the plugin-build check fails naming that plugin and command

#### Scenario: Both plugins carry the same skill text
- **WHEN** both plugins are built
- **THEN** `ctxr-second-opinion/SKILL.md` is byte-identical in the two

#### Scenario: The marketplace lists both
- **WHEN** the marketplace file is read
- **THEN** it lists `contexture` at `./plugins/contexture` and `contexture-second-opinion` at `./plugins/contexture-second-opinion`
