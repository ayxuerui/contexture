## ADDED Requirements

### Requirement: External workspace ownership disables worktree reclamation
When a store's configuration declares `session.workspaces_external: true`, `ctxr session reap` SHALL refuse to run, exiting non-zero and naming the configuration key as the reason, without inspecting or modifying any worktree. When the key is false or unset (the default), `ctxr session reap` SHALL behave exactly as it did before this key existed.

#### Scenario: Reap refuses under external ownership
- **WHEN** a store declares `session.workspaces_external: true` and `ctxr session reap` is run
- **THEN** the command exits non-zero, names `session.workspaces_external` as the reason, and neither removes a worktree nor deletes a branch

#### Scenario: Default behavior is unchanged
- **WHEN** a store declares no `session.workspaces_external` key (or declares it `false`) and `ctxr session reap` is run
- **THEN** it reaps merged, clean session worktrees exactly as it did before this key was introduced
