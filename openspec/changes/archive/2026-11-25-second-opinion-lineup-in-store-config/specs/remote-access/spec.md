# Spec Delta

## ADDED Requirements

### Requirement: A second opinion through the server uses the served store's lineup
When the `ctxr` tool runs a second opinion, the command SHALL resolve its lineup from the configuration of the commit the server is serving, whether or not the call names a session: a session's working copy SHALL NOT choose the model. The server's own lineup environment variables SHALL still win. The tool enforces this by the store root it gives the command, and a test covers it with stub CLIs.

#### Scenario: The served lineup reaches a chat member
- **WHEN** the store served at its current commit configures a model for one CLI, and a member runs a critique through the `ctxr` tool
- **THEN** that CLI is asked for the configured model

#### Scenario: A session's unreviewed lineup is not used
- **WHEN** a member's session changes the lineup in its working copy and the member runs a critique through the `ctxr` tool naming that session
- **THEN** each CLI is asked for the model the served commit's configuration resolves to

#### Scenario: The operator's environment still wins on the server
- **WHEN** the server's environment names a model for a CLI and the served configuration names a different one
- **THEN** the CLI is asked for the environment's model
