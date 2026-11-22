# Spec Delta

## ADDED Requirements

### Requirement: The server gives the OpenRouter key to a second opinion only
When `ctxr serve` runs a command for the `ctxr` or `ctxr_write` tool, it SHALL pass `OPENROUTER_API_KEY` from its own environment to a `second-opinion` command and SHALL withhold it from every other command. The key SHALL NOT appear in any tool result. The environment the server builds for the command is the mechanism, and a test runs a stub command that records its environment.

#### Scenario: A second opinion on the server can reach OpenRouter
- **WHEN** the server's environment sets the key, the served store routes one lineup entry through OpenRouter, and a member runs a critique through the `ctxr` tool
- **THEN** the stub endpoint receives that critic's request carrying the key, and the tool result does not contain the key

#### Scenario: Another command does not see the key
- **WHEN** the server's environment sets the key and a member calls `ctxr` with `["lint"]`, and `ctxr_write` with a writing command in their session
- **THEN** neither command's environment holds `OPENROUTER_API_KEY`

### Requirement: A member cannot choose a second opinion's route
Through the server, each lineup entry's route SHALL be resolved from the configuration of the commit being served and the server's own environment, as its model is. A call's arguments and a session's working copy SHALL NOT route an entry through OpenRouter, away from it, or to another address. The store root and environment the server gives the command enforce this, and a test covers it with stub CLIs and a stub endpoint.

#### Scenario: A session's unreviewed route is not used
- **WHEN** a member's session adds an OpenRouter slug to the lineup in its working copy and the member runs a critique through the `ctxr` tool naming that session
- **THEN** every critic is its model CLI, as the served commit's configuration resolves, and the stub endpoint receives no request
