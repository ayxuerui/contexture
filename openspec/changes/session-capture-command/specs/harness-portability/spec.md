## Purpose

Extends the harness-portability capability (see `owned-skills-expansion`): the session-capture skill drives the capture command.

## ADDED Requirements

### Requirement: The session-capture skill applies through the command
The owned session-capture skill SHALL instruct the agent to write the approved items to a proposal file and run `ctxr session capture --proposal <file>`, to take its report from the command's output, and SHALL name the identity files by their resolved paths. It SHALL NOT instruct direct edits to identity files or any harness-specific memory mechanism.

#### Scenario: Skill names resolved identity paths
- **WHEN** a store binds the user-facts role to a custom path
- **THEN** the rendered skill names that path in its proposal template

#### Scenario: Skill applies via the command
- **WHEN** an agent follows the rendered skill's Apply step
- **THEN** the only write instruction is the capture command, and the report step references its output
