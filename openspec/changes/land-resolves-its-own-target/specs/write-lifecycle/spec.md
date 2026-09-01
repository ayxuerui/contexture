## MODIFIED Requirements

### Requirement: A session can be landed end-to-end
`ctxr session land` SHALL resolve its target branch before anything else, from exactly one source: `--branch <name>` names it outright; `--pr <n>` without `--branch` names it by way of that pull request's head branch; with neither, it is the branch checked out where the command was invoked. It SHALL resolve the target's pull request, report its number, title, and url, and branch on its state: open and mergeable → after an explicit gate, merge with the configured or requested method and confirm the forge reports merged; already merged → skip to synchronization; closed → stop; conflicting or unknown → stop with the conflict guidance. It SHALL then synchronize the default branch in the store's canonical clone — the repository's main worktree, whichever checkout the command was invoked from — by fast-forward only, reporting rather than forcing a clone that is on another branch or cannot fast-forward. With `--reap` it SHALL remove the session's worktree only when it was created by `session start`, is clean, and the pull request is merged, and SHALL refuse when the command is running from inside that worktree, naming the canonical clone as where to retry. The gate SHALL be an interactive confirmation or `--yes`; with `--no-input` and no `--yes` the command SHALL fail before any side effect. It SHALL refuse to land the default branch — before contacting the forge when the target came from `--branch` or from the invoking checkout, and on the head branch when the target came from `--pr` — and SHALL refuse when a target named by `--branch` or by the invoking checkout differs from the pull request's head branch. Its report SHALL name the outcome of every step and, for any step it did not perform, the reason. A retry SHALL re-read state and perform only the remaining steps.

#### Scenario: A mergeable session lands
- **WHEN** the session branch has an open, mergeable pull request and the gate is passed
- **THEN** it is merged, the forge reports merged, the canonical clone's default branch is fast-forwarded, and the report names each step

#### Scenario: A pull request named by number alone lands
- **WHEN** the command is invoked with `--pr <n>` and no `--branch`, from a checkout that is on the default branch
- **THEN** the target is that pull request's head branch, the invoking checkout's own branch is neither the target nor grounds for refusal, and the landing proceeds through the gate as usual

#### Scenario: Landing from inside the session worktree still synchronizes
- **WHEN** the command is invoked from the session worktree it is landing, and the canonical clone is on the default branch
- **THEN** the pull request is merged and the canonical clone is fast-forwarded, and with `--reap` the worktree is left in place with the report naming both the reason and the canonical clone as where to retry

#### Scenario: A conflicting session stops before any side effect
- **WHEN** the pull request reports conflicts
- **THEN** nothing is merged or removed and the command exits with a distinct error naming the conflict guidance

#### Scenario: Non-interactive without consent
- **WHEN** the command runs with `--no-input` and without `--yes`
- **THEN** it exits with a distinct error before reading or changing anything on the forge

#### Scenario: The default branch is refused however it was named
- **WHEN** the target resolves to the default branch — named by `--branch`, checked out where the command was invoked, or carried as the head branch of the pull request named by `--pr`
- **THEN** the command exits with a distinct error and merges nothing, and in the first two cases it does so without contacting the forge

#### Scenario: A retry performs only what remains
- **WHEN** a previous run merged the pull request but failed before synchronizing, and the command runs again
- **THEN** it observes the merged state, skips the merge, synchronizes, and reports the merge as already done

#### Scenario: A diverged root checkout is reported, not forced
- **WHEN** the canonical clone — the checkout the default branch lives in, whichever checkout the command was invoked from — is on another branch or cannot fast-forward
- **THEN** the command reports what it found and leaves that clone unchanged

#### Scenario: Every step that did not happen says why
- **WHEN** a run merges the pull request but does not synchronize, or does not reap
- **THEN** the report names a reason for each step it did not perform, whether or not that step was attempted
