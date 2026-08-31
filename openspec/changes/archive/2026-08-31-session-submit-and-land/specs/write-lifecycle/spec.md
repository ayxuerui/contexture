## Purpose

Extends the write-lifecycle capability (see `bootstrap-contexture-core`): a session is landed by a gated state machine, and submission can rename the session branch.

## ADDED Requirements

### Requirement: A session can be landed end-to-end
`ctxr session land` SHALL resolve the pull request for the current session branch (or one named by `--pr` / `--branch`), report its number, title, and url, and branch on its state: open and mergeable → after an explicit gate, merge with the configured or requested method and confirm the forge reports merged; already merged → skip to synchronization; closed → stop; conflicting or unknown → stop with the conflict guidance. It SHALL then synchronize the default branch in the root checkout by fast-forward only, reporting rather than forcing a checkout that will not fast-forward, and with `--reap` SHALL remove the session's worktree only when it was created by `session start`, is clean, and the pull request is merged. The gate SHALL be an interactive confirmation or `--yes`; with `--no-input` and no `--yes` the command SHALL fail before any side effect. It SHALL refuse to run on the default branch and when the resolved head branch differs from the branch requested. A retry SHALL re-read state and perform only the remaining steps.

#### Scenario: A mergeable session lands
- **WHEN** the session branch has an open, mergeable pull request and the gate is passed
- **THEN** it is merged, the forge reports merged, the root checkout's default branch is fast-forwarded, and the report names each step

#### Scenario: A conflicting session stops before any side effect
- **WHEN** the pull request reports conflicts
- **THEN** nothing is merged or removed and the command exits with a distinct error naming the conflict guidance

#### Scenario: Non-interactive without consent
- **WHEN** the command runs with `--no-input` and without `--yes`
- **THEN** it exits with a distinct error before reading or changing anything on the forge

#### Scenario: A retry performs only what remains
- **WHEN** a previous run merged the pull request but failed before synchronizing, and the command runs again
- **THEN** it observes the merged state, skips the merge, synchronizes, and reports the merge as already done

#### Scenario: A diverged root checkout is reported, not forced
- **WHEN** the root checkout is on another branch or cannot fast-forward
- **THEN** the command reports what it found and leaves the checkout unchanged

### Requirement: Submission can rename the session branch
`ctxr session submit --branch <name>` SHALL rename the current session branch to the given name before pushing and opening the pull request, and the worktree SHALL remain a recognized session worktree afterwards.

#### Scenario: Rename before push
- **WHEN** a session on a generated branch name submits with `--branch topic/x`
- **THEN** the pushed branch and the pull request head are `topic/x`, and `session list` still shows the worktree
