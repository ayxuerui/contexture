## ADDED Requirements

### Requirement: A session can join a session in the store that mounts this one
`ctxr session start --joins <session>` SHALL, when run in a mounted store, start a session that belongs to the
session `<session>` of the store that mounts it. `<session>` SHALL name a live session of the mounting store by its
worktree name or branch. The joined session's branch SHALL be this store's session branch prefix, then the home
store's forge repository slug (`owner/repo`), then the home session's branch without its prefix, so that sessions
homed in different stores never collide in a store many people mount. The command SHALL refuse,
naming the reason and creating nothing, when the store it runs in is not a mount the session's store declares, or
when no live session of that store matches `<session>`.

A session's identity SHALL be the home store's forge repository slug and the home session's branch as the session
started it. It SHALL be derivable from the session's own worktree, branch and repository alone, with no identity
file, and SHALL survive `ctxr session submit --branch` renaming the branch. A joined session's worktree directory
SHALL be named this store's branch prefix as a directory name, then the home owner, `--`, the home repository,
`--`, and the home branch without its prefix (`session-<owner>--<repo>--<tail>`); a joined branch carries the same
home. Any other session is its own home, and its worktree directory name spells the branch it started on. The
command SHALL report the identity. Branch names SHALL NOT be used to group a session's pull requests; the session
marker does that.

#### Scenario: A joined session's branch names its home
- **WHEN** store `ctx-a` has the session `session/20261023-0700-ctx-move` and mounts `ctx-b`, and `ctxr session
  start --joins session/20261023-0700-ctx-move` runs inside `shared/ctx-b`
- **THEN** a session worktree is created in `ctx-b` on the branch `session/example/ctx-a/20261023-0700-ctx-move`,
  where `example/ctx-a` is `ctx-a`'s forge slug, and the command reports the session as `example/ctx-a` with the
  branch `session/20261023-0700-ctx-move`

#### Scenario: A renamed joined branch keeps its session
- **WHEN** the joined session of `ctx-b` above is submitted with `--branch notes/move`, renaming its branch
- **THEN** its worktree is still named `session-example--ctx-a--20261023-0700-ctx-move`, and its identity is still
  `example/ctx-a` with the branch `session/20261023-0700-ctx-move`

#### Scenario: Joining from a store that is not a mount is refused
- **WHEN** `ctxr session start --joins <session>` runs in a store that the session's store does not declare as a mount
- **THEN** the command exits non-zero, names the reason, and creates no worktree or branch

### Requirement: Every pull request of a session carries the session
A pull request opened from a session SHALL carry a session marker in its body naming the session's identity, in
the same form the joined branch uses (the home forge slug and the home branch). `ctxr session submit` SHALL append
the marker to the body it composes, after the sections it generates, with the session's identity as above, read
before the command renames the branch. It SHALL refuse an agent-written body that already contains a session
marker, naming it, so that only the command writes one.

A pull request whose body carries no well-formed marker SHALL be treated as a session of its own, made of that
pull request alone, homed in the store it is on. To list a session, its open parts SHALL be found on the forge:
every open pull request on the home store or on a store it mounts whose marker names the session. Once a session is
decided, the parts its decision names SHALL be authoritative for landing (per change-approval), whatever the
forge's open pull requests say later.

A store that declares no `shared_stores` SHALL treat its own pull requests exactly as it did before this change,
whether or not they carry a marker: each is listed, decided and landed on its own. Only a pull request whose marker
names a home in another store is read as a session part there, and it is left to its home.

#### Scenario: Submit marks the pull request with its session
- **WHEN** `ctxr session submit` runs in the joined session `session/example/ctx-a/20261023-0700-ctx-move` of `ctx-b`
- **THEN** the pull request's body ends with a session marker naming `example/ctx-a` and
  `session/20261023-0700-ctx-move`

#### Scenario: A body carrying its own marker is refused
- **WHEN** the body given to `ctxr session submit` already contains a session marker
- **THEN** the command refuses, naming the marker, and opens or updates no pull request

#### Scenario: A store with no mounts behaves as before
- **WHEN** `ctx-a` declares no `shared_stores`, and its open pull request carries a marker naming `ctx-a`'s own session
- **THEN** it is listed, decided and landed exactly as a pull request without a marker is

