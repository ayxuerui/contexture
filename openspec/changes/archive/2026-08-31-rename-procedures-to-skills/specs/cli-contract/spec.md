## MODIFIED Requirements

### Requirement: Every shipped instruction to run a command names `ctxr`
Every surface the tool writes or ships that instructs a human or an agent to run a command — the generated sections of the canonical entry document, shipped skill seeds, generated harness-owned skill copies, installed git hooks and their diagnostic messages, and command error and check messages — SHALL name the executable as `ctxr`. No such surface SHALL instruct the reader to run `contexture <command>`.

#### Scenario: A freshly initialized store carries no stale invocation
- **WHEN** a store is initialized and its entry document, skill seeds, hooks, and skill copies are generated
- **THEN** every command invocation in those files names `ctxr`, and none names `contexture` as the executable

#### Scenario: An existing store's generated surfaces converge on regeneration
- **WHEN** `init` reconciles an already-initialized store whose generated regions and hooks were written by a release that named the executable `contexture`
- **THEN** the generated regions are rewritten to name `ctxr`, and the hook-health check reports the previously installed hooks as stale and rewrites them
