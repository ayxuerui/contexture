## ADDED Requirements

### Requirement: The server instructions give this store's values
The instructions `serve` returns at `initialize` SHALL include a section naming this store's value for every placeholder the MCP render of the owned skills uses — paths, default branch, cluster depth, mission size, the taxonomy's layers with their descriptions and the relation vocabulary — rendered from the configuration the server last loaded, and the server's CLI version.

#### Scenario: A skill's placeholder resolves
- **WHEN** a client initializes against a store whose inbox path is `raw/inbox/`
- **THEN** the instructions' store section gives `raw/inbox/` for the inbox path placeholder, and the server's CLI version

#### Scenario: A configuration change shows on the next connection
- **WHEN** the store's configuration changes its log path and the server reloads it
- **THEN** the next `initialize` gives the new log path

### Requirement: The server's connect page tells a member how to add the plugin and this store's connector
When the MCP surface is configured, `ctxr serve` SHALL answer `GET /plugin/` with a page that names contexture's plugin marketplace and plugin for Claude and how to install it with automatic updates, this store's connector address (`serve.base_url` followed by `/mcp`) and how to add it in each app, and a download of this store's ChatGPT plugin built as `ctxr plugin build` builds it in the store.

#### Scenario: A member reads how to connect
- **WHEN** a member with a verified identity requests `/plugin/`
- **THEN** the page names the marketplace and the `contexture` plugin, the store's `/mcp` address, and links the ChatGPT plugin's archive

### Requirement: The connect page admits only the store's members
The `/plugin/` routes SHALL require the verified identity assertion the approval routes require, SHALL refuse a verified identity the `mcp` block admits to no scope, and SHALL be absent when the MCP surface is not configured.

#### Scenario: The page needs a verified identity
- **WHEN** `/plugin/` is requested without an identity assertion
- **THEN** it is refused as the approval routes refuse it

#### Scenario: A verified non-member gets no page
- **WHEN** `/plugin/` is requested with a verified identity that `mcp.readers`, `mcp.capturers` and `mcp.editors` all leave out
- **THEN** it is refused

## REMOVED Requirements

### Requirement: Members download the store's plugins from the server
**Reason**: The Claude plugin is now contexture's own, installed from its marketplace; the page tells members how, instead of serving a per-store Claude archive.
**Migration**: Replaced by *The server's connect page tells a member how to add the plugin and this store's connector*.
