## ADDED Requirements

### Requirement: Owned skills render for the MCP surface from the same source
The owned skills SHALL render for a second target, the MCP surface, alongside the CLI render, which SHALL be unchanged by it. The MCP render SHALL include a declared subset of the owned skills; the session-lifecycle and submit skills SHALL render from MCP-specific templates that share their entry conditions, anti-triggers and routes with the CLI templates through common partials, and every other included skill SHALL render from its CLI template with one shared preamble naming how each command and git step maps to the surface's tools. Skills that run local programs, the land skill and the derived-artifacts skill SHALL NOT be included.

#### Scenario: The CLI render is unchanged
- **WHEN** the owned skills are rendered for the CLI on a store before and after this rendering exists
- **THEN** the two renders are byte-identical

#### Scenario: A capture skill reaches the chat app
- **WHEN** the owned skills are rendered for the MCP surface
- **THEN** the capture skill is included with the shared preamble, the submit skill names `submit` rather than `git push`, and the upgrade and second-opinion skills are absent

### Requirement: An MCP-rendered skill names only what the surface offers
A test over the MCP render SHALL fail, naming the skill and the term, when an included skill names a tool the surface does not register, a `ctxr` subcommand outside the surface's two command allowlists, or a `git` or `gh` command the shared preamble does not map. The tool names and allowlists SHALL be read from the same definitions the server uses.

#### Scenario: An unmapped git step fails the check
- **WHEN** an included skill instructs `git rebase -i`
- **THEN** the check exits non-zero naming that skill and the command

### Requirement: `ctxr plugin build` writes the store's chat-app plugins
`ctxr plugin build` SHALL write, under an output directory that defaults to a path under the store's derived cache, a Claude plugin and a ChatGPT plugin, each as a directory and as an archive. Each SHALL carry the MCP render of the owned skills as `skills/<name>/SKILL.md` and an MCP server entry whose address is `serve.base_url` followed by `/mcp`, in that vendor's manifest format; neither SHALL carry a credential, a variable in the address, a hook, a local server or a top-level `bin/` directory. Manifest and readme text SHALL come from shipped templates. The plugin's name SHALL derive from the store's name and its version from the CLI's version and the rendered commit. The command SHALL exit with the configuration error code, writing nothing, when the store declares no `mcp` block.

#### Scenario: Both plugins are built
- **WHEN** `ctxr plugin build` runs on a store declaring `mcp` and `serve.base_url: https://ctx-a.example.test`
- **THEN** the output holds a Claude plugin whose `.mcp.json` names `https://ctx-a.example.test/mcp`, a ChatGPT plugin whose `mcp.json` names the same address with OAuth, both carrying the rendered skills, and an archive of each

#### Scenario: A store without the MCP surface has no plugin
- **WHEN** `ctxr plugin build` runs on a store with no `mcp` block
- **THEN** it exits with the configuration error code and writes nothing
