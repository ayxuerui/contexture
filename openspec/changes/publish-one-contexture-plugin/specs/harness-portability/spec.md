## MODIFIED Requirements

### Requirement: An MCP-rendered skill names only what the surface offers
A test over the shared skills SHALL fail, naming the skill and the term, when one names a tool the surface does not register, a `ctxr` command the surface's command-to-tool mapping neither routes nor marks unavailable, or a `git` or `gh` step whose sentence does not also name the tool that does it through the store's server. The tool names, allowlists and unavailable commands SHALL be read from the same definitions the server uses.

#### Scenario: An unmapped git step fails the check
- **WHEN** a shared skill instructs `git rebase -i` with no tool named beside it
- **THEN** the check exits non-zero naming that skill and the command

## REMOVED Requirements

### Requirement: Owned skills render for the MCP surface from the same source
**Reason**: The shared skills become one text for both surfaces, so there is no separate MCP render to require (publish-one-contexture-plugin D7).
**Migration**: Replaced by *The shared skills are one text on both surfaces*.

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

### Requirement: The shared skills are one text on both surfaces
The owned skills the plugin carries SHALL be one text, from one template, that an agent follows in a shell running `ctxr` or through the store's server's tools. Each SHALL open with one shared section saying how to tell the two apart and how a `ctxr` step, a path and a commit are done through the server. A store's copy and the plugin's copy SHALL differ only in store values, which the plugin names by placeholders. Skills that run local programs, land and derived-artifacts SHALL stay out of it.

#### Scenario: A store's copy and the plugin's copy differ only in values
- **WHEN** a shared skill is rendered for a store and for the plugin
- **THEN** replacing each of the store's values in the store's copy by its placeholder yields the plugin's copy

#### Scenario: The plugin carries no shell-only skill
- **WHEN** the plugin is built
- **THEN** it carries the capture skill with the shared section, and not the upgrade, second-opinion or land skills

