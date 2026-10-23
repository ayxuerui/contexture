## Purpose

Lets a store mount other stores, so one person's checkout holds their own notes plus the stores they share with
others, while every mounted store keeps governing its own notes, writes, and review.

## ADDED Requirements

### Requirement: A store declares the stores it mounts, and declaring none mounts nothing
A store's configuration MAY carry a `shared_stores` list naming the stores it mounts. Each entry SHALL name the
mount and give the clone URL of the mounted store's repository. A mount's name SHALL be a single path segment that
is unchanged by slugification, and no two entries SHALL share a name; loading a configuration that breaks either
rule SHALL fail, naming the entry. Each mount SHALL be placed at `shared/<name>` relative to the store root. The
location is fixed, not configurable, because path links written into notes carry it (per context-retrieval) and must
mean the same thing in every store.

The list SHALL carry no schema default: a store whose configuration has no `shared_stores` key mounts nothing, and
no command that reads or writes the configuration SHALL add the key to a store that did not declare it.

#### Scenario: A store with no list mounts nothing
- **WHEN** a store's configuration has no `shared_stores` key
- **THEN** every command behaves as it did before this capability existed, and writing the configuration back does not add the key

#### Scenario: A mount is placed under the fixed location
- **WHEN** a store declares a mount named `ctx-b`
- **THEN** that mount's location is `shared/ctx-b` relative to the store root

#### Scenario: A mount name that is not one plain segment is refused
- **WHEN** a store declares a mount whose name contains a `/` or changes under slugification
- **THEN** loading the configuration fails, naming the entry and the rule it breaks

#### Scenario: Two mounts with one name are refused
- **WHEN** a store declares two mounts with the same name
- **THEN** loading the configuration fails, naming the duplicated name

### Requirement: Sync clones absent mounts and fast-forwards present ones, never overwriting local work
`ctxr shared-stores sync` SHALL clone each declared mount that is absent from its location, and SHALL fast-forward
each present mount to its repository's default branch when the mount is on that branch, has no uncommitted changes
to tracked files, and can be fast-forwarded. A present mount that fails any of those conditions SHALL be left
untouched and reported with the condition it failed, as a warning that does not change the exit code. A declared
mount that cannot be cloned or fetched SHALL make the command exit non-zero, naming the mount and the cause. The
command SHALL report, for each mount, whether it was cloned, fast-forwarded from which commit to which, already
current, or left alone and why.

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

### Requirement: The mounting store's git ignores `shared/` without a tracked change
`ctxr shared-stores sync` SHALL keep an entry for `shared/` in the mounting repository's local exclude file, which
git shares across all of that repository's worktrees, so that mounted files are untracked in the mounting store. It
SHALL NOT write the entry into any tracked file, because a tracked change made outside a session would leave the
canonical clone with uncommitted changes, which blocks its fast-forward. A store with no `shared_stores` key SHALL
get no such entry. The untracked-mount check is the enforcement; the exclude entry only prevents accidental adds.

#### Scenario: Sync writes the local exclude entry
- **WHEN** `ctxr shared-stores sync` runs in a store that declares mounts
- **THEN** the repository's local exclude file carries an entry for `shared/`, and `git status` in the mounting store lists nothing under that path

#### Scenario: Sync changes no tracked file of the mounting store
- **WHEN** `ctxr shared-stores sync` runs in a clean mounting store
- **THEN** `git status` in the mounting store still reports no uncommitted change to any tracked file

### Requirement: Status reports each mount's state without changing anything
`ctxr shared-stores status` SHALL report, for each declared mount, whether it is present, whether its root holds a
store configuration, its current branch and commit, and whether it has uncommitted changes to tracked files. It SHALL
change no file and SHALL run no network operation.

#### Scenario: Status reports an absent mount
- **WHEN** a declared mount has not been cloned and `ctxr shared-stores status` runs
- **THEN** the mount is reported as absent, and the command names `ctxr shared-stores sync` as the way to clone it

