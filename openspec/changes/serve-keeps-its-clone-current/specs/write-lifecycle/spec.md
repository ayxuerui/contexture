## ADDED Requirements

### Requirement: A command brings the canonical clone up to date
`ctxr sync` SHALL fetch the forge's default branch into the store's canonical clone and fast-forward the clone to it
by the rule every landing run applies: only when the clone is on the default branch, has no uncommitted changes to
tracked files, and has not diverged. Otherwise it SHALL leave the clone exactly as it was and report which condition
failed, as a warning that keeps the success exit code.

#### Scenario: A clone behind the forge is fast-forwarded
- **WHEN** the canonical clone is clean, on the default branch, and behind the forge, and `ctxr sync` runs
- **THEN** the clone is fast-forwarded and the command reports the commit it moved from and the commit it moved to

#### Scenario: A clone with local work is left alone
- **WHEN** the canonical clone has uncommitted changes to a tracked file, and `ctxr sync` runs
- **THEN** the clone is unchanged, the command exits with the success code, and it reports the uncommitted changes as the reason

### Requirement: The canonical-clone sync fetches as landing does and changes nothing else
`ctxr sync` SHALL authenticate its fetch as landing does, so in App mode it fetches as the App. It SHALL report its
outcome as landing reports `canonical_sync`. A fetch that fails SHALL exit with the setup/usage code, naming the forge
as unreachable. It SHALL push nothing, and SHALL touch no path under `shared/`.

#### Scenario: An unreachable forge is reported
- **WHEN** the fetch fails because the forge cannot be reached
- **THEN** the command exits with the setup/usage code, naming the forge as unreachable, and the clone is unchanged

### Requirement: The canonical-clone sync can keep running, mounts included
`ctxr sync --every <minutes>` SHALL run until stopped, and each round SHALL bring the canonical clone up to date by
the rule above, then refresh the store's mounts as `ctxr shared-stores sync` does. A round that fails SHALL be
reported on stderr and SHALL NOT stop later rounds. `<minutes>` SHALL be a positive whole number. It SHALL use only
the credential of the user running it, so an agents container runs it as the agent's own user.

#### Scenario: Rounds keep the clone and its mounts current
- **WHEN** `ctxr sync --every 5` runs in a store that mounts `ctx-b`, and changes are merged to the store and to `ctx-b`
- **THEN** within five minutes both the canonical clone and `shared/ctx-b` are fast-forwarded

#### Scenario: A failed round does not end the loop
- **WHEN** one round's fetch fails because the forge cannot be reached
- **THEN** the failure is reported on stderr and the next round runs on schedule

### Requirement: A canonical sync never reports a clone current after a failed fetch
Every canonical sync, the one each landing run ends with and the one `ctxr sync` runs, SHALL check that its fetch
succeeded before comparing the clone with the forge's default branch. When the fetch fails, it SHALL report the clone
as not synced, naming the failed fetch and git's first error line, and SHALL NOT report it as current or
fast-forward it.

#### Scenario: A failed fetch is not mistaken for an up-to-date clone
- **WHEN** a landing run's fetch fails and the clone's last-fetched default branch equals its HEAD
- **THEN** the run reports the clone as not synced because the fetch failed, not as already current

### Requirement: Git run for landing and syncing ignores the repository's own hooks and drivers
Every git command `ctxr land`, `ctxr sync` and the store-update runner run SHALL override the repository's hook path
with an empty directory, turn `core.fsmonitor` off, and disable any filter, diff or merge driver the repository's
configuration declares, so that code a repository writer placed in `.git/hooks` or `.git/config` does not run in the
process that holds the forge credential.

#### Scenario: A planted hook does not run during landing
- **WHEN** the canonical clone's `.git/hooks/post-merge` is an executable script and a landing run fast-forwards the clone
- **THEN** the script does not run
