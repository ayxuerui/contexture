## MODIFIED Requirements

### Requirement: Root resolution precedence
Any contexture command SHALL resolve the store root in this order: an explicit `--root` argument; the
store root found by walking up from the current working directory when that root is a linked git
worktree of the store named by the `CONTEXTURE_STORE_ROOT` environment variable; the
`CONTEXTURE_STORE_ROOT` environment variable; walking up from the current working directory looking
for `contexture.yaml`. If none resolves, the command SHALL exit non-zero naming that no store root
was found, and SHALL NOT guess a fallback location.

The worktree step SHALL be consulted only when `CONTEXTURE_STORE_ROOT` is set and no `--root`
argument was given, and SHALL redirect only to a checkout of the very store that variable names. When
the store root found from the current directory belongs to a different repository than the one the
variable names, the variable SHALL resolve unchanged. The step SHALL be decided from the filesystem
without invoking git, and SHALL fall back to resolving the variable whenever it cannot decide.

#### Scenario: Explicit argument overrides an inherited environment variable
- **WHEN** a command is invoked with `--root /path/a` while `CONTEXTURE_STORE_ROOT=/path/b` is set in the environment
- **THEN** the command operates against `/path/a`

#### Scenario: An explicit argument overrides the worktree the caller is standing in
- **WHEN** a command is invoked with `--root <store>` from inside a linked worktree of that same store, with `CONTEXTURE_STORE_ROOT` set
- **THEN** the command operates against the named root and the worktree step does not redirect it

#### Scenario: A command run from a session worktree operates on that worktree
- **WHEN** a command is invoked with no `--root` from inside a linked git worktree of the store named by `CONTEXTURE_STORE_ROOT`, and that worktree carries its own `contexture.yaml`
- **THEN** the command operates against the worktree rather than against the store the variable names

#### Scenario: The environment variable still pins across different stores
- **WHEN** a command is invoked with no `--root` from inside a store, or a worktree of a store, that is a different repository than the one `CONTEXTURE_STORE_ROOT` names
- **THEN** the command operates against the store the variable names

#### Scenario: The main working tree does not redirect to itself
- **WHEN** a command is invoked with no `--root` from inside the main working tree of the store named by `CONTEXTURE_STORE_ROOT`
- **THEN** the command operates against the store the variable names

#### Scenario: A worktree is recognized without invoking git
- **WHEN** root resolution decides whether the current directory's store is a linked worktree of the named store
- **THEN** it reads only the filesystem, invoking no git subprocess, and resolves the environment variable unchanged when the question cannot be decided

#### Scenario: No root resolves
- **WHEN** a command is invoked with no `--root`, no `CONTEXTURE_STORE_ROOT`, and no `contexture.yaml` found by walking up from the current directory
- **THEN** the command exits non-zero with a message naming that no store root was found, and performs no store operation

#### Scenario: Store creation is never redirected into an existing worktree
- **WHEN** `ctxr init` is invoked from inside a linked worktree of the store named by `CONTEXTURE_STORE_ROOT`
- **THEN** it resolves its root by its own rule — `--root`, then the variable, then the current directory — and the worktree step does not apply