#### Scenario: A pull request without a marker is its own session
- **WHEN** an open session pull request on `ctx-b` carries no session marker
- **THEN** it is listed, decided and landed as a session containing only itself, on `ctx-b`'s own page; a store
  that mounts `ctx-b` lists it among sessions homed elsewhere, naming `ctx-b`, and offers no decision

#### Scenario: The parts of a session are found across stores
- **WHEN** `ctx-a`'s pull request and `ctx-b`'s pull request both carry the marker for `ctx-a`'s session
  `session/20261023-0700-ctx-move`
- **THEN** both are reported as the two parts of that session

### Requirement: A session is landed by its home store, mounted parts first
`ctxr land --pending` in a store SHALL land each approved session whose home is that store: first every part the
decision names in a mounted store, each landed in that mount's clone under that mount's own configuration
(resolver, consent check, landing commits), then the home store's part. A part found already merged SHALL count as
landed. Before landing a mounted part, the run SHALL bring that mount's clone up to date by the canonical-sync
rule, so the mount's configuration is its current one; a mount it cannot bring up to date SHALL leave the part for
the next run. The home part SHALL NOT be attempted until every mounted part the decision names has merged.

When the decision names a part that is closed without merging, the run SHALL report the session as `blocked`,
naming that part, and SHALL leave every unlanded part open until a person acts. Any other reason a part cannot land
this run (a push the forge rejected, an unreachable forge, a mount clone it could not bring up to date) SHALL leave
the later parts open and report the session as `retrying`, naming the part and why; the next run SHALL try again.
The run SHALL record `retrying` on the record part as a landing record by the recording login, as a block is
recorded, naming the part and why, so that `ctxr review list` reports it between runs. The record SHALL stop
counting once that part has merged.
A conflict SHALL go to the mount's or the home's configured resolver and back for re-approval, as for a single pull
request. Each run SHALL compute the state afresh.

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

#### Scenario: A rejected push is retried, not blocked
- **WHEN** the forge rejects the push of `ctx-b`'s part during a run
- **THEN** `ctx-a`'s part is not landed, the session is reported `retrying` naming `ctx-b`'s part, and the next run
  tries again

#### Scenario: A rejected push is reported between runs
- **WHEN** the forge rejected the push of `ctx-b`'s part and no part has merged yet
- **THEN** `ctxr review list` in `ctx-a` reports both parts as `retrying`, naming `ctx-b`'s part and the rejected push

#### Scenario: A part merged by another lander counts as landed
- **WHEN** a session's part on `ctx-b` was merged before the run reached it
- **THEN** the run counts it as landed and goes on to the home part

### Requirement: A whole session lands in order on one explicit go
`ctxr land --session <session> --confirm`, run in the session's home store, SHALL land every part of the session in
the order and under the rules of the home store's landing above, with each part landed as `ctxr land <pr>
--confirm` lands a pull request in its own store. A part found already merged SHALL count as landed. The command
SHALL stop at the first part it cannot land, leave every later part open, and report which parts landed, which one
stopped it and why, and which were not attempted. `--session` SHALL require `--confirm`: without it the command
SHALL refuse with a usage error and land nothing. A session approved on the approval page SHALL be landed by
`ctxr land --pending`, which reads the session's decision itself.

#### Scenario: A session without an explicit go is refused
- **WHEN** `ctxr land --session session/20261023-0700-ctx-move` runs in `ctx-a` without `--confirm`
- **THEN** the command exits with a usage error and lands nothing

#### Scenario: A session lands mounted part first
- **WHEN** `ctxr land --session session/20261023-0700-ctx-move --confirm` runs in `ctx-a` for a session with an
  open part on `ctx-b` and one on `ctx-a`
- **THEN** `ctx-b`'s part is merged before `ctx-a`'s, and both are reported as landed

#### Scenario: A conflict in the mounted part stops the session
- **WHEN** `ctx-b`'s part of the session cannot be landed because of a conflict
- **THEN** `ctx-a`'s part is not attempted and stays open, and the command reports `ctx-b`'s part as the one that
  stopped it, with the conflict
