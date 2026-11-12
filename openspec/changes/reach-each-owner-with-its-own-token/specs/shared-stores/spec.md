## ADDED Requirements

### Requirement: A repository whose owner has a token is reached with that token
When `CONTEXTURE_GITHUB_OWNER_TOKENS_DIR` names a directory and a file in it is named after a github.com
repository's owner, compared without regard to case, every `gh` call and remote git operation a command makes for
that repository outside GitHub App mode SHALL use the file's text, trimmed, as its token. The owner SHALL be read
from the repository's `origin`, or from a mount's declared URL before it is cloned. Without such a file, the
credential SHALL be unchanged.

#### Scenario: A mount owned by another owner is reached with that owner's token
- **WHEN** the store's repository is owned by `ctx-a-owner`, the mount `ctx-b` is owned by `ctx-b-org`, and the
  directory holds a file `ctx-b-org`
- **THEN** every forge call and remote git operation for `ctx-b` uses the token in `ctx-b-org`, and the store's
  own calls use `gh`'s own credential

#### Scenario: The owner's name is matched without regard to case
- **WHEN** the mount's URL names the owner `CTX-B-Org` and the directory holds a file `ctx-b-org`
- **THEN** the mount is reached with the token in `ctx-b-org`

#### Scenario: Without the variable nothing changes
- **WHEN** `CONTEXTURE_GITHUB_OWNER_TOKENS_DIR` is not set
- **THEN** no directory is read, and every command authenticates exactly as it did before this requirement

#### Scenario: An owner with no file keeps today's credential
- **WHEN** the directory holds no file for a repository's owner
- **THEN** that repository is reached with `gh`'s own credential and whatever credential git already has

### Requirement: An unusable owner token setup fails before any forge call
A command SHALL exit with the setup/usage code, before any forge call, when `CONTEXTURE_GITHUB_OWNER_TOKENS_DIR` is
set and is not a readable directory (naming the variable), when the file for a repository's owner cannot be read or
is empty after trimming (naming the file's path), or when two files' names differ only by case (naming both).

#### Scenario: An empty token file is refused
- **WHEN** the directory holds an empty file named after the mount's owner, and `ctxr shared-stores sync` runs
- **THEN** the command exits with the setup/usage code naming that file's path, and runs no git or `gh` command

#### Scenario: A directory that cannot be read is refused
- **WHEN** `CONTEXTURE_GITHUB_OWNER_TOKENS_DIR` names a path that does not exist
- **THEN** the command exits with the setup/usage code naming the variable

### Requirement: An owner token is never stored or printed
An owner's token SHALL reach `gh` only through the environment of that one `gh` process, and git only through the
environment of that one git process, read by a credential helper passed on the command line. It SHALL NOT be
written into a remote URL, a git configuration file, any file in a store or mount, or any command output.

#### Scenario: Nothing records the token
- **WHEN** `ctxr shared-stores sync` has cloned a mount with an owner's token, and `ctxr session submit` has pushed
  a session in it
- **THEN** the mount's `origin` URL, its git configuration files, its working tree and both commands' output with
  `--json` contain no part of the token

## MODIFIED Requirements

### Requirement: Sync clones absent mounts and fast-forwards present ones, never overwriting local work
`ctxr shared-stores sync` SHALL clone each declared mount that is absent from its location, and SHALL fast-forward
each present mount to its repository's default branch when the mount is on that branch, has no uncommitted changes
to tracked files, and can be fast-forwarded. A present mount that fails any of those conditions SHALL be left
untouched and reported with the condition it failed, as a warning that does not change the exit code. A declared
mount that cannot be cloned or fetched SHALL make the command exit non-zero, naming the mount and the cause. The
command SHALL report, for each mount, whether it was cloned, fast-forwarded from which commit to which, already
current, or left alone and why.

Each clone and fetch SHALL authenticate with the mounted repository's forge credential, resolved for a clone from
the declared URL. When git reports that the forge refused that credential, the cause SHALL name the mount's owner,
the credential kind used, and `CONTEXTURE_GITHUB_OWNER_TOKENS_DIR` as the place an owner's token goes.

#### Scenario: An absent mount is cloned
- **WHEN** a store declares mount `ctx-b` and nothing exists at its location, and `ctxr shared-stores sync` runs
- **THEN** the mounted store's repository is cloned at `shared/ctx-b` on its default branch and the mount is reported as cloned

#### Scenario: A behind mount is fast-forwarded
- **WHEN** the mount `ctx-b` is clean, on its default branch, and behind its remote
- **THEN** sync fast-forwards it and reports the commit it moved from and the commit it moved to

#### Scenario: A mount with local work is left alone
- **WHEN** the mount `ctx-b` has uncommitted changes to tracked files, or is on another branch, or has diverged from its remote
- **THEN** sync does not change it, reports which condition it failed, and exits zero

#### Scenario: An unreachable mount fails the run
- **WHEN** a declared mount's repository cannot be cloned or fetched
- **THEN** sync exits non-zero, naming the mount and the cause, after processing every other mount

#### Scenario: A mount the credential cannot reach names its owner
- **WHEN** the mount `ctx-b` is owned by `ctx-b-org`, the directory holds no file for it, and the forge answers the
  clone with HTTP 403
- **THEN** sync exits non-zero, and the cause names `ctx-b-org`, the `gh` credential, and
  `CONTEXTURE_GITHUB_OWNER_TOKENS_DIR`

### Requirement: Status reports each mount's state without changing anything
`ctxr shared-stores status` SHALL report, for each declared mount, whether it is present, whether its root holds a
store configuration, its current branch and commit, and whether it has uncommitted changes to tracked files. It SHALL
change no file and SHALL run no network operation.

It SHALL also report, for each mount, the forge credential its repository resolves to: `owner-token` with the owner,
`gh`, or `github-app`. It SHALL NOT report any token or any part of one.

#### Scenario: Status reports an absent mount
- **WHEN** a declared mount has not been cloned and `ctxr shared-stores status` runs
- **THEN** the mount is reported as absent, and the command names `ctxr shared-stores sync` as the way to clone it

#### Scenario: Status changes nothing
- **WHEN** `ctxr shared-stores status` runs against any combination of present, absent, and dirty mounts
- **THEN** no file in the mounting store or in any mount changes

#### Scenario: Status names the credential a mount uses
- **WHEN** the directory holds a file for the owner of mount `ctx-b` and none for the owner of mount `ctx-c`
- **THEN** status reports `owner-token` with `ctx-b`'s owner for `ctx-b`, and `gh` for `ctx-c`, without a network call
