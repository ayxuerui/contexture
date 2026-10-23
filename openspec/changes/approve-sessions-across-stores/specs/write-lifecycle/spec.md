## ADDED Requirements

### Requirement: A session can join a session in the store that mounts this one
`ctxr session start --joins <session>` SHALL, when run in a mounted store, start a session that belongs to the
session `<session>` of the store that mounts it. `<session>` SHALL name a live session of the mounting store by its
worktree name or branch. The joined session's branch SHALL be this store's session branch prefix, then the mounting
store's repository name, then the home session's branch without its prefix, so
that sessions homed in different stores never collide in a store many people mount. The command SHALL refuse,
naming the reason and creating nothing, when the store it runs in is not a mount the session's store declares, or
when no live session of that store matches `<session>`.

A session's identity SHALL be the home store's repository and the home session's branch. The command SHALL write
the identity into the session worktree and report it, and SHALL report it for a session started without
`--joins`, which is its own home. Branch names SHALL NOT be used to group a session's pull requests; the session
marker does that.

#### Scenario: A joined session's branch names its home
- **WHEN** store `ctx-a` has the session `session/20261023-0700-ctx-move` and mounts `ctx-b`, and `ctxr session
  start --joins session/20261023-0700-ctx-move` runs inside `shared/ctx-b`
- **THEN** a session worktree is created in `ctx-b` on the branch `session/ctx-a/20261023-0700-ctx-move`, and the
  command reports the session as `ctx-a`'s repository with the branch `session/20261023-0700-ctx-move`

#### Scenario: Joining from a store that is not a mount is refused
- **WHEN** `ctxr session start --joins <session>` runs in a store that the session's store does not declare as a mount
- **THEN** the command exits non-zero, names the reason, and creates no worktree or branch

### Requirement: Every pull request of a session carries the session
A pull request opened from a session SHALL carry a session marker in its body naming the session's identity, read
from the identity `ctxr session start` wrote into the worktree. A pull request whose body carries no well-formed
marker SHALL be treated as a session of its own, made of that pull request alone. To list a session, its open parts
SHALL be found on the forge: every open pull request on the home store or on a store it mounts whose marker names
the session. Once a session is decided, the parts its decision names SHALL be authoritative for landing (per
change-approval), whatever the forge's open pull requests say later.

#### Scenario: A pull request without a marker is its own session
- **WHEN** an open session pull request on `ctx-b` carries no session marker
- **THEN** it is listed, decided and landed as a session containing only itself

#### Scenario: The parts of a session are found across stores
- **WHEN** `ctx-a`'s pull request and `ctx-b`'s pull request both carry the marker for `ctx-a`'s session
  `session/20261023-0700-ctx-move`
- **THEN** both are reported as the two parts of that session

### Requirement: A session is landed by its home store, mounted parts first
`ctxr land --pending` in a store SHALL land each approved session whose home is that store: first every part the
decision names in a mounted store, each landed in that mount's clone under that mount's own configuration
(resolver, consent check, landing commits), then the home store's part. A part found already merged SHALL count as
landed. The home part SHALL NOT be attempted until every mounted part the decision names has merged. When a
mounted part cannot be landed, or the decision names a part that is closed without merging, the run SHALL leave the
later parts open and report the session as `blocked`, naming that part and why.

`ctxr land --pending` in a store SHALL NOT land a pull request whose session marker names a home in another store.
That pull request is landed by its home.

#### Scenario: One sweep lands the mounted part, then the home part
- **WHEN** a session homed in `ctx-a` is approved with an open part on `ctx-b`, which `ctx-a` mounts, and one on
  `ctx-a`, and `ctxr land --pending` runs in `ctx-a`
- **THEN** `ctx-b`'s part is merged first, then `ctx-a`'s, in that run

#### Scenario: A mounted store leaves a session homed elsewhere to its home
- **WHEN** `ctxr land --pending` runs in `ctx-b` and an approved pull request there carries the marker of a session
  homed in `ctx-a`
- **THEN** the run does not land it

#### Scenario: A closed mounted part blocks the home part
- **WHEN** the decision names a part on `ctx-b` that was then closed without merging
- **THEN** `ctx-a`'s part is not landed, and the session is reported `blocked`, naming the closed part

#### Scenario: A part merged by another lander counts as landed
- **WHEN** a session's part on `ctx-b` was merged before the run reached it
- **THEN** the run counts it as landed and goes on to the home part

### Requirement: A whole session lands in order on one explicit go
`ctxr land --session <session> --confirm`, run in the session's home store, SHALL land every part of the session in
the order and under the rules of the home store's landing above, with each part landed as `ctxr land <pr>
--confirm` lands a pull request in its own store. A part found already merged SHALL count as landed. The command
SHALL stop at the first part it cannot land, leave every later part open, and report which parts landed, which one
stopped it and why, and which were not attempted.

#### Scenario: A session lands mounted part first
- **WHEN** `ctxr land --session session/20261023-0700-ctx-move --confirm` runs in `ctx-a` for a session with an
  open part on `ctx-b` and one on `ctx-a`
- **THEN** `ctx-b`'s part is merged before `ctx-a`'s, and both are reported as landed

#### Scenario: A conflict in the mounted part stops the session
- **WHEN** `ctx-b`'s part of the session cannot be landed because of a conflict
- **THEN** `ctx-a`'s part is not attempted and stays open, and the command reports `ctx-b`'s part as the one that
  stopped it, with the conflict
