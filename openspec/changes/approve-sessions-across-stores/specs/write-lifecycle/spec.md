## ADDED Requirements

### Requirement: A session can join a session in the store that mounts this one
`ctxr session start --joins <session>` SHALL, when run in a mounted store, start a session that belongs to the
session `<session>` of the store that mounts it. `<session>` SHALL name a live session of the mounting store by its
worktree name or branch. The joined session's branch SHALL be the home session's branch name, so the parts of one
session share one branch name in every store. The command SHALL refuse, naming the reason and creating nothing,
when the store it runs in is not a mount the session's store declares, when no live session of that store matches
`<session>`, or when this store already has a session with that branch name.

A session's identity SHALL be the home store's repository and the home session's branch. The command SHALL report
it, and SHALL report it for a session started without `--joins`, which is its own home.

#### Scenario: A joined session takes the home session's branch
- **WHEN** store `ctx-a` has the session `session/20261023-0700-ctx-move` and mounts `ctx-b`, and `ctxr session
  start --joins session/20261023-0700-ctx-move` runs inside `shared/ctx-b`
- **THEN** a session worktree is created in `ctx-b` on the branch `session/20261023-0700-ctx-move`, and the command
  reports the session as `ctx-a`'s repository with that branch

#### Scenario: Joining from a store that is not a mount is refused
- **WHEN** `ctxr session start --joins <session>` runs in a store that the session's store does not declare as a mount
- **THEN** the command exits non-zero, names the reason, and creates no worktree or branch

### Requirement: Every pull request of a session carries the session
A pull request opened from a session SHALL carry a session marker in its body naming the session's identity.
`ctxr session start` SHALL write the identity into the session worktree, and the submit procedure SHALL put the
marker in the pull request body. A pull request whose body carries no well-formed marker SHALL be treated as a
session of its own, made of that pull request alone. A session's pull requests SHALL be found on the forge: every
open pull request on the home store or on a store it mounts whose marker names the session.

#### Scenario: A pull request without a marker is its own session
- **WHEN** an open session pull request on `ctx-b` carries no session marker
- **THEN** it is listed, decided and landed as a session containing only itself

#### Scenario: The parts of a session are found across stores
- **WHEN** `ctx-a`'s pull request and `ctx-b`'s pull request both carry the marker for `ctx-a`'s session
  `session/20261023-0700-ctx-move`
- **THEN** both are reported as the two parts of that session

### Requirement: Landing holds a home pull request until the session's parts in mounted stores have merged
`ctxr land`, for a pull request that carries consent and belongs to a session with parts in stores that its store
mounts, SHALL land it only when every such part has merged. Until then it SHALL leave the pull request open, report
it as `waiting`, and name the parts it waits for. A part in a mounted store SHALL be landed by that store's own
landing, not by the home store's credential. A landing sweep SHALL NOT report `waiting` as a failure.

#### Scenario: The home part waits for the mounted part
- **WHEN** a session has an approved pull request on `ctx-a` and an approved, still-open pull request on `ctx-b`,
  which `ctx-a` mounts, and `ctxr land --pending` runs in `ctx-a`
- **THEN** `ctx-a`'s pull request stays open, is reported as `waiting` on `ctx-b`'s, and the run exits zero

#### Scenario: The home part lands after the mounted part merges
- **WHEN** `ctx-b`'s part of that session has merged and `ctxr land --pending` runs in `ctx-a`
- **THEN** `ctx-a`'s pull request is landed

### Requirement: A whole session lands in order on one explicit go
`ctxr land --session <session> --confirm`, run in the session's home store, SHALL land every open pull request of
the session: first each part in a mounted store, from that mount, then the home store's part. Each part SHALL be
landed exactly as `ctxr land <pr> --confirm` lands a pull request in its own store. The command SHALL stop at the
first part it cannot land, leave every later part open, and report which parts landed, which one stopped it and
why, and which were not attempted.

#### Scenario: A session lands mounted part first
- **WHEN** `ctxr land --session session/20261023-0700-ctx-move --confirm` runs in `ctx-a` for a session with an
  open part on `ctx-b` and one on `ctx-a`
- **THEN** `ctx-b`'s part is merged before `ctx-a`'s, and both are reported as landed

#### Scenario: A conflict in the mounted part stops the session
- **WHEN** `ctx-b`'s part of the session cannot be landed because of a conflict
- **THEN** `ctx-a`'s part is not attempted and stays open, and the command reports `ctx-b`'s part as the one that
  stopped it, with the conflict