#### Scenario: Status changes nothing
- **WHEN** `ctxr shared-stores status` runs against any combination of present, absent, and dirty mounts
- **THEN** no file in the mounting store or in any mount changes

### Requirement: Only a mount whose root is a store joins the read view
A present mount SHALL contribute notes to the mounting store's read view only when its root holds a store
configuration that loads. A mount whose root has no store configuration, or whose configuration fails to load, SHALL
contribute nothing and SHALL be reported by `ctxr shared-stores status` with the reason.

#### Scenario: A mount without a store configuration contributes nothing
- **WHEN** a mount's root holds no `contexture.yaml`
- **THEN** none of its files appear in the mounting store's graph or retrieval pass, and status reports that the mount is not a store

### Requirement: Mounts are not followed through a mounted store
The mounting store SHALL clone and read only the mounts its own configuration declares. A `shared_stores` key in a
mounted store's configuration SHALL NOT cause anything to be cloned into, or read from, the mounting store's
checkout.

#### Scenario: A mounted store's own mounts are ignored
- **WHEN** store `ctx-a` mounts `ctx-b`, and `ctx-b`'s configuration declares a mount `ctx-c`, and `ctxr shared-stores sync` runs in `ctx-a`
- **THEN** nothing of `ctx-c` is cloned into `ctx-a`'s checkout, and no note of `ctx-c` enters `ctx-a`'s read view

### Requirement: A write to a mounted store goes through that store's own write lifecycle
A command that starts a session SHALL, when run from inside a mount, start that session in the mounted store: its
worktree under the mounted store's configured worktrees path and its branch on the mounted store's repository. The
mounted store's own hooks, checks, and change approval SHALL govern that session's commits and its landing. This is
enforced by root resolution resolving to the mount (per harness-portability) and by the mounted store's own commit
gate.

#### Scenario: A session started inside a mount belongs to the mount
- **WHEN** `ctxr session start` runs from inside `shared/ctx-b` of store `ctx-a`
- **THEN** the session's worktree is created under `ctx-b`'s worktrees path, its branch exists in `ctx-b`'s repository, and nothing is created in `ctx-a`

### Requirement: A shared note naming a note of the mounting store is reported
`ctxr lint` in the mounting store SHALL report, as an observation, every link in a mounted note that resolves to no
note within its own store but whose target would resolve among the mounting store's own notes, naming the mounted
note, the link target, and the mounting store's note it names. Such a link exposes the name of a note the mounted
store's other readers cannot read. Lint reports and never fails (per context-organize); the mounted store's own
review is where the link is removed.

#### Scenario: A shared note's dangling link to a private note is reported
- **WHEN** a note in mount `ctx-b` links `[[ctx-private]]`, `ctx-b` holds no such note, and `ctx-a` holds `ctx-private.md`
- **THEN** `ctxr lint` in `ctx-a` reports the link, naming the mounted note, the target, and `ctx-private.md`

#### Scenario: A shared note's link to a missing note is not reported as a disclosure
- **WHEN** a note in mount `ctx-b` links a target that resolves in neither `ctx-b` nor `ctx-a`
- **THEN** this observation does not report it; it remains an ordinary dangling link of `ctx-b`

### Requirement: The mounting store never tracks mounted content
`ctxr doctor` SHALL fail its shared-stores check, naming each path, when any path under `shared/` is tracked in the mounting store or staged for commit in it. Because the pre-commit hook runs `doctor
--staged`, a commit in the mounting store that stages mounted content SHALL be refused.

#### Scenario: Staged mounted content is refused at commit
- **WHEN** a file under `shared/ctx-b` is force-added to the mounting store's index and a commit is attempted
- **THEN** the pre-commit hook's `doctor --staged` fails the shared-stores check, names the path, and the commit is refused

#### Scenario: A store with untracked mounts passes
- **WHEN** every declared mount is present and nothing under `shared/` is tracked or staged
- **THEN** the shared-stores check passes
