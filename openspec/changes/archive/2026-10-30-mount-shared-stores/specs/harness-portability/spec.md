## MODIFIED Requirements

### Requirement: Generated sections render in a fixed order
The entry document's contexture-managed sections SHALL render, on a freshly initialized store, in a fixed order: store fundamentals, mission (when configured), retrieval routing, capture, placement, shared stores (when the store declares any), store conventions, then the guidance index (when any document loads on demand). The shared-stores section SHALL name each declared mount and its location, and SHALL state that a write to a mounted store is a session started inside that mount, reviewed and landed by that store. On an existing store whose managed sections are contiguous (separated only by blank lines), `ctxr update` SHALL reorder them to match. When hand-written content interrupts that contiguity, `ctxr update` SHALL leave the existing section order unchanged rather than reordering around foreign content. It SHALL report this via `ctxr lint` as an observation, not as a `ctxr doctor` failure. `doctor` runs only invariant-severity checks (per store-integrity's own "observation checks never fail a run"), so a non-blocking finding is a `lint` finding by construction, never a `doctor` one.

#### Scenario: A first-time init writes sections in the fixed order
- **WHEN** `ctxr init` runs against a store with no existing `AGENTS.md`
- **THEN** the generated sections appear in the fixed order

#### Scenario: A drifted but contiguous store converges on update
- **WHEN** an existing store's managed sections are in a different order but are separated only by blank lines, and `ctxr update` runs
- **THEN** the sections are reordered to match the fixed order, and hand-written content outside every managed section is preserved unchanged

#### Scenario: Hand-written content between sections blocks reordering
- **WHEN** hand-written content sits between two managed sections and `ctxr update` runs
- **THEN** the existing order is left unchanged, and `ctxr lint` reports the interruption as an observation

#### Scenario: A store with mounts gets the shared-stores section after placement
- **WHEN** a store declares a `shared_stores` key and its entry document is generated
- **THEN** a shared-stores section naming each mount and its location appears after the placement section and before the store conventions section

#### Scenario: A store without mounts gets no shared-stores section
- **WHEN** a store has no `shared_stores` key and its entry document is generated
- **THEN** no shared-stores section appears, and the document is byte-identical to one generated before this section existed

### Requirement: Root resolution precedence
Any contexture command SHALL resolve the store root in this order: an explicit `--root` argument; the
store root found by walking up from the current working directory when that root is a linked git
worktree of the store named by the `CONTEXTURE_STORE_ROOT` environment variable; the store root found
by walking up from the current working directory when that root is a mount the named store declares
(per shared-stores), or a linked git worktree of such a mount; the
`CONTEXTURE_STORE_ROOT` environment variable; walking up from the current working directory looking
for `contexture.yaml`. If none resolves, the command SHALL exit non-zero naming that no store root
was found, and SHALL NOT guess a fallback location.

The worktree step SHALL be consulted only when `CONTEXTURE_STORE_ROOT` is set and no `--root`
argument was given, and SHALL redirect only to a checkout of the very store that variable names. The
mount step SHALL be consulted under the same conditions, and SHALL redirect only to a root located at,
or a worktree of, a mount location that the named store's configuration declares. When
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
- **WHEN** a command is invoked with no `--root` from inside a store, or a worktree of a store, that is a different repository than the one `CONTEXTURE_STORE_ROOT` names and is not a mount that store declares
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

#### Scenario: A command run inside a declared mount operates on the mount
- **WHEN** a command is invoked with no `--root` from inside `shared/ctx-b` of the store named by `CONTEXTURE_STORE_ROOT`, and that store declares the mount `ctx-b`
- **THEN** the command operates against the mounted store `ctx-b`, not the store the variable names

#### Scenario: An undeclared clone under the mount path does not redirect
- **WHEN** a command is invoked with no `--root` from inside a store located under `shared/` that the store named by `CONTEXTURE_STORE_ROOT` does not declare
- **THEN** the command operates against the store the variable names
