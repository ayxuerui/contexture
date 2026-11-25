# Spec Delta

## MODIFIED Requirements

### Requirement: The server's connect page tells a member how to add the plugin and this store's connector
When the MCP surface is configured, `ctxr serve` SHALL answer `GET /plugin/` with a page that names contexture's plugin marketplace and the plugin the member's scopes call for, how to install it with automatic updates, this store's connector address (`serve.base_url` followed by `/mcp`) and how to add it in each app, and a download of a ChatGPT plugin. For a member who holds any scope but `second-opinion`, the plugin SHALL be `contexture` and the download SHALL be this store's ChatGPT plugin built as `ctxr plugin build` builds it in the store. For a member who holds `second-opinion` alone, the plugin SHALL be `second-opinion` and the download SHALL carry the second-opinion skill only.

#### Scenario: A member reads how to connect
- **WHEN** a reader with a verified identity requests `/plugin/`
- **THEN** the page names the `contexture` marketplace and the `contexture` plugin, the store's `/mcp` address, and links the ChatGPT plugin's archive

#### Scenario: A second-opinion member is shown the small plugin
- **WHEN** a member who holds `second-opinion` alone requests `/plugin/` with a verified identity
- **THEN** the page names the `contexture-second-opinion` plugin and the store's `/mcp` address, and the archive it links carries no skill but `ctxr-second-opinion`

### Requirement: The second-opinion server's connect page names its plugin and connector
`ctxr second-opinion serve` SHALL answer `GET /plugin/`, for a verified identity its file admits, with a page that names contexture's marketplace and its `contexture-second-opinion` plugin for Claude, the server's connector address (`base_url` followed by `/mcp`) and how to add it in each app, and a download of a ChatGPT plugin that carries the second-opinion skill and that connector.

#### Scenario: A member reads how to connect
- **WHEN** a member the file admits requests `/plugin/` with a verified identity
- **THEN** the page names the `contexture-second-opinion` plugin and the server's `/mcp` address, and links a ChatGPT archive whose only skill is `ctxr-second-opinion`

#### Scenario: The page needs a verified member
- **WHEN** `/plugin/` is requested without an identity assertion, or with a verified email the file does not admit
- **THEN** it is refused
