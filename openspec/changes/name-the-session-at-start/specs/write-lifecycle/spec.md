## MODIFIED Requirements

### Requirement: Writes happen in a CLI-managed session worktree
`contexture session start` SHALL create an isolated git worktree checked out from a freshly fetched
default branch, and SHALL report that worktree's path as the location where subsequent work should
happen. The store's canonical clone (the one the default branch is checked out in) SHALL NOT be handed
out as a working location for a session.

The command SHALL accept an optional caller-supplied label naming what the session is for, and SHALL
incorporate that label into the name it generates for the session's branch and worktree, so that a
session is identifiable by its subject and not only by when it started. The label SHALL be normalized
by the same rule the store applies to any other caller-supplied name segment, and MAY be shortened to
keep the resulting directory name usable. Supplying a label SHALL NOT be required: with none given,
the command SHALL name the session as it does when the capability is absent, and the generated name
SHALL remain unique without any caller involvement.

Whether or not a label is given, every session SHALL receive its own distinct worktree and branch.
A label SHALL identify at most one session at a time: when a session that still exists already carries
the label, or when the label normalizes to nothing, the command SHALL refuse with the setup/usage exit
code, SHALL name what it refused and why, and SHALL NOT create a worktree, a branch, or any part of
one. A label SHALL become available again once the session holding it no longer exists. The command SHALL NOT alter a
caller-supplied label to resolve a collision. A refusal by the underlying git worktree creation SHALL
likewise be reported with the setup/usage exit code, naming what git refused, and SHALL NOT be
reported as an internal error.

#### Scenario: A session gets its own worktree
- **WHEN** `contexture session start` is run
- **THEN** it creates a new git worktree on a new branch and prints that worktree's path, distinct from the canonical clone's path

#### Scenario: Concurrent sessions do not collide
- **WHEN** two `contexture session start` invocations run one after another without either reaching the default branch first
- **THEN** each receives its own distinct worktree and branch, and work in one does not block or corrupt work in the other

#### Scenario: A labelled session carries its label
- **WHEN** `contexture session start` is run with the label `ctx-a`
- **THEN** the branch it creates and the worktree directory it creates both carry `ctx-a` in their names, and the reported worktree path is that directory

#### Scenario: An unlabelled session is named without caller involvement
- **WHEN** `contexture session start` is run with no label
- **THEN** it creates a session whose generated name is unique without the caller supplying anything, and it neither prompts for a label nor refuses for the lack of one

#### Scenario: A label already carried by a session is refused
- **WHEN** `contexture session start` is run with a label that an existing session already carries, whatever time has passed since that session started
- **THEN** it exits with the setup/usage code naming the existing session's worktree, creates no worktree and no branch, and does not start a session under an altered form of the label

#### Scenario: A label that normalizes to nothing is refused
- **WHEN** `contexture session start` is run with a label that normalizes to an empty name
- **THEN** it exits with the setup/usage code naming the label as unusable, and does not fall back to naming the session as if no label had been given

#### Scenario: A git refusal is reported as a usage error
- **WHEN** the underlying git worktree creation refuses `contexture session start`'s request
- **THEN** the command reports what git refused with the setup/usage exit code, not as an internal error
