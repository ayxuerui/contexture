## ADDED Requirements

### Requirement: One landing runs per repository at a time
`ctxr land` SHALL hold an exclusive lock in the repository's common git directory for the whole of a run, and
SHALL release it when the run ends, however it ends. A lock left by a process that no longer exists SHALL be
taken over. When another live process holds the lock, `ctxr land --pending` SHALL do nothing and exit `0`,
reporting a notice that names the holder. `ctxr land <pr>` SHALL exit with the failed-check code with a finding
naming the holder, and SHALL perform no side effect.

#### Scenario: A concurrent sweep steps aside
- **WHEN** `ctxr land --pending` starts while another `ctxr land` is running against the same repository
- **THEN** it exits `0` without reading the forge, and reports that a landing is already running, with that
  process's id

#### Scenario: A stale lock is taken over
- **WHEN** the lock names a process id that no longer exists
- **THEN** `ctxr land` takes the lock and runs

### Requirement: Landing commits on a host with no git identity
When git has no committer name or email configured for the checkout `ctxr land` rebases in, the command SHALL
commit the rebase with the recording login as the committer's name, and an address in the forge's no-reply
domain as the committer's email. It SHALL pass that identity in the git process's environment only, and SHALL
NOT write it to any git configuration. A configured identity SHALL be used as it is.

#### Scenario: A bare host rebases
- **WHEN** `ctxr land` catches up an approved branch on a host where `git config user.email` returns nothing
- **THEN** the rebase succeeds, its commits name the recording login as committer, and the repository's git
  configuration is unchanged
