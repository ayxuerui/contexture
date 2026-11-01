## MODIFIED Requirements

### Requirement: Owned skills render for the MCP surface from the same source
The owned skills SHALL render for a second target, the MCP surface, alongside the CLI render, which SHALL be unchanged by it. The MCP render SHALL include a declared subset of the owned skills; every included skill SHALL render from its CLI template with one shared preamble naming how each command and git step maps to the surface's tools. The MCP render SHALL take no store configuration: each value the CLI render takes from `contexture.yaml` SHALL render as a named placeholder, and the preamble SHALL state that each placeholder's value is given in the connector's instructions. The upgrade, Circleback and second-opinion skills, which run local programs, the land skill and the derived-artifacts skill SHALL NOT be included.

#### Scenario: The CLI render is unchanged
- **WHEN** the owned skills are rendered for the CLI on a store before and after this rendering exists
- **THEN** the two renders are byte-identical

#### Scenario: A capture skill reaches the chat app
- **WHEN** the owned skills are rendered for the MCP surface
- **THEN** the capture skill is included with the shared preamble, the submit skill's text equals the CLI render's under the preamble apart from its placeholders, and the upgrade, second-opinion and land skills are absent

#### Scenario: Two stores render one plugin
- **WHEN** the owned skills are rendered for the MCP surface
- **THEN** the render takes no configuration, carries a named placeholder wherever the CLI render substitutes a store value, and contains no path, layer name or relation name from the shipped defaults

## REMOVED Requirements

### Requirement: `ctxr plugin build` writes the store's chat-app plugins
**Reason**: The plugin is contexture's, not a store's; a per-store plugin cannot update itself on a personal plan without exposing the store's repository (publish-one-contexture-plugin D1).
**Migration**: Replaced by *contexture publishes one plugin for every store*. `ctxr plugin build` keeps its name and builds the general plugin.

## ADDED Requirements

### Requirement: contexture publishes one plugin for every store
contexture's repository SHALL carry the Claude plugin `contexture` under `plugins/contexture/`, generated from the MCP render and listed by `.claude-plugin/marketplace.json` at its root. Its `version` SHALL equal the CLI's, and it SHALL carry no MCP server entry, credential, hook, local server or top-level `bin/` directory. `ctxr plugin build` SHALL write it without reading a store, and in a store that declares `mcp` also that store's ChatGPT plugin, with its connector.

#### Scenario: The plugin carries no connector
- **WHEN** `ctxr plugin build` runs outside any store
- **THEN** it writes the Claude plugin with the rendered skills and no MCP server entry, its version is the CLI's version, and no ChatGPT plugin is written

### Requirement: The committed plugin is checked against the render
A test SHALL fail, naming the first differing file, when the committed `plugins/contexture/` differs from what `ctxr plugin build` writes, or when its version differs from the package's, so a skill change cannot merge without the plugin it changes.

#### Scenario: The committed plugin is current
- **WHEN** the test suite runs on a commit whose skills, preamble and version match the committed `plugins/contexture/`
- **THEN** the freshness test passes

#### Scenario: A skill change without a regenerated plugin fails
- **WHEN** a skill template changes and `plugins/contexture/` is not regenerated
- **THEN** the freshness test fails naming the differing skill file

### Requirement: The plugin's commands open its skills
The plugin SHALL carry a command for each entry of a declared map from command name to included skill. Each command's body SHALL be its skill's MCP render followed by the person's arguments; and its description SHALL mark it as a typed shortcut. A test SHALL fail, naming the command, when its skill is not one the plugin carries or its body differs from that skill's render.

#### Scenario: A command opens its skill
- **WHEN** the plugin is built
- **THEN** `commands/submit.md` carries the `ctxr-submit` render and a description beginning as a typed shortcut, and no frontmatter key beyond `description`

#### Scenario: A command naming a missing skill fails
- **WHEN** the command map names a skill the plugin does not include
- **THEN** the check fails naming that command

### Requirement: In a checkout, the plugin's skills defer to the store's own
The MCP render's preamble SHALL begin by telling an agent that a working directory with a `contexture.yaml` at its root and a shell that runs `ctxr` is a checkout, where it invokes the un-namespaced `ctxr-<name>` skill from the store's skills folder and never the plugin's `contexture:`-namespaced one. A test over the render SHALL assert that this rule, so worded, is the preamble's first.

#### Scenario: The checkout rule comes first
- **WHEN** the MCP render is produced
- **THEN** the first section of every included skill's preamble is the checkout rule

